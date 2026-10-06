"""FastAPI boundary for the internal AI run contract (contracts/README.md §3).

Runs are persisted in a local SQLite store keyed by ``job_id + operation +
input_version``. The worker still owns the business job; this service guarantees
that a run is only reported ``completed`` after its result is stored, that a
restart turns unfinished runs into a retryable failure, and that retries never
exceed the per-job provider call cap.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid5

import httpx
from fastapi import FastAPI, Header
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .config import Settings
from .errors import APIError, install_error_handling
from .logging_config import configure_logging, log_event
from .operations import OPERATIONS, Operation
from .providers import Provider, ProviderError, build_provider
from .run_store import RunStore
from .runtime import CallBudget, OperationError, RunContext
from .schemas import SCHEMA_VERSION, AIResult, HealthResponse, JobRequest, RunStatus


RUN_NAMESPACE = UUID("6f1c2d3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f")


def create_app(settings: Settings | None = None, provider: Provider | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    logger = configure_logging()
    provider = provider or build_provider(settings)
    store = RunStore(settings.run_store_path)
    interrupted = store.recover_interrupted()
    if interrupted:
        log_event(logger, "ai_runs_marked_interrupted", count=interrupted)

    app = FastAPI(title="AI Growth OS AI Service", version="0.2.0")
    install_error_handling(app, max_request_bytes=settings.max_request_bytes, logger=logger)
    app.state.settings = settings
    app.state.provider = provider
    app.state.store = store
    app.state.run_tasks: dict[UUID, asyncio.Task[None]] = {}
    # PILOT_LIMITS: one AI job running at a time on the shared GPU.
    concurrency = asyncio.Semaphore(1)

    def require_internal_auth(authorization: str | None) -> None:
        expected = settings.internal_ai_auth_token
        if not expected:
            return
        if not authorization:
            raise APIError(401, "UNAUTHORIZED", "Missing internal auth")
        scheme, _, supplied = authorization.partition(" ")
        if scheme.lower() != "bearer" or not secrets.compare_digest(supplied, expected):
            raise APIError(401, "UNAUTHORIZED", "Invalid internal auth")

    def model_version_for(operation: Operation) -> str:
        return provider.embedding_model_version if operation.deadline_kind == "embedding" else provider.model_version

    def call_cap(job: JobRequest) -> int:
        requested = job.constraints.max_provider_calls
        return min(settings.max_provider_calls, requested) if requested else settings.max_provider_calls

    def deadline_seconds(job: JobRequest, operation: Operation) -> int:
        limit = settings.embedding_job_deadline_seconds if operation.deadline_kind == "embedding" else settings.job_deadline_seconds
        return min(job.constraints.timeout_seconds, limit)

    def request_hash(job: JobRequest) -> str:
        # trace_id may change between retries of the same logical request.
        canonical = json.dumps(job.model_dump(mode="json", exclude={"trace_id"}), sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def validate_job(job: JobRequest) -> tuple[Operation, Any]:
        if job.schema_version != SCHEMA_VERSION:
            raise APIError(422, "UNSUPPORTED_SCHEMA_VERSION", f"Supported schema_version is {SCHEMA_VERSION}")
        operation = OPERATIONS.get(job.operation)
        if operation is None:
            raise APIError(422, "UNSUPPORTED_OPERATION", f"Unknown operation {job.operation}", {"supported": sorted(OPERATIONS)})
        if job.prompt_version and job.prompt_version != operation.prompt_version:
            raise APIError(409, "PROMPT_VERSION_MISMATCH", "Pinned prompt_version differs from the service", {"expected": operation.prompt_version})
        if job.model_version and job.model_version != model_version_for(operation):
            raise APIError(409, "MODEL_VERSION_MISMATCH", "Pinned model_version differs from the service", {"expected": model_version_for(operation)})
        if operation.payload_model is None:
            return operation, job.payload
        try:
            payload = operation.payload_model.model_validate(job.payload)
        except ValidationError as exc:
            details = [
                {"field": "payload." + ".".join(str(part) for part in error["loc"]), "type": error["type"], "message": error["msg"]}
                for error in exc.errors()
            ]
            raise APIError(422, "INVALID_PAYLOAD", f"Payload does not match the {operation.name} schema", details) from exc
        problems = operation.validate(job, payload, settings) if operation.validate else []
        if problems:
            raise APIError(422, problems[0][0], problems[0][1], [{"code": code, "message": message} for code, message in problems])
        return operation, payload

    async def execute_run(run_id: UUID, job: JobRequest, operation: Operation, payload: Any) -> None:
        fields = {"run_id": str(run_id), "job_id": str(job.job_id), "tenant": str(job.workspace_id), "operation": job.operation}
        try:
            async with concurrency:
                row = store.get(run_id)
                remaining = (datetime.fromisoformat(row["deadline_at"]) - datetime.now(timezone.utc)).total_seconds()
                if remaining <= 0:
                    store.fail(run_id, "DEADLINE_EXCEEDED", "Run deadline passed before execution", retryable=False)
                    log_event(logger, "ai_run_failed", **fields, error_code="DEADLINE_EXCEEDED")
                    return
                store.mark_running(run_id)
                ctx = RunContext(job, payload, settings, provider, CallBudget(store, str(job.job_id), call_cap(job)), logger)
                log_event(
                    logger,
                    "ai_run_started",
                    **fields,
                    attempt=row["attempt"],
                    model=model_version_for(operation),
                    prompt_version=operation.prompt_version,
                    timeout_seconds=int(remaining),
                )
                try:
                    outcome = await asyncio.wait_for(operation.handler(ctx), timeout=remaining)
                except asyncio.TimeoutError:
                    store.fail(run_id, "DEADLINE_EXCEEDED", "Run exceeded its deadline", retryable=False)
                    log_event(logger, "ai_run_failed", **fields, error_code="DEADLINE_EXCEEDED")
                    return
                except (OperationError, ProviderError) as exc:
                    store.fail(run_id, exc.code, str(exc), retryable=exc.retryable)
                    log_event(logger, "ai_run_failed", **fields, error_code=exc.code, retryable=exc.retryable)
                    return
                result = AIResult(
                    run_id=run_id,
                    operation=job.operation,
                    result=outcome.result,
                    evidence=outcome.evidence,
                    warnings=outcome.warnings,
                    usage=ctx.usage,
                    model_version=model_version_for(operation),
                    prompt_version=operation.prompt_version,
                    input_version=job.input_version,
                    trace_id=job.trace_id,
                )
                store.complete(run_id, result)
                log_event(
                    logger,
                    "ai_run_completed",
                    **fields,
                    model=result.model_version,
                    prompt_version=result.prompt_version,
                    input_tokens=ctx.usage.input_tokens,
                    output_tokens=ctx.usage.output_tokens,
                    total_tokens=ctx.usage.total_tokens,
                    llm_calls=ctx.usage.llm_calls,
                    embedding_calls=ctx.usage.embedding_calls,
                    latency_ms=ctx.usage.latency_ms,
                )
        except Exception:
            logger.exception("AI run failed unexpectedly")
            store.fail(run_id, "AI_SERVICE_ERROR", "AI service failed while processing the run", retryable=False)
        finally:
            app.state.run_tasks.pop(run_id, None)

    def start(run_id: UUID, job: JobRequest, operation: Operation, payload: Any) -> None:
        app.state.run_tasks[run_id] = asyncio.create_task(execute_run(run_id, job, operation, payload))

    def respond(row: sqlite3.Row, status_code: int) -> JSONResponse:
        return JSONResponse(status_code=status_code, content=store.to_status(row).model_dump(mode="json"))

    @app.get("/healthz", response_model=HealthResponse)
    async def healthz() -> HealthResponse:
        return HealthResponse(
            status="ok",
            service="ai-growth-os-ai",
            provider_mode=settings.provider_mode,
            model=provider.model_version,
            embedding_model=provider.embedding_model_version,
        )

    @app.get("/readyz", response_model=HealthResponse)
    async def readyz() -> HealthResponse:
        if settings.provider_mode == "live":
            # Bounded local check; never triggers a model download or a generation.
            try:
                async with httpx.AsyncClient(timeout=3) as client:
                    response = await client.get(f"{settings.ollama_base_url}/api/tags")
                    response.raise_for_status()
                    names = {model.get("name") for model in response.json().get("models", [])}
            except Exception as exc:
                raise APIError(503, "PROVIDER_UNAVAILABLE", "Local Ollama is not ready") from exc
            missing = sorted({settings.llm_model, settings.embedding_model} - names)
            if missing:
                raise APIError(503, "MODEL_NOT_AVAILABLE", "Configured model is not pulled locally", {"missing": missing})
        return await healthz()

    @app.post("/internal/v1/runs", response_model=RunStatus, status_code=202)
    async def create_run(job: JobRequest, authorization: str | None = Header(default=None)) -> JSONResponse:
        require_internal_auth(authorization)
        operation, payload = validate_job(job)
        digest = request_hash(job)
        row = store.find(job.job_id, job.operation, job.input_version)

        if row is None:
            run_id = uuid5(RUN_NAMESPACE, f"{job.job_id}:{job.operation}:{job.input_version}")
            deadline_at = datetime.now(timezone.utc) + timedelta(seconds=deadline_seconds(job, operation))
            try:
                store.insert(
                    run_id=run_id,
                    job_id=job.job_id,
                    workspace_id=job.workspace_id,
                    operation=job.operation,
                    input_version=job.input_version,
                    request_hash=digest,
                    max_provider_calls=call_cap(job),
                    deadline_at=deadline_at,
                )
            except sqlite3.IntegrityError:
                row = store.find(job.job_id, job.operation, job.input_version)
            else:
                start(run_id, job, operation, payload)
                log_event(
                    logger,
                    "ai_run_accepted",
                    run_id=str(run_id),
                    job_id=str(job.job_id),
                    tenant=str(job.workspace_id),
                    operation=job.operation,
                    input_version=job.input_version,
                    model=model_version_for(operation),
                    prompt_version=operation.prompt_version,
                )
                return respond(store.get(run_id), 202)

        run_id = UUID(row["run_id"])
        if row["request_hash"] != digest:
            raise APIError(
                409,
                "IDEMPOTENCY_CONFLICT",
                "This job_id + operation + input_version was already submitted with a different request",
                {"run_id": str(run_id)},
            )
        if row["status"] == "failed" and row["retryable"]:
            if row["attempt"] >= settings.max_run_attempts:
                store.set_not_retryable(run_id)
            elif datetime.fromisoformat(row["deadline_at"]) <= datetime.now(timezone.utc):
                store.fail(run_id, "DEADLINE_EXCEEDED", "Run deadline passed; create a new input_version", retryable=False)
            else:
                store.requeue(run_id)
                start(run_id, job, operation, payload)
                log_event(logger, "ai_run_resumed", run_id=str(run_id), job_id=str(job.job_id), operation=job.operation)
                return respond(store.get(run_id), 202)
        return respond(store.get(run_id), 200)

    @app.get("/internal/v1/runs/{run_id}", response_model=RunStatus)
    async def get_run(run_id: UUID, authorization: str | None = Header(default=None)) -> JSONResponse:
        require_internal_auth(authorization)
        row = store.get(run_id)
        if row is None:
            raise APIError(404, "RUN_NOT_FOUND", "Run not found")
        return respond(row, 200)

    return app



_app: FastAPI | None = None


def __getattr__(name: str) -> FastAPI:
    """``uvicorn src.app.main:app`` builds the app on first access.

    Importing ``create_app`` (tests, evals) therefore never opens the real run store,
    whose startup recovery would mark a running service's in-flight runs as interrupted.
    """

    global _app
    if name != "app":
        raise AttributeError(name)
    if _app is None:
        _app = create_app()
    return _app
