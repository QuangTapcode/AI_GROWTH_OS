"""Generate cross-language mock evidence through the real ASGI HTTP boundary."""
import json
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient
from src.app.config import Settings
from src.app.main import create_app
from examples.growth_lead_request import growth_lead_request, mock_research_request


def run(client, request):
    response = client.post("/internal/v1/runs", json=request)
    assert response.status_code in (200, 202), response.text
    run_id = response.json()["run_id"]
    for _ in range(500):
        body = client.get(f"/internal/v1/runs/{run_id}").json()
        if body["status"] in ("completed", "failed"):
            assert body["status"] == "completed", body
            return body
        time.sleep(0.01)
    raise AssertionError("Run timed out")


def main():
    with tempfile.TemporaryDirectory() as directory:
        settings = Settings(provider_mode="fake", run_store_path=str(Path(directory) / "runs.sqlite3"))
        app = create_app(settings)
        with TestClient(app) as client:
            research_request = mock_research_request()
            research = run(client, research_request)
            request = growth_lead_request(research_request, research["result"])
            plan = run(client, request)
            assert plan["result"]["result"]["status"] == "proposed"
            assert run(client, request)["result"] == plan["result"]
        app.state.store.close()
        restarted = create_app(settings)
        with TestClient(restarted) as client:
            assert client.get(f'/internal/v1/runs/{plan["run_id"]}').json()["result"] == plan["result"]
        restarted.state.store.close()
        report = {"mode": "mock", "synthetic": True, "transport": "ASGI TestClient (no live model/DB/queue)",
                  "checks": ["research_to_plan", "retry_idempotency", "restart_persistence"],
                  "research_request": research_request, "plan_request": request,
                  "research": research["result"], "plan": plan["result"]}
    destination = ROOT.parents[1] / "qa" / "evidence" / "qq04" / "mock-report.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"PASS: {destination}")


if __name__ == "__main__":
    main()
