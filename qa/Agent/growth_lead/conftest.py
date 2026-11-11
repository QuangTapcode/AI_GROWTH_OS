from __future__ import annotations

import json
import subprocess
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
API_NODE_MODULES = REPOSITORY_ROOT / "apps" / "api" / "node_modules"
TSX_COMMAND = API_NODE_MODULES / ".bin" / "tsx.cmd"
HARNESS = REPOSITORY_ROOT / "qa" / "Agent" / "growth_lead" / "growth-lead-harness.ts"


class GrowthLeadHarness:
    """Keep one local TypeScript process for calls into production plan code."""

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
            pytest.fail("Growth Lead harness streams could not be opened.")
        if self.process.poll() is not None:
            stderr = self.process.stderr.read() if self.process.stderr else ""
            pytest.fail(f"Growth Lead harness exited unexpectedly: {stderr}")

        self.process.stdin.write(json.dumps(payload) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            stderr = self.process.stderr.read() if self.process.stderr else ""
            pytest.fail(f"Growth Lead harness returned no result: {stderr}")

        response = json.loads(line)
        if not response.get("ok"):
            pytest.fail(f"Growth Lead harness error: {response.get('error')}")
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
def growth_lead_harness() -> Iterator[GrowthLeadHarness]:
    if not TSX_COMMAND.is_file():
        pytest.fail(
            f"Missing API-local tsx runner at {TSX_COMMAND}. "
            "Install the apps/api dependencies before running this suite."
        )
    harness = GrowthLeadHarness()
    yield harness
    harness.close()
