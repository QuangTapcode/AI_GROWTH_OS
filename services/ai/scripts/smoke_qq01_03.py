"""Reviewable live HTTP smoke with a separate service process and isolated store.

Uses a fetched public excerpt, a TEST approval snapshot and a TEST business
profile. It does not grant production source approval or touch business DBs.
No cloud provider, model download, publication or external message is involved.
"""
from __future__ import annotations

import argparse
import json
import os
import secrets
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from src.rag.parsing import parse_html
from src.guardrails.facts import sensitive_keys_in, has_price_claim
from examples.research_request import research_request


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("live", "fake"), default="live")
    parser.add_argument("--output", type=Path, default=ROOT.parents[1] / "qa/evidence/qq01-03")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    url = "https://vietnam.travel/places-to-go/south-central-coast-central-highlands/da-nang"
    with httpx.Client(timeout=30, follow_redirects=False) as fetcher:
        response = fetcher.get(url)
        response.raise_for_status()
    fetched = datetime.now(timezone.utc).isoformat()
    segments, title = parse_html(response.text, url)
    excerpts = [x.text for x in segments if len(x.text) >= 100
                and "da nang" in x.text.lower()
                and not has_price_claim(x.text) and not sensitive_keys_in(x.text)]
    if not excerpts:
        raise RuntimeError("No usable source excerpt; do not substitute invented text")
    text = excerpts[0][:900]
    provenance = {"license": "Evidence-only excerpt; publication rights not verified",
                  "attribution": "Vietnam Tourism, public page", "source_url": url,
                  "retrieved_at": fetched}
    ws, source, snapshot = uuid4(), uuid4(), uuid4()
    store = ROOT / "var" / f"qq01-03-{uuid4()}.sqlite3"
    token = secrets.token_urlsafe(32)
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    env = dict(os.environ, LLM_PROVIDER_MODE=args.mode, AI_RUN_STORE_PATH=str(store),
               INTERNAL_AI_AUTH_TOKEN=token)
    # Keep the existing configured local model names and caps.
    processes = []
    log = (args.output / f"{args.mode}-service.log").open("w", encoding="utf-8")
    command = [sys.executable, "-m", "uvicorn", "src.app.main:app", "--app-dir", str(ROOT),
               "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"]

    def start(client):
        proc = subprocess.Popen(command, env=env, stdout=log, stderr=log,
                                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        processes.append(proc)
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                raise RuntimeError("Isolated AI service exited; inspect service log")
            try:
                ready = client.get("/readyz")
                if ready.status_code == 200:
                    return ready.json()
            except httpx.HTTPError:
                pass
            time.sleep(0.2)
        raise RuntimeError("Isolated AI service not ready")

    report = {"mode": args.mode, "scope": "live HTTP/model + public excerpt; test approval/profile, no business DB",
              "source_url": url, "fetched_at": fetched, "source_excerpt": text,
              "test_workspace_id": str(ws), "runs": {}, "checks": {}}
    try:
        with httpx.Client(base_url=f"http://127.0.0.1:{port}",
                          headers={"Authorization": f"Bearer {token}"}, timeout=10) as client:
            report["health"] = start(client)
            if args.mode == "live":
                tags = httpx.get("http://127.0.0.1:11434/api/tags", timeout=5).json()
                report["model_digests"] = {x["name"]: x["digest"] for x in tags["models"]}
            report["registry"] = client.get("/internal/v1/agents").json()

            def run(name, request):
                request["constraints"] = {"timeout_seconds": 600, "max_provider_calls": 2}
                (args.output / f"{args.mode}-{name}-request.json").write_text(
                    json.dumps(request, ensure_ascii=False, indent=2), encoding="utf-8")
                accepted = client.post("/internal/v1/runs", json=request)
                accepted.raise_for_status()
                run_id = accepted.json()["run_id"]
                deadline = time.monotonic() + 610
                while time.monotonic() < deadline:
                    result = client.get(f"/internal/v1/runs/{run_id}").json()
                    if result["status"] in ("completed", "failed"):
                        break
                    time.sleep(0.3)
                report["runs"][name] = result
                if result["status"] != "completed":
                    raise RuntimeError(f"{name} failed: {result.get('error_code')}")
                return result["result"]

            def request(operation, payload, approved=False):
                return {"job_id": str(uuid4()), "workspace_id": str(ws), "operation": operation,
                        "input_version": 1, "trace_id": f"qq-review-{operation}", "synthetic": True,
                        "context_snapshot_id": str(snapshot) if approved else None,
                        "approved_source_versions": [{"source_id": str(source), "version": 1}] if approved else [],
                        "payload": payload}

            ingested = run("ingest", request("knowledge.ingest", {"source": {
                "source_id": str(source), "version": 1, "workspace_id": str(ws),
                "kind": "text", "title": title or "Da Nang public guide excerpt",
                "text": text, "provenance": provenance}}))["result"]
            chunks = [{"chunk_id": f"excerpt-{i}", "text": x["text"], "locator": x["locator"],
                       "embedding": x["embedding"], "workspace_id": str(ws),
                       "source_id": str(source), "source_version": 1}
                      for i, x in enumerate(ingested["chunks"])]
            knowledge = {"snapshot_id": str(snapshot), "workspace_id": str(ws), "sources": [{
                "source_id": str(source), "workspace_id": str(ws), "version": 1,
                "status": "approved", "title": ingested["title"], "provenance": provenance,
                "chunks": chunks, "facts": []}]}
            profile = {"company": "TripC review fixture", "version": 1, "workspace_id": str(ws),
                       "locations": ["Da Nang"], "audiences": ["English-speaking newcomers"],
                       "topic_priority": ["Local living guide"]}
            run("answer", request("knowledge.answer", {"question": "What can newcomers explore in Da Nang?",
                                                        "snapshot": knowledge}, True))
            run("growth-map", request("growth_map.suggest", {"workspace_id": str(ws),
                "business_profile": profile, "snapshot": knowledge}, True))
            req = research_request(job_id=uuid4(), workspace_id=ws, snapshot=knowledge,
                                   business_profile=profile, input_version=1, trace_id="qq-research-live",
                                   synthetic=True).model_dump(mode="json")
            research = run("research", req)
            assert research["result"]["status"] == "ready_for_handoff", research
            assert research["evidence"] and research["artifact"]["role"] == "research"
            if args.mode == "live":
                assert research["model_version"].startswith("ollama/")
                assert research["usage"]["llm_calls"] >= 1
            before = report["runs"]["research"]
            retry = client.post("/internal/v1/runs", json=req).json()
            assert retry["result"] == before["result"] and retry["provider_calls"] == before["provider_calls"]
            report["checks"]["idempotent_retry"] = True
            processes[-1].terminate()
            processes[-1].wait(timeout=15)
            start(client)
            persisted = client.get(f'/internal/v1/runs/{before["run_id"]}').json()
            assert persisted["result"] == before["result"]
            report["checks"]["artifact_persisted_after_restart"] = True
            report["checks"]["six_roles_registered"] = len(report["registry"]["roles"]) == 6
            report["checks"]["research_handoff_ready"] = True
            report["status"] = "passed"
    except Exception as exc:
        report["status"] = "failed"
        report["error"] = str(exc)
        raise
    finally:
        report["recorded_at"] = datetime.now(timezone.utc).isoformat()
        (args.output / f"{args.mode}-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        for proc in processes:
            if proc.poll() is None:
                proc.terminate()
                proc.wait(timeout=15)
        log.close()
    print(json.dumps({"status": report["status"], "mode": args.mode, "checks": report["checks"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
