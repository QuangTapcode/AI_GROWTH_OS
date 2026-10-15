"""Chunk + embed every corpus document through knowledge.ingest and report the result.

From services/ai (after `python -m corpus.build`):
    python -m corpus.check_ingest --mode live --write-jobs

This proves the corpus is ingestable; it does not persist anything. Persisting chunks and
vectors is the worker's job (W1-MY-03), which can reuse the request files from --write-jobs.
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
import time
from dataclasses import replace
from pathlib import Path
from uuid import uuid5

from fastapi.testclient import TestClient

from src.app.config import Settings
from src.app.main import create_app

from .common import OUT_DIR, _SOURCE_NAMESPACE


# Fixture WS-A until BE creates the real TripC workspace; pass --workspace-id to override.
DEFAULT_WORKSPACE = "10000000-0000-4000-8000-000000000001"


def ingest_request(entry: dict, text: str, workspace_id: str) -> dict:
    return {
        "schema_version": "1.0.0",
        "job_id": str(uuid5(_SOURCE_NAMESPACE, f"ingest:{entry['doc_id']}:{entry['sha256']}")),
        "workspace_id": workspace_id,
        "operation": "knowledge.ingest",
        "input_version": 1,
        "constraints": {"language": "en", "timeout_seconds": 300},
        "trace_id": f"corpus-{entry['doc_id']}",
        "synthetic": False,
        "payload": {
            "source": {
                "source_id": entry["source_id"],
                "version": 1,
                "workspace_id": workspace_id,
                "kind": "text",
                "title": entry["title"],
                "label": entry["doc_id"],
                "text": text,
                "provenance": {
                    "license": entry["license"],
                    "attribution": entry["attribution"],
                    "source_url": entry["source_url"],
                    "upstream_version": entry["upstream_version"],
                    "retrieved_at": entry["retrieved_at"],
                },
            }
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["fake", "live"], default="fake")
    parser.add_argument("--workspace-id", default=DEFAULT_WORKSPACE)
    parser.add_argument("--write-jobs", action="store_true", help="write BE-ready request JSON to corpus/out/jobs/")
    args = parser.parse_args()

    manifest = json.loads((OUT_DIR / "manifest.json").read_text(encoding="utf-8"))
    rows = []
    with tempfile.TemporaryDirectory() as scratch:
        settings = replace(Settings.from_env(), provider_mode=args.mode, run_store_path=str(Path(scratch) / "runs.sqlite3"))
        app = create_app(settings)
        with TestClient(app) as client:
            for entry in manifest["documents"]:
                text = (OUT_DIR / entry["file"]).read_text(encoding="utf-8")
                request = ingest_request(entry, text, args.workspace_id)
                if args.write_jobs:
                    jobs = OUT_DIR / "jobs"
                    jobs.mkdir(exist_ok=True)
                    (jobs / f"{entry['doc_id']}.json").write_text(json.dumps(request, ensure_ascii=False, indent=2), encoding="utf-8")
                started = time.perf_counter()
                accepted = client.post("/internal/v1/runs", json=request)
                body = accepted.json()
                if accepted.status_code in {200, 202}:
                    deadline = time.monotonic() + 600
                    while body.get("status") not in {"completed", "failed"} and time.monotonic() < deadline:
                        time.sleep(0.5)
                        body = client.get(f"/internal/v1/runs/{body['run_id']}").json()
                result = (body.get("result") or {}).get("result") or {}
                chunks = result.get("chunks", [])
                row = {
                    "doc_id": entry["doc_id"],
                    "license": entry["license"],
                    "status": body.get("status") or body.get("error", {}).get("code"),
                    "error_code": body.get("error_code"),
                    "chunks": len(chunks),
                    "embedding_dims": sorted({len(chunk["embedding"]) for chunk in chunks}),
                    "max_chunk_tokens_est": max((chunk["token_estimate"] for chunk in chunks), default=0),
                    "warnings": (body.get("result") or {}).get("warnings"),
                    "embedding_model": result.get("embedding_model"),
                    "seconds": round(time.perf_counter() - started, 1),
                }
                rows.append(row)
                print(
                    f"{row['doc_id']:40} {row['status']:9} chunks={row['chunks']:3} dims={row['embedding_dims']} "
                    f"max_tokens~{row['max_chunk_tokens_est']} {row['seconds']}s",
                    file=sys.stderr,
                )
        app.state.store.close()

    report = {
        "mode": args.mode,
        "workspace_id": args.workspace_id,
        "documents": len(rows),
        "completed": sum(1 for row in rows if row["status"] == "completed"),
        "total_chunks": sum(row["chunks"] for row in rows),
        "rows": rows,
    }
    (OUT_DIR / f"ingest_report_{args.mode}.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("mode", "documents", "completed", "total_chunks")}), file=sys.stderr)
    return 0 if report["completed"] == report["documents"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
