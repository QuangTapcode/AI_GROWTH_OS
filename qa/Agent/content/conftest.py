from __future__ import annotations

import sys
import time
from dataclasses import replace
from pathlib import Path
from typing import Any, Callable, Iterator

import pytest
from fastapi.testclient import TestClient

AI_SERVICE_ROOT = Path(__file__).resolve().parents[3] / "services" / "ai"
if str(AI_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_ROOT))

from src.app.config import Settings  # noqa: E402
from src.app.main import create_app  # noqa: E402


@pytest.fixture
def make_ai_client(tmp_path: Path) -> Iterator[Callable[..., TestClient]]:
    """Run the actual Content operation with isolated run storage and a test provider."""
    settings = replace(Settings(), run_store_path=str(tmp_path / "content-runs.sqlite3"))
    clients: list[TestClient] = []

    def factory(provider: Any = None, **overrides: Any) -> TestClient:
        client = TestClient(create_app(replace(settings, **overrides), provider=provider))
        client.__enter__()
        clients.append(client)
        return client

    yield factory
    for client in clients:
        client.__exit__(None, None, None)


@pytest.fixture
def client(make_ai_client: Callable[..., TestClient]) -> TestClient:
    return make_ai_client()


def run_job(
    client: TestClient, job: dict[str, Any], timeout: float = 5.0
) -> dict[str, Any]:
    accepted = client.post("/internal/v1/runs", json=job)
    assert accepted.status_code in {200, 202}, accepted.text
    run_id = accepted.json()["run_id"]
    deadline = time.monotonic() + timeout
    while True:
        result = client.get(f"/internal/v1/runs/{run_id}").json()
        if result["status"] in {"completed", "failed"} or time.monotonic() > deadline:
            return result
        time.sleep(0.01)
