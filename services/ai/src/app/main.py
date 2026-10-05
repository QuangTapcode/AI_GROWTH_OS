"""FastAPI boundary for W1-AI-01.

Durability belongs to the TypeScript worker in a later task. This bootstrap keeps
only an in-memory run registry so contract and provider behavior can be verified
without pretending that the production queue already exists.
"""

from __future__ import annotations

import asyncio
import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException, status
from fastapi.responses import JSONResponse

from .config import Settings
from .logging_config import configure_logging, log_event
from .providers import ProviderError, build_provider
from .schemas import AIResult, HealthResponse, JobRequest, PROMPT_VERSION, RunStatus


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    logger = configure_logging()
    provider = build_provider(settings)
    app = FastAPI(title="AI Growth OS AI Service", version="0.1.0")
    app.state.settings = settings
    app.state.provider = provider
    app.state.runs: dict[UUID, RunStatus] = {}
    app.state.run_tasks: dict[UUID, asyncio.Task[None]] = {}

    async def require_internal_auth(authorization: str | None) -> None:
        expected = settings.internal_ai_auth_token
        if expected and not authorization:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing internal auth")
        if expected:
            scheme, _, supplied = authorization.partition(" ")
            if scheme.lower() != "bearer" or not secrets.compare_digest(supplied, expected):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid internal auth")

    async def execute_run(job: JobRequest, run_id: UUID) -> None:
        run = app.state.runs[run_id]
        run.status = "running"
        timeout_seconds = min(
            job.constraints.timeout_seconds,
            settings.provider_timeout_seconds,
            settings.job_deadline_seconds,
        )
        log_event(
            logger,
            "ai_run_started",
            run_id=str(run_id),
            job_id=str(job.job_id),
            tenant=str(job.workspace_id),
            operation=job.operation,
            model=provider.model_version,
            prompt_version=PROMPT_VERSION,
            timeout_seconds=timeout_seconds,
        )
        try:
            output, usage = await asyncio.wait_for(
                provider.generate(job),
                timeout=timeout_seconds,
            )
            result = AIResult(
                run_id=run_id,
                operation=job.operation,
                result=output.result,
                evidence=output.evidence,
                warnings=output.warnings,
                usage=usage,
                model_version=provider.model_version,
                prompt_version=PROMPT_VERSION,
                input_version=job.input_version,
                trace_id=job.trace_id,
            )
            run.result = result
            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            log_event(
                logger,
                "ai_run_completed",
                run_id=str(run_id),
                job_id=str(job.job_id),
                tenant=str(job.workspace_id),
                operation=job.operation,
                model=provider.model_version,
                prompt_version=PROMPT_VERSION,
                input_tokens=usage.input_tokens,
                output_tokens=usage.output_tokens,
                total_tokens=usage.total_tokens,
                latency_ms=usage.latency_ms,
                timeout_seconds=timeout_seconds,
            )
        except asyncio.TimeoutError:
            run.status = "failed"
            run.error_code = "PROVIDER_TIMEOUT"
            run.error_message = "AI provider timed out"
            run.completed_at = datetime.now(timezone.utc)
            log_event(logger, "ai_run_failed", run_id=str(run_id), job_id=str(job.job_id), tenant=str(job.workspace_id), operation=job.operation, error_code=run.error_code)
        except ProviderError as exc:
            run.status = "failed"
            run.error_code = exc.code
            run.error_message = str(exc)
            run.completed_at = datetime.now(timezone.utc)
            log_event(logger, "ai_run_failed", run_id=str(run_id), job_id=str(job.job_id), tenant=str(job.workspace_id), operation=job.operation, error_code=exc.code)
        except Exception:
            run.status = "failed"
            run.error_code = "AI_SERVICE_ERROR"
            run.error_message = "AI service failed while processing the run"
            run.completed_at = datetime.now(timezone.utc)
            logger.exception("AI run failed unexpectedly")

    @app.get("/healthz", response_model=HealthResponse)
    async def healthz() -> HealthResponse:
        return HealthResponse(status="ok", service="ai-growth-os-ai", provider_mode=settings.provider_mode, model=provider.model_version)

    @app.get("/readyz", response_model=HealthResponse)
    async def readyz() -> HealthResponse:
        if settings.provider_mode == "live":
            # Keep readiness local and bounded; no model call/download is triggered.
            try:
                async with __import__("httpx").AsyncClient(timeout=3) as client:
                    response = await client.get(f"{settings.ollama_base_url}/api/tags")
                    response.raise_for_status()
            except Exception as exc:
                raise HTTPException(status_code=503, detail="Local Ollama is not ready") from exc
        return HealthResponse(status="ok", service="ai-growth-os-ai", provider_mode=settings.provider_mode, model=provider.model_version)

    @app.post("/internal/v1/runs", response_model=RunStatus, status_code=status.HTTP_202_ACCEPTED)
    async def create_run(job: JobRequest, authorization: str | None = Header(default=None)) -> JSONResponse:
        await require_internal_auth(authorization)
        if job.schema_version != "1.0.0":
            raise HTTPException(status_code=422, detail="Unsupported schema_version")
        if job.job_id in app.state.runs:
            existing = app.state.runs[job.job_id]
            return JSONResponse(status_code=status.HTTP_200_OK, content=existing.model_dump(mode="json"))
        run = RunStatus(run_id=job.job_id, job_id=job.job_id, workspace_id=job.workspace_id, operation=job.operation, status="queued")
        app.state.runs[job.job_id] = run
        app.state.run_tasks[job.job_id] = asyncio.create_task(execute_run(job, job.job_id))
        timeout_seconds = min(job.constraints.timeout_seconds, settings.provider_timeout_seconds, settings.job_deadline_seconds)
        log_event(logger, "ai_run_accepted", run_id=str(job.job_id), job_id=str(job.job_id), tenant=str(job.workspace_id), operation=job.operation, model=provider.model_version, prompt_version=PROMPT_VERSION, timeout_seconds=timeout_seconds)
        return JSONResponse(status_code=status.HTTP_202_ACCEPTED, content=run.model_dump(mode="json"))

    @app.get("/internal/v1/runs/{run_id}", response_model=RunStatus)
    async def get_run(run_id: UUID, authorization: str | None = Header(default=None)) -> RunStatus:
        await require_internal_auth(authorization)
        run = app.state.runs.get(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found")
        return run

    return app


app = create_app()
