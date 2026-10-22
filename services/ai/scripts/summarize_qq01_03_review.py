"""Build review evidence from actual JUnit/live reports; never grant approvals."""
import argparse
import hashlib
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def junit(path):
    tree = ET.parse(path).getroot()
    cases = tree.findall(".//testcase")
    return {
        "total": len(cases),
        "passed": sum(not any(c.find(tag) is not None for tag in ("failure", "error", "skipped")) for c in cases),
        "failed": sum(c.find("failure") is not None or c.find("error") is not None for c in cases),
        "skipped": sum(c.find("skipped") is not None for c in cases),
    }, cases


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--evidence", type=Path, default=ROOT / "qa/evidence/qq01-03-review-2026-10-16")
    folder = parser.parse_args().evidence
    unit, _ = junit(folder / "ai-full.xml")
    dedicated, rows = junit(folder / "reviewer-cases.xml")
    live = json.loads((folder / "live-report.json").read_text(encoding="utf-8"))
    evaluation = json.loads((folder / "frozen-eval-live.json").read_text(encoding="utf-8"))
    worker = json.loads((folder / "worker-ai-http.json").read_text(encoding="utf-8"))
    verdicts = []
    for case in rows:
        match = re.search(r"QQ(01|02|03)_A\d{2}", case.attrib["name"])
        if match is None:
            raise ValueError(f'Missing review ID: {case.attrib["name"]}')
        verdicts.append({"case_id": match.group().replace("_", "-"),
                         "task_id": "QQ-" + match.group(1), "test_name": case.attrib["name"],
                         "status": "passed" if not any(case.find(t) is not None for t in ("failure", "error", "skipped")) else "not_passed"})
    expected = {f"QQ{group}-A{i:02}" for group, count in (("01", 5), ("02", 5), ("03", 20)) for i in range(1, count + 1)}
    assert {c["case_id"] for c in verdicts} == expected and len(verdicts) == 30
    verdicts.sort(key=lambda row: row["case_id"])
    git = ["git", "-c", f"safe.directory={ROOT.as_posix()}", "-C", str(ROOT)]
    commit = subprocess.check_output(git + ["rev-parse", "HEAD"], text=True).strip()
    dirty = bool(subprocess.check_output(git + ["status", "--porcelain"], text=True).strip())
    code_files = ["services/ai/src/agents/research/pipeline.py", "services/ai/tests/test_qq01_03_review.py"]
    summary = {
        "client_review_date": "2026-10-16", "generated_at": datetime.now(timezone.utc).isoformat(),
        "candidate_commit": commit, "working_tree_dirty": dirty,
        "candidate_file_sha256": {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in code_files},
        "task_statuses": {task: "local_verified_awaiting_review" for task in ("QQ-01", "QQ-02", "QQ-03")},
        "ai_regression": unit, "new_reviewer_cases_subset_of_regression": dedicated,
        "frozen_live_eval": evaluation["summary"], "live_models": evaluation["models"],
        "live_smoke": {"status": live["status"], "checks": live["checks"], "synthetic_input": True,
                       "business_database": "not_used", "source_rights": "publication_not_verified",
                       "runs": {name: {"status": row["status"], "model": row["result"]["model_version"],
                                       "prompt_version": row["result"]["prompt_version"], "provider_calls": row["provider_calls"]}
                                for name, row in live["runs"].items()}},
        "worker_http_smoke": {"checks": worker["checks"], "synthetic": worker["synthetic"], "storage": worker["storage"]},
        "manual_reviews": [{"case_id": case_id, "status": "pending", "reviewer": reviewer}
                           for case_id, reviewer in (
                               ("QQ01-M01", "Duong + My"), ("QQ01-M02", "My + Thieu Quang"),
                               ("QQ02-M01", "My + Thieu"), ("QQ02-M02", "Thieu"),
                               ("QQ03-M01", "Duong + Thieu"), ("QQ03-M02", "Duong + Thieu"), ("QQ03-M03", "Duong"))],
        "reviewer_acceptance": "not_recorded",
        "fixes": ["Reject unpinned Research context/unversioned profile before provider", "Reject whitespace-only research quote"],
        "remaining_gaps": ["Scope/estimate and DU-02 mapping sign-off", "Business DB-issued snapshot -> ledger/API/dashboard evidence",
                           "Independent QA/rubric review", "Research semantic fit + AC-RES-02 keyword/user_need decision",
                           "Source/asset rights + actual approval evidence"],
        "skill_discovery": {"skill": "find-skills", "query": "api testing", "new_skill_installed": False,
                            "test_frameworks": "existing pytest/FastAPI/HTTP/Ollama eval"},
    }
    summary["automated_checks_passed"] = (
        unit["failed"] == dedicated["failed"] == 0 and unit["skipped"] == dedicated["skipped"] == 0
        and live["status"] == "passed" and all(live["checks"].values())
        and evaluation["summary"]["meets_thresholds"] and all(c["pass"] for c in evaluation["cases"])
    )
    for filename, value in (("review-summary.json", summary), ("reviewer-cases.json", verdicts)):
        (folder / filename).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"automated_checks_passed": summary["automated_checks_passed"], "regression": unit,
                      "review_cases": dedicated, "manual_pending": len(summary["manual_reviews"])}))
    return 0 if summary["automated_checks_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
