"""HTTP smoke test that calls a running AI service the way the BE worker does.

    python -m uvicorn src.app.main:app --app-dir services/ai --port 5000     # terminal 1
    python services/ai/scripts/smoke_http.py --base-url http://127.0.0.1:5000  # terminal 2

``--write-examples`` also writes the sample requests to services/ai/examples/ for BE.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from uuid import uuid4

import httpx

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from evals.fixtures import (  # noqa: E402
    GUIDE_PDF_PAGES,
    answer_payload,
    growth_map_payload,
    ingest_pdf_payload,
    ingest_text_payload,
    job,
    snapshot_source,
)


def samples() -> dict[str, dict]:
    return {
        "run-knowledge-ingest-text.json": job("knowledge.ingest", ingest_text_payload("SRC-HOUSING-v1"), name="example-ingest-text"),
        "run-knowledge-ingest-pdf.json": job("knowledge.ingest", ingest_pdf_payload(GUIDE_PDF_PAGES), name="example-ingest-pdf"),
        "run-knowledge-answer-missing-rent.json": job(
            "knowledge.answer",
            answer_payload("What is the monthly rent?", [snapshot_source("SRC-HOUSING-v1")]),
            name="example-answer-rent",
            approved=["SRC-HOUSING-v1"],
        ),
        "run-growth-map.json": job(
            "growth_map.suggest",
            growth_map_payload(fact_labels=["SRC-HOUSING-v1"], goal_context={"primary_metric": "persisted_leads"}),
            name="example-growth-map",
            approved=["SRC-HOUSING-v1"],
        ),
    }


def poll(client: httpx.Client, run_id: str, timeout: float) -> dict:
    deadline = time.monotonic() + timeout
    while True:
        body = client.get(f"/internal/v1/runs/{run_id}").json()
        if body["status"] in {"completed", "failed"} or time.monotonic() > deadline:
            return body
        time.sleep(0.3)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="http://127.0.0.1:5000")
    parser.add_argument("--token", default="")
    parser.add_argument("--timeout", type=float, default=600)
    parser.add_argument("--write-examples", action="store_true")
    args = parser.parse_args()

    requests = samples()
    if args.write_examples:
        out = SERVICE_ROOT / "examples"
        out.mkdir(exist_ok=True)
        for name, body in requests.items():
            (out / name).write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    headers = {"Authorization": f"Bearer {args.token}"} if args.token else {}
    checks: list[tuple[str, bool, str]] = []
    with httpx.Client(base_url=args.base_url, headers=headers, timeout=30) as client:
        health = client.get("/healthz")
        checks.append(("healthz 200", health.status_code == 200, health.text[:200]))
        ready = client.get("/readyz")
        checks.append(("readyz 200", ready.status_code == 200, ready.text[:200]))

        started = time.perf_counter()
        bad = client.post("/internal/v1/runs", json={"job_id": "not-a-uuid"})
        error = bad.json().get("error", {})
        checks.append(("bad input 422 + code", bad.status_code == 422 and error.get("code") == "INVALID_REQUEST", json.dumps(error)[:200]))
        checks.append(("bad input has request_id", bool(error.get("request_id")), str(error.get("request_id"))))

        for name, body in requests.items():
            body = {**body, "job_id": str(uuid4())}  # fresh run per smoke
            t0 = time.perf_counter()
            accepted = client.post("/internal/v1/runs", json=body)
            accept_ms = int((time.perf_counter() - t0) * 1000)
            checks.append((f"{name} accepted 202 in {accept_ms} ms", accepted.status_code == 202, accepted.text[:120]))
            final = poll(client, accepted.json()["run_id"], args.timeout)
            summary = {
                "status": final["status"],
                "error_code": final.get("error_code"),
                "warnings": (final.get("result") or {}).get("warnings"),
                "model": (final.get("result") or {}).get("model_version"),
            }
            checks.append((f"{name} completed", final["status"] == "completed", json.dumps(summary)))
            again = client.post("/internal/v1/runs", json=body)
            checks.append((f"{name} resend is idempotent (200, same run)", again.status_code == 200 and again.json()["run_id"] == final["run_id"], str(again.status_code)))
        total_ms = int((time.perf_counter() - started) * 1000)

    width = max(len(label) for label, _, _ in checks)
    for label, ok, detail in checks:
        print(f"{'PASS' if ok else 'FAIL'}  {label.ljust(width)}  {detail}")
    print(f"total {total_ms} ms against {args.base_url}")
    return 0 if all(ok for _, ok, _ in checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
