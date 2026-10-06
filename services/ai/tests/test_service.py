"""W1-QQ-01/02: health, error envelope, durable idempotent runs, call cap and deadlines."""

from __future__ import annotations

import asyncio
import time
from typing import Any
from uuid import uuid4

from conftest import run_job, wait_for_run
from evals.fixtures import WS_A, ingest_text_payload, job as make_job
from src.app.providers import ProviderError
from src.app.schemas import Usage


def generic_job(**overrides: Any) -> dict[str, Any]:
    body = {
        "schema_version": "1.0.0",
        "job_id": str(uuid4()),
        "workspace_id": str(uuid4()),
        "operation": "content.generate",
        "input_version": 1,
        "trace_id": "test-trace",
        "synthetic": True,
    }
    body.update(overrides)
    return body


class ScriptedProvider:
    """Provider double: each chat_json call pops the next action."""

    model_version = "test/scripted"
    embedding_model_version = "test/embed"

    def __init__(self, actions: list[Any]) -> None:
        self.actions = actions
        self.calls = 0

    async def chat_json(self, *, fake, **_: Any):  # type: ignore[no-untyped-def]
        self.calls += 1
        action = self.actions.pop(0) if self.actions else "fake"
        if action == "hang":
            await asyncio.sleep(3600)
        if action == "unavailable":
            raise ProviderError("PROVIDER_UNAVAILABLE", "down", retryable=True)
        if action == "bad_json":
            return "not json", Usage(llm_calls=1)
        import json

        return json.dumps(fake()), Usage(llm_calls=1)

    async def embed(self, texts: list[str]):  # type: ignore[no-untyped-def]
        return [[0.0] * 768 for _ in texts], Usage(embedding_calls=1)


def test_health_reports_mode_and_models(client) -> None:
    body = client.get("/healthz").json()
    assert body["status"] == "ok"
    assert body["provider_mode"] == "fake"
    assert body["embedding_model"] == "fake/hashed-768"
    assert client.get("/readyz").status_code == 200


def test_bad_input_returns_coded_error_envelope(client) -> None:
    response = client.post("/internal/v1/runs", json={"job_id": "not-a-uuid"}, headers={"X-Request-ID": "req-123"})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "INVALID_REQUEST"
    assert error["request_id"] == "req-123"
    assert response.headers["X-Request-ID"] == "req-123"
    assert {"field": "job_id", "type": "uuid_parsing"}.items() <= error["details"][0].items()
    assert "not-a-uuid" not in response.text  # submitted values are not echoed

    malformed = client.post("/internal/v1/runs", content="{oops", headers={"content-type": "application/json"})
    assert malformed.status_code == 422
    assert malformed.json()["error"]["code"] == "INVALID_JSON"


def test_unsupported_schema_operation_and_payload_codes(client) -> None:
    cases = [
        (generic_job(schema_version="2.0.0"), 422, "UNSUPPORTED_SCHEMA_VERSION"),
        (generic_job(operation="publish.everything"), 422, "UNSUPPORTED_OPERATION"),
        (generic_job(operation="knowledge.ingest", payload={}), 422, "INVALID_PAYLOAD"),
        (generic_job(prompt_version="w0-old"), 409, "PROMPT_VERSION_MISMATCH"),
        (generic_job(model_version="ollama/other"), 409, "MODEL_VERSION_MISMATCH"),
    ]
    for body, status, code in cases:
        response = client.post("/internal/v1/runs", json=body)
        assert response.status_code == status, (code, response.text)
        assert response.json()["error"]["code"] == code


def test_auth_not_found_and_size_limit(make_client) -> None:
    client = make_client(internal_ai_auth_token="secret-token", max_request_bytes=2048)
    assert client.post("/internal/v1/runs", json=generic_job()).json()["error"]["code"] == "UNAUTHORIZED"
    wrong = client.get(f"/internal/v1/runs/{uuid4()}", headers={"Authorization": "Bearer nope"})
    assert wrong.status_code == 401
    missing = client.get(f"/internal/v1/runs/{uuid4()}", headers={"Authorization": "Bearer secret-token"})
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "RUN_NOT_FOUND"
    big = client.post(
        "/internal/v1/runs",
        json=generic_job(payload={"blob": "x" * 4096}),
        headers={"Authorization": "Bearer secret-token"},
    )
    assert big.status_code == 413
    assert big.json()["error"]["code"] == "PAYLOAD_TOO_LARGE"


def test_generic_operation_completes_with_fake_provider(client) -> None:
    body = run_job(client, generic_job())
    assert body["status"] == "completed"
    assert body["result"]["warnings"] == ["FAKE_PROVIDER_NO_LIVE_EVIDENCE"]
    assert body["result"]["prompt_version"] == "w1-bootstrap-1"
    assert body["provider_calls"] == 1


def test_create_returns_immediately_and_deadline_fails_run(make_client) -> None:
    client = make_client(provider=ScriptedProvider(["hang"]))
    started = time.perf_counter()
    accepted = client.post("/internal/v1/runs", json=generic_job(constraints={"timeout_seconds": 1}))
    assert accepted.status_code == 202
    assert time.perf_counter() - started < 0.5
    body = wait_for_run(client, accepted.json()["run_id"], timeout=5)
    assert body["status"] == "failed"
    assert body["error_code"] == "DEADLINE_EXCEEDED"
    assert body["retryable"] is False


def test_idempotency_key_is_job_operation_input_version(client) -> None:
    job = generic_job()
    first = client.post("/internal/v1/runs", json=job)
    assert first.status_code == 202
    run_id = first.json()["run_id"]
    wait_for_run(client, run_id)

    retry = client.post("/internal/v1/runs", json={**job, "trace_id": "retry-trace"})
    assert retry.status_code == 200
    assert retry.json()["run_id"] == run_id
    assert retry.json()["provider_calls"] == 1

    conflict = client.post("/internal/v1/runs", json={**job, "payload": {"changed": True}})
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"

    next_version = client.post("/internal/v1/runs", json={**job, "input_version": 2})
    assert next_version.status_code == 202
    assert next_version.json()["run_id"] != run_id

    other_operation = client.post("/internal/v1/runs", json={**job, "operation": "content.repurpose"})
    assert other_operation.status_code == 202
    assert other_operation.json()["operation"] == "content.repurpose"


def test_restart_marks_unfinished_run_retryable_then_resumes(make_client) -> None:
    first = make_client(provider=ScriptedProvider(["hang"]))
    job = generic_job()
    run_id = first.post("/internal/v1/runs", json=job).json()["run_id"]
    for _ in range(100):
        if first.get(f"/internal/v1/runs/{run_id}").json()["status"] == "running":
            break
        time.sleep(0.01)
    first.__exit__(None, None, None)  # process dies mid-run; nothing reaches "completed"

    restarted = make_client()
    interrupted = restarted.get(f"/internal/v1/runs/{run_id}").json()
    assert interrupted["status"] == "failed"
    assert interrupted["error_code"] == "RUN_INTERRUPTED"
    assert interrupted["retryable"] is True
    assert interrupted["result"] is None

    resumed = restarted.post("/internal/v1/runs", json=job)
    assert resumed.status_code == 202
    body = wait_for_run(restarted, run_id)
    assert body["status"] == "completed"
    assert body["attempt"] == 2
    assert body["provider_calls"] == 2  # the interrupted call still counts


def test_invalid_output_gets_one_repair_call_then_fails(make_client) -> None:
    provider = ScriptedProvider(["bad_json", "bad_json"])
    client = make_client(provider=provider)
    body = run_job(client, generic_job())
    assert body["status"] == "failed"
    assert body["error_code"] == "INVALID_STRUCTURED_OUTPUT"
    assert provider.calls == 2
    assert body["provider_calls"] == 2


def test_repair_call_recovers_invalid_output(make_client) -> None:
    provider = ScriptedProvider(["bad_json", "fake"])
    body = run_job(make_client(provider=provider), generic_job())
    assert body["status"] == "completed"
    assert body["result"]["usage"]["llm_calls"] == 2


def test_retries_never_exceed_provider_call_cap(make_client) -> None:
    provider = ScriptedProvider(["unavailable", "unavailable", "unavailable"])
    client = make_client(provider=provider, max_run_attempts=3)
    job = generic_job()
    first = run_job(client, job)
    assert (first["error_code"], first["retryable"]) == ("PROVIDER_UNAVAILABLE", True)
    second = client.post("/internal/v1/runs", json=job)
    assert second.status_code == 202
    second_body = wait_for_run(client, second.json()["run_id"])
    assert second_body["provider_calls"] == 2
    third = client.post("/internal/v1/runs", json=job)
    third_body = wait_for_run(client, third.json()["run_id"])
    assert third_body["error_code"] == "CALL_CAP_EXCEEDED"
    assert third_body["retryable"] is False
    assert provider.calls == 2


def test_attempts_are_capped_per_run(make_client) -> None:
    client = make_client(provider=ScriptedProvider(["unavailable", "unavailable"]))
    job = generic_job(constraints={"max_provider_calls": 2})
    run_job(client, job)
    wait_for_run(client, client.post("/internal/v1/runs", json=job).json()["run_id"])
    exhausted = client.post("/internal/v1/runs", json=job)
    assert exhausted.status_code == 200
    assert exhausted.json()["attempt"] == 2
    assert exhausted.json()["retryable"] is False


def test_tenant_scope_is_validated_at_create(client) -> None:
    payload = ingest_text_payload("SRC-HOUSING-v1")
    foreign = make_job("knowledge.ingest", payload, name="svc-tenant", workspace_id=str(uuid4()))
    response = client.post("/internal/v1/runs", json=foreign)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "TENANT_SCOPE_VIOLATION"
    same = make_job("knowledge.ingest", payload, name="svc-tenant-ok", workspace_id=WS_A)
    assert client.post("/internal/v1/runs", json=same).status_code == 202
