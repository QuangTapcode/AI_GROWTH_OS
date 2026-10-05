from __future__ import annotations

import time
from uuid import uuid4

from fastapi.testclient import TestClient

from src.app.main import create_app
from src.app.providers import FakeProvider
from src.app.schemas import JobRequest, ProviderOutput


def test_health_and_fake_provider() -> None:
    app = create_app()
    client = TestClient(app)

    health = client.get("/healthz")
    assert health.status_code == 200
    assert health.json()["provider_mode"] == "fake"

    job_id = uuid4()
    payload = {
        "schema_version": "1.0.0",
        "job_id": str(job_id),
        "workspace_id": str(uuid4()),
        "operation": "knowledge.ingest",
        "input_version": 1,
        "trace_id": "test-trace-001",
        "synthetic": True,
        "payload": {"text": "synthetic TripC fact"},
    }
    accepted = client.post("/internal/v1/runs", json=payload)
    assert accepted.status_code == 202
    assert accepted.json()["status"] == "queued"

    final = None
    for _ in range(50):
        final = client.get(f"/internal/v1/runs/{job_id}")
        if final.json()["status"] != "queued" and final.json()["status"] != "running":
            break
        time.sleep(0.01)
    assert final is not None
    assert final.status_code == 200
    body = final.json()
    assert body["status"] == "completed"
    assert body["result"]["operation"] == "knowledge.ingest"
    assert body["result"]["warnings"] == ["FAKE_PROVIDER_NO_LIVE_EVIDENCE"]
    assert "payload" not in body["result"]


def test_fake_output_is_structurally_valid() -> None:
    request = JobRequest(
        job_id=uuid4(),
        workspace_id=uuid4(),
        operation="content.generate",
        input_version=1,
        trace_id="test-trace-002",
        synthetic=True,
    )
    provider = FakeProvider()
    output, _ = __import__("asyncio").run(provider.generate(request))
    assert isinstance(output, ProviderOutput)
    assert output.result["synthetic"] is True
