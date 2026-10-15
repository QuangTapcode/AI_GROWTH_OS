"""Run the W1 eval dataset against the AI service in-process and write a report.

From services/ai:
    python -m evals.run_eval --mode fake
    python -m evals.run_eval --mode live      # local Ollama, sequential, slow

Checks are deterministic assertions on the service response; they do not use an
LLM judge. Thiệu's independent review of expectations is recorded separately.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import time
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi.testclient import TestClient

from src.app.config import SERVICE_ROOT, Settings
from src.app.main import create_app

from .build_dataset import DATASET_VERSION, RUBRIC_VERSION


DATASET = SERVICE_ROOT / "evals" / "datasets" / f"{DATASET_VERSION}.jsonl"
REPORTS = SERVICE_ROOT / "evals" / "reports"
FACTS_RETRIEVAL = {"retrieval", "missing_fact"}


def dig(value: Any, path: str) -> Any:
    for part in path.split("."):
        value = value[int(part)] if isinstance(value, list) else value[part]
    return value


def wait(client: TestClient, run_id: str, timeout: float) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while True:
        body = client.get(f"/internal/v1/runs/{run_id}").json()
        if body["status"] in {"completed", "failed"} or time.monotonic() > deadline:
            return body
        time.sleep(0.2)


def evaluate(expect: dict[str, Any], http_status: int, response_text: str, body: dict[str, Any]) -> tuple[list[str], dict[str, Any]]:
    failures: list[str] = []
    error_code = body.get("error", {}).get("code") if http_status >= 400 else body.get("error_code")
    run = body.get("result") or {}
    result = run.get("result") or {}
    evidence = run.get("evidence") or []
    warnings = run.get("warnings") or []
    answer = str(result.get("answer", ""))
    cited = {item.get("source_id") for item in evidence}
    retrieved = result.get("retrieved_chunks") or []
    actual = {
        "http_status": http_status,
        "run_status": body.get("status"),
        "error_code": error_code,
        "answer": answer or None,
        "warnings": warnings,
        "cited_source_ids": sorted(filter(None, cited)),
        "evidence_locators": [item.get("locator") for item in evidence],
        "missing_fact_keys": result.get("missing_fact_keys"),
    }

    def check(ok: bool, label: str) -> None:
        if not ok:
            failures.append(label)

    expected_http = expect.get("http_status", 202)
    check(http_status in ({200, 202} if expected_http == 202 else {expected_http}), f"http_status={http_status}")
    if "error_code" in expect:
        check(error_code == expect["error_code"], f"error_code={error_code}")
    if "run_status" in expect:
        check(body.get("status") == expect["run_status"], f"run_status={body.get('status')}")
    for key, value in expect.get("result_equals", {}).items():
        try:
            got = dig(result, key)
        except (KeyError, IndexError, TypeError):
            got = "<missing>"
        check(got == value, f"result.{key}={got!r}")
    for prefix in expect.get("chunk_locators_include", []):
        check(any(chunk["locator"].startswith(prefix) for chunk in result.get("chunks", [])), f"no chunk locator {prefix}")
    if "embedding_dim" in expect:
        dims = {len(chunk["embedding"]) for chunk in result.get("chunks", [])}
        check(dims == {expect["embedding_dim"]}, f"embedding dims {sorted(dims)}")
    for source_id in expect.get("cited_source_ids_include", []):
        check(source_id in cited, f"missing citation {source_id}")
    for source_id in expect.get("cited_source_ids_exclude", []):
        check(source_id not in cited, f"forbidden citation {source_id}")
        check(all(item["source_id"] != source_id for item in retrieved), f"forbidden retrieval {source_id}")
    if "answer_includes_any" in expect:
        check(any(token.lower() in answer.lower() for token in expect["answer_includes_any"]), "answer lacks expected content")
    for token in expect.get("answer_excludes", []):
        check(token.lower() not in answer.lower(), f"answer contains {token!r}")
    for token in expect.get("response_excludes", []):
        check(token.lower() not in response_text.lower(), f"response contains {token!r}")
    if expect.get("answer_has_no_digits"):
        check(not re.search(r"\d", answer), "answer has digits")
    if "missing_fact_keys" in expect:
        check(result.get("missing_fact_keys") == expect["missing_fact_keys"], f"missing_fact_keys={result.get('missing_fact_keys')}")
    for warning in expect.get("warnings_include", []):
        check(warning in warnings, f"warning {warning} absent")
    for warning in expect.get("warnings_exclude", []):
        check(warning not in warnings, f"warning {warning} present")
    if "evidence_count" in expect:
        check(len(evidence) == expect["evidence_count"], f"evidence_count={len(evidence)}")
    if "evidence_locator_prefix" in expect:
        check(bool(evidence) and str(evidence[0].get("locator")).startswith(expect["evidence_locator_prefix"]), "evidence locator")
    if "answered_from" in expect:
        check(result.get("answered_from") == expect["answered_from"], f"answered_from={result.get('answered_from')}")
    if "evidence_versions_subset" in expect:
        check({item.get("source_version") for item in evidence} <= set(expect["evidence_versions_subset"]), "evidence version")
    if "retrieved_versions_subset" in expect:
        check({item["source_version"] for item in retrieved} <= set(expect["retrieved_versions_subset"]), "retrieved version")
    if "evidence_source_ids_subset" in expect:
        check(cited <= set(expect["evidence_source_ids_subset"]), f"evidence sources {sorted(filter(None, cited))}")
    if "channels_subset_of" in expect:
        channels = {item["channel"] for item in result.get("channels", [])} | {item["channel"] for item in result.get("topics", [])}
        check(channels <= set(expect["channels_subset_of"]), f"channels {sorted(channels)}")
    for key, minimum in expect.get("min_items", {}).items():
        check(len(result.get(key, [])) >= minimum, f"{key} count {len(result.get(key, []))}")
    if expect.get("no_numeric_targets"):
        targets = [item.get("target") for item in result.get("kpis", [])] + [item.get("target") for item in result.get("goal_suggestions", [])]
        check(all(target is None for target in targets), "numeric target present")
        check(not re.search(r"\d+(\.\d+)?\s*%", json.dumps(result)), "percentage present")
    return failures, actual


def model_digests(settings: Settings) -> dict[str, str] | None:
    if settings.provider_mode != "live":
        return None
    try:
        tags = httpx.get(f"{settings.ollama_base_url}/api/tags", timeout=5).json()
    except httpx.HTTPError:
        return None
    wanted = {settings.llm_model, settings.embedding_model}
    return {model["name"]: model.get("digest") for model in tags.get("models", []) if model.get("name") in wanted}


def _git(*args: str) -> str | None:
    try:
        output = subprocess.run(
            ["git", "-c", f"safe.directory={SERVICE_ROOT.parents[1].as_posix()}", *args],
            cwd=SERVICE_ROOT, capture_output=True, text=True, timeout=10, check=True,
        )
        return output.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def git_state() -> dict[str, Any]:
    """HEAD plus whether services/ai differs from it, so a report never implies clean code it did not run."""

    status = _git("status", "--porcelain", "--", ".")
    return {"commit": _git("rev-parse", "HEAD") or None, "services_ai_dirty": bool(status) if status is not None else None}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["fake", "live"], default="fake")
    parser.add_argument("--only", nargs="*", help="case ids to run")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()

    dataset_bytes = DATASET.read_bytes()
    cases = [json.loads(line) for line in dataset_bytes.decode("utf-8").splitlines() if line.strip()]
    if args.only:
        cases = [case for case in cases if case["case_id"] in set(args.only)]
    timeout = 900.0 if args.mode == "live" else 10.0

    with tempfile.TemporaryDirectory() as scratch:
        settings = replace(Settings.from_env(), provider_mode=args.mode, run_store_path=str(Path(scratch) / "eval-runs.sqlite3"))
        app = create_app(settings)
        provider = app.state.provider
        rows = []
        started_all = time.perf_counter()
        with TestClient(app) as client:
            for case in cases:
                started = time.perf_counter()
                for setup in case.get("setup", []):
                    accepted = client.post("/internal/v1/runs", json=setup)
                    if accepted.status_code in {200, 202}:
                        wait(client, accepted.json()["run_id"], timeout)
                response = client.post("/internal/v1/runs", json=case["request"])
                body = response.json()
                if response.status_code in {200, 202}:
                    body = wait(client, body["run_id"], timeout)
                    response_text = json.dumps(body, ensure_ascii=False)
                else:
                    response_text = response.text
                failures, actual = evaluate(case["expect"], response.status_code, response_text, body)
                run = body.get("result") or {}
                rows.append(
                    {
                        "case_id": case["case_id"],
                        "category": case["category"],
                        "critical": case["critical"],
                        "description": case["description"],
                        "pass": not failures,
                        "failed_checks": failures,
                        "expected": case["expect"],
                        "actual": actual,
                        "model_version": run.get("model_version"),
                        "prompt_version": run.get("prompt_version"),
                        "usage": run.get("usage"),
                        "wall_ms": int((time.perf_counter() - started) * 1000),
                    }
                )
                status = "PASS" if not failures else "FAIL " + "; ".join(failures)
                print(f"{case['case_id']:8} {status}", file=sys.stderr, flush=True)
        app.state.store.close()

    def rate(selected: list[dict[str, Any]]) -> dict[str, Any]:
        passed = sum(1 for row in selected if row["pass"])
        return {"passed": passed, "total": len(selected), "rate": round(passed / len(selected), 4) if selected else None}

    critical = rate([row for row in rows if row["critical"]])
    facts = rate([row for row in rows if row["category"] in FACTS_RETRIEVAL])
    categories = sorted({row["category"] for row in rows})
    usage_totals = {
        key: sum((row["usage"] or {}).get(key, 0) for row in rows)
        for key in ("input_tokens", "output_tokens", "total_tokens", "llm_calls", "embedding_calls", "latency_ms")
    }
    report = {
        "report_version": "1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset_version": DATASET_VERSION,
        "dataset_sha256": hashlib.sha256(dataset_bytes).hexdigest(),
        "rubric_version": RUBRIC_VERSION,
        "dataset_status": "draft_pending_thanh_duong_po_review",
        "provider_mode": args.mode,
        "models": {"llm": provider.model_version, "embedding": provider.embedding_model_version, "digests": model_digests(settings)},
        "prompt_versions": sorted({row["prompt_version"] for row in rows if row["prompt_version"]}),
        "git": git_state(),
        "python": sys.version.split()[0],
        "limits": {"context_tokens": settings.max_context_tokens, "max_input_tokens": settings.max_input_tokens, "max_output_tokens": settings.max_output_tokens, "max_provider_calls": settings.max_provider_calls, "temperature": 0},
        "summary": {
            "all": rate(rows),
            "critical": critical,
            "facts_retrieval": facts,
            "by_category": {category: rate([row for row in rows if row["category"] == category]) for category in categories},
            "thresholds": {"critical": 1.0, "facts_retrieval": 0.9},
            "meets_thresholds": critical["rate"] == 1.0 and (facts["rate"] or 0) >= 0.9,
            "usage_totals": usage_totals,
            "wall_seconds": round(time.perf_counter() - started_all, 1),
        },
        "cases": rows,
        "synthetic": True,
        "notes": "Deterministic assertions only; not a substitute for Thiệu's independent review or PO approval of the rubric.",
    }
    out = args.out or REPORTS / f"{DATASET_VERSION}-{args.mode}.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], indent=2), file=sys.stderr)
    print(f"report: {out}", file=sys.stderr)
    return 0 if report["summary"]["meets_thresholds"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
