from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from dataclasses import replace
from typing import Any, Callable, Iterator

import pytest
from fastapi.testclient import TestClient

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
AI_SERVICE_ROOT = REPOSITORY_ROOT / "services" / "ai"
if str(AI_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_ROOT))

from src.app.config import Settings  # noqa: E402
from src.app.main import create_app  # noqa: E402

API_NODE_MODULES = REPOSITORY_ROOT / "apps" / "api" / "node_modules"
TSX_COMMAND = API_NODE_MODULES / ".bin" / "tsx.cmd"
HARNESS = REPOSITORY_ROOT / "qa" / "Agent" / "research" / "research-harness.ts"


class ResearchHarness:
    def __init__(self) -> None:
        command = f'call "{TSX_COMMAND}" "{HARNESS}"'
        self.process = subprocess.Popen(
            command,
            cwd=REPOSITORY_ROOT,
            shell=True,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )

    def run(self, payload: dict[str, Any]) -> Any:
        if self.process.stdin is None or self.process.stdout is None:
            pytest.fail("Research harness streams could not be opened.")
        if self.process.poll() is not None:
            stderr = self.process.stderr.read() if self.process.stderr else ""
            pytest.fail(f"Research harness exited unexpectedly: {stderr}")
        self.process.stdin.write(json.dumps(payload) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            stderr = self.process.stderr.read() if self.process.stderr else ""
            pytest.fail(f"Research harness returned no result: {stderr}")
        response = json.loads(line)
        if not response.get("ok"):
            pytest.fail(f"Research harness error: {response.get('error')}")
        return response.get("output")

    def close(self) -> None:
        if self.process.stdin:
            self.process.stdin.close()
        try:
            self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)


@pytest.fixture(scope="session")
def research_harness() -> Any:
    if not TSX_COMMAND.is_file():
        pytest.fail(
            f"Missing API-local tsx runner at {TSX_COMMAND}. "
            "Install the apps/api dependencies before running this suite."
        )
    harness = ResearchHarness()
    yield harness
    harness.close()


@pytest.fixture
def make_ai_client(tmp_path: Path) -> Iterator[Callable[..., TestClient]]:
    """Run the actual Research API with an isolated run store and injectable model provider."""
    settings = replace(Settings(), run_store_path=str(tmp_path / "research-runs.sqlite3"))
    clients: list[TestClient] = []

    def factory(provider: Any = None, **overrides: Any) -> TestClient:
        client = TestClient(create_app(replace(settings, **overrides), provider=provider))
        client.__enter__()
        clients.append(client)
        return client

    yield factory
    for client in clients:
        client.__exit__(None, None, None)
