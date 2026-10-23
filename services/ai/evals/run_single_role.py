"""Run one of the six agent roles in isolation and write inspectable evidence.

The target role is executed once. Dependent parent artifacts (Research for
Growth Lead/SEO, then SEO for Content) are generated as local synthetic
fixtures only so the report makes the target input explicit without running
the full six-role chain.
"""

from __future__ import annotations

import argparse
import json
import time
from copy import deepcopy
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from fastapi.testclient import TestClient

from src.app.config import Settings
from src.app.main import create_app
from examples.six_role_requests import artifact_input, image, leads, metrics, mock_research_request, request
from examples.growth_lead_request import growth_lead_request


ROLE_OPERATIONS = {
    "research": "research.run",
    "growth_lead": "strategy.generate",
    "seo": "seo.local_draft",
    "content": "content.repurpose",
    "community": "community.response",
    "performance": "analytics.report",
}


def run_job(client: TestClient, job: dict[str, Any]) -> dict[str, Any]:
    response = client.post("/internal/v1/runs", json=job)
    if response.status_code not in (200, 202):
        raise RuntimeError(f"submit failed ({response.status_code}): {response.text}")
    run_id = response.json()["run_id"]
    deadline = time.monotonic() + 600
    while time.monotonic() < deadline:
        result = client.get(f"/internal/v1/runs/{run_id}")
        if result.status_code != 200:
            raise RuntimeError(f"poll failed ({result.status_code}): {result.text}")
        body = result.json()
        if body["status"] == "completed":
            return body["result"]
        if body["status"] == "failed":
            raise RuntimeError(json.dumps(body, ensure_ascii=False))
        time.sleep(0.05)
    raise TimeoutError(f"run {run_id} exceeded 600 seconds")


def build_target(client: TestClient, role: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Build one target request and return prerequisite metadata."""

    base = mock_research_request()
    prerequisites: list[dict[str, Any]] = []

    if role == "research":
        return base, prerequisites

    research = run_job(client, base)
    prerequisites.append({"role": "research", "operation": "research.run", "artifact": research["artifact"]})

    if role == "growth_lead":
        return growth_lead_request(base, research), prerequisites

    if role == "community":
        return request(base, "community.response", {"question": "Can you explain living areas for newcomers?"}), prerequisites
    if role == "performance":
        return request(base, "analytics.report", {"metrics": metrics(base)}), prerequisites

    seo_request = request(base, "seo.local_draft", {"research": artifact_input(research), "cta": "Request the guide"})
    if role == "seo":
        return seo_request, prerequisites

    seo = run_job(client, seo_request)
    prerequisites.append({"role": "seo", "operation": "seo.local_draft", "artifact": seo["artifact"]})
    if role == "content":
        return request(base, "content.repurpose", {
            "source_article": artifact_input(seo),
            "cta": "Request the guide",
            "assets": [image(base)],
        }), prerequisites

    raise ValueError(f"unsupported role: {role}")


def checks_for(role: str, result: dict[str, Any]) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, detail: str) -> None:
        checks.append({"name": name, "passed": bool(passed), "detail": detail})

    check("synthetic_is_explicit", result.get("synthetic") is True, "Fixture output is marked synthetic")
    check("human_approval_required", result.get("requires_human_approval") is True, "Output cannot bypass owner approval")
    check("not_applied", result.get("applied", False) is False, "Agent did not apply/send/publish changes")

    if role == "research":
        findings = result.get("findings", [])
        check("ready_for_handoff", result.get("status") == "ready_for_handoff", f"status={result.get('status')}")
        check("findings_have_provenance", bool(findings) and all(
            f.get("keywords") and f.get("user_need") and f.get("url") and f.get("fetched_at") and f.get("evidence")
            for f in findings
        ), "Each finding has keywords, user need, URL, timestamp and evidence")
    elif role == "growth_lead":
        score = result.get("opportunity_score") or {}
        tasks = result.get("tasks", [])
        check("proposed_plan", result.get("status") == "proposed", f"status={result.get('status')}")
        selected = result.get("selected_opportunity") or {}
        check("has_score_and_rationale", bool(score.get("score")) and bool(selected.get("rationale")), "Plan includes score and opportunity rationale")
        check("has_downstream_tasks", len(tasks) >= 2 and all(t.get("deadline") for t in tasks), "Plan has downstream tasks with deadlines")
    elif role == "seo":
        checks_map = result.get("seo_checks") or {}
        check("draft_only", result.get("status") == "draft", f"status={result.get('status')}")
        check("has_article_fields", bool(result.get("title")) and bool(result.get("meta_description")) and bool(result.get("body_markdown")), "Title, meta and body exist")
        check("has_citations", bool(result.get("citations")), "SEO claims include evidence citations")
        check("seo_checks_pass", bool(checks_map) and all(checks_map.values()), "SEO checks all pass")
    elif role == "content":
        check("draft_only", result.get("status") == "draft", f"status={result.get('status')}")
        check("has_social_pack", bool(result.get("caption")) and bool(result.get("cta")) and bool(result.get("channels")), "Caption, CTA and channels exist")
        check("parent_version_pinned", bool(result.get("parent_content_id")) and result.get("parent_version") == 1, "Parent article and version are pinned")
        check("asset_refs_present", bool(result.get("image_assets")), "Asset references are explicit")
    elif role == "community":
        check("draft_only", result.get("status") == "draft", f"status={result.get('status')}")
        check("has_grounded_reply", bool(result.get("reply")) and bool(result.get("citations")), "Reply has citation evidence")
        check("no_unapproved_lead_send", result.get("lead_proposal") in (None, {}) or result.get("applied") is False, "Lead remains a proposal")
    elif role == "performance":
        metrics_payload = result.get("metrics") or {}
        check("draft_only", result.get("status") == "draft", f"status={result.get('status')}")
        check("snapshot_and_window", bool(result.get("metric_snapshot_id")) and bool(result.get("window")), "Snapshot and time window are pinned")
        check("no_spend_mutation", result.get("spend_mutation_allowed") is False, "Budget mutation is disabled")
        check("metrics_are_preserved", bool(metrics_payload), "Report preserves the provided metric values")

    return checks


def markdown_report(report: dict[str, Any]) -> str:
    output = report["output"]
    checks = report["checks"]
    lines = [
        f"# Standalone agent report: {report['role']}",
        "",
        f"- **Generated:** {report['generated_at']}",
        f"- **Mode:** `{report['mode']}`",
        f"- **Operation:** `{report['operation']}`",
        f"- **Verdict:** `{report['verdict']}`",
        f"- **Synthetic fixture:** `{report['synthetic']}`",
        "",
        "## Input",
        "",
        f"- Workspace: `{report['input']['workspace_id']}`",
        f"- Context snapshot: `{report['input']['context_snapshot_id']}`",
        f"- Prerequisites generated locally: `{len(report['prerequisites'])}`",
        "",
        "## Output",
        "",
        f"- Artifact ID: `{output['artifact']['artifact_id']}`",
        f"- Version/hash: `{output['artifact']['version']}` / `{output['artifact']['content_hash']}`",
        f"- Status: `{output['result'].get('status')}`",
        f"- Applied: `{output['result'].get('applied')}`",
        f"- Citations: `{len(output.get('evidence', [])) or len(output['result'].get('citations', []))}`",
        "",
        "## Acceptance checks",
        "",
    ]
    lines.extend(f"- [{'x' if c['passed'] else ' '}] {c['name']}: {c['detail']}" for c in checks)
    lines += [
        "",
        "## Full payload",
        "",
        "See the sibling `.json` file for the exact request, result, evidence, usage, prompt/model versions and artifact hash.",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run one AI Growth OS agent and save inspectable evidence")
    parser.add_argument("--role", choices=sorted(ROLE_OPERATIONS), required=True)
    parser.add_argument("--mode", choices=["fake", "live", "gemini"], default="fake")
    parser.add_argument("--out", type=Path, required=True, help="Output JSON path; Markdown is written next to it")
    parser.add_argument("--request", type=Path, help="Optional JSON JobRequest; skips the built-in fixture and prerequisites")
    args = parser.parse_args()

    with TemporaryDirectory(prefix=f"single-{args.role}-") as directory:
        settings = replace(Settings.from_env(), provider_mode=args.mode, run_store_path=str(Path(directory) / "runs.sqlite3"))
        with TestClient(create_app(settings)) as client:
            if args.request:
                target = json.loads(args.request.read_text(encoding="utf-8"))
                expected_operation = ROLE_OPERATIONS[args.role]
                if target.get("operation") != expected_operation:
                    raise ValueError(
                        f"request operation must be {expected_operation}, got {target.get('operation')}"
                    )
                prerequisites = []
            else:
                target, prerequisites = build_target(client, args.role)
            output = run_job(client, target)
            checks = checks_for(args.role, output["result"])
            report = {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "role": args.role,
                "operation": ROLE_OPERATIONS[args.role],
                "mode": args.mode,
                "synthetic": bool(target.get("synthetic", output["result"].get("synthetic", False))),
                "verdict": "PASS" if all(c["passed"] for c in checks) else "FAIL",
                "input": {
                    "workspace_id": target["workspace_id"],
                    "context_snapshot_id": target["context_snapshot_id"],
                    "job_id": target["job_id"],
                    "request": target,
                },
                "prerequisites": prerequisites,
                "output": output,
                "checks": checks,
            }
            client.app.state.store.close()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    md_path = args.out.with_suffix(".md")
    md_path.write_text(markdown_report(report), encoding="utf-8")
    print(json.dumps({"role": args.role, "operation": report["operation"], "verdict": report["verdict"], "json": str(args.out), "markdown": str(md_path)}, ensure_ascii=False))
    return 0 if report["verdict"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
