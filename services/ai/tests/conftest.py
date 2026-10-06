from __future__ import annotations

import sys
import time
from dataclasses import replace
from pathlib import Path
from typing import Any, Callable, Iterator

import pytest
from fastapi.testclient import TestClient


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from src.app.config import Settings  # noqa: E402
from src.app.main import create_app  # noqa: E402


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return replace(Settings(), run_store_path=str(tmp_path / "runs.sqlite3"))


@pytest.fixture
def make_client(settings: Settings) -> Iterator[Callable[..., TestClient]]:
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
def client(make_client: Callable[..., TestClient]) -> TestClient:
    return make_client()


def wait_for_run(client: TestClient, run_id: str, *, timeout: float = 5.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while True:
        body = client.get(f"/internal/v1/runs/{run_id}").json()
        if body["status"] in {"completed", "failed"} or time.monotonic() > deadline:
            return body
        time.sleep(0.01)


def run_job(client: TestClient, job: dict[str, Any]) -> dict[str, Any]:
    accepted = client.post("/internal/v1/runs", json=job)
    assert accepted.status_code in {200, 202}, accepted.text
    return wait_for_run(client, accepted.json()["run_id"])
