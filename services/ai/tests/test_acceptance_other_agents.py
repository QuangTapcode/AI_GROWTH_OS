"""Research, Growth Lead, Performance and Learning against AC-RES, AC-CAM, AC-PER and AC-LRN in DU-01.

Each test goes through /internal/v1/runs. xfail(strict) marks a requirement not met yet; the reason names the gap in
docs/reports/AGENT-ACCEPTANCE-2026-11-04.md.
"""
import hashlib
import json
from uuid import uuid4

import pytest

from conftest import run_job
from examples.growth_lead_request import growth_lead_request, mock_research_request
from examples.six_role_requests import artifact_input, leads, metrics, request


def research_of(client):
    base = mock_research_request()
    base["payload"]["content_inventory"] = []
    out = run_job(client, base)
    assert out["status"] == "completed", out
    return base, out["result"]


def rehashed(brief):
    canonical = json.dumps({"result": brief["result"], "evidence": [f["evidence"] for f in brief["result"]["findings"]]},
                           sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    brief["artifact"]["content_hash"] = hashlib.sha256(canonical.encode()).hexdigest()
    return brief


def plan_of(client, base, brief, **payload):
    job = growth_lead_request(base, brief)
    job["job_id"] = str(uuid4())
    job["payload"].update(payload)
    out = run_job(client, job)
    assert out["status"] == "completed", out
    return out["result"]["result"]


def report_of(client, base, **metric_options):
    out = run_job(client, request(base, "analytics.report", {"metrics": metrics(base, **metric_options)}))
    assert out["status"] == "completed", out
    return out["result"]


# --- AC-RES-01, AC-RES-02

def test_ac_res_01_a_finding_rests_on_a_public_url_with_a_time_and_a_reason(client):
    _, research = research_of(client)
    finding = research["result"]["findings"][0]
    assert finding["evidence"]["source_url"].startswith("https://") and finding["fetched_at"] and finding["rationale"]
    assert finding["evidence"]["quote"] in "The guide compares living areas for newcomers."


def test_ac_res_02_the_brief_has_topic_keywords_need_and_open_points(client):
    _, research = research_of(client)
    finding = research["result"]["findings"][0]
    assert finding["topic"] and finding["keywords"] and finding["user_need"]
    assert isinstance(research["result"]["missing_facts"], list)
    assert research["result"]["handoff_role"] == "growth_lead"


def test_ac_res_01_demand_is_not_invented(client):
    _, research = research_of(client)
    assert research["result"]["findings"][0]["demand_estimate"] is None


# --- AC-CAM-01, AC-CAM-02

def test_ac_cam_01_the_score_uses_the_agreed_formula_and_says_it_is_an_estimate(client):
    base, research = research_of(client)
    score = plan_of(client, base, research, score_factors={})["opportunity_score"]
    assert score["estimated"] is True and score["label"] == "estimated"
    product = 1
    for name in ("demand", "business_relevance", "growth_potential", "content_gap", "freshness", "conversion_potential"):
        product *= score["factors"][name]
    assert score["score"] == product


def test_ac_cam_02_the_plan_gives_seo_and_content_an_audience_a_cta_and_a_deadline(client):
    base, research = research_of(client)
    plan = plan_of(client, base, research)
    assert [task["role"] for task in plan["tasks"]] == ["seo", "content"]
    for task in plan["tasks"]:
        assert task["brief"]["audience"] and task["brief"]["cta"] and task["deadline"]
    assert plan["requires_human_approval"] is True and plan["applied"] is False


@pytest.mark.xfail(strict=True, reason="GAP-GL-1: the top finding is taken even when its evidence is stale, which blocks the plan while a usable finding is next to it")
def test_a_plan_does_not_block_on_a_stale_finding_when_a_fresh_one_is_available(client):
    # Seen on a copy of the real data: once traffic was measured, three rounds in a row chose a 2018 excerpt and ended PLAN_BLOCKED, with no article.
    base, research = research_of(client)
    stale = research["result"]["findings"][0]
    fresh = {**stale, "topic": "Newcomer checklist", "keywords": ["newcomer checklist"], "offer_fit": "No match", "user_need": "A newcomer needs a checklist."}
    research["result"]["findings"] = [{**stale, "topic": "Local living information MOCK", "keywords": ["local living information"], "evidence_updated": 2018}, fresh]
    research["result"]["missing_facts"] = ["stale_evidence:2018"]
    plan = plan_of(client, base, rehashed(research), score_factors={}, latest_metrics=metrics(base))
    assert plan["priority"]["mode"] == "conversion"
    assert plan["status"] == "proposed" and plan["selected_opportunity"]["topic"] == "Newcomer checklist"


# --- AC-PER-01, AC-PER-02

def test_ac_per_01_a_zero_is_reported_as_zero_and_a_missing_number_as_missing(client):
    base, _ = research_of(client)
    zero = report_of(client, base, zero=True)["result"]
    assert zero["metrics"]["qualified_visits"] == 0 and zero["status"] == "draft"
    missing = report_of(client, base, missing=True)["result"]
    assert missing["metrics"]["qualified_visits"] is None and missing["status"] == "insufficient_data"


def test_ac_per_02_a_report_only_proposes_and_cannot_spend(client):
    base, _ = research_of(client)
    result = report_of(client, base)["result"]
    assert result["spend_mutation_allowed"] is False and result["applied"] is False and result["requires_human_approval"] is True


# --- AC-LRN-01, AC-LRN-02

def test_ac_lrn_01_02_a_measured_result_gives_a_lesson_and_one_next_task(client):
    base, _ = research_of(client)
    performance = report_of(client, base)
    out = run_job(client, request(base, "learning.analyze", {"performance": artifact_input(performance), "lead_summary": leads(base, count=2)}))
    result = out["result"]["result"]
    assert result["learning"] and len(result["next_tasks"]) == 1
    task = result["next_tasks"][0]
    assert task["operation"] == "research.run" and task["reason"] and task["dedup_key"]
    assert result["requires_human_approval"] is True


def test_ac_lrn_02_nothing_measured_opens_no_round(client):
    base, _ = research_of(client)
    performance = report_of(client, base, zero=True)
    out = run_job(client, request(base, "learning.analyze", {"performance": artifact_input(performance), "lead_summary": leads(base, count=0)}))
    assert out["result"]["result"]["next_tasks"] == [] and out["result"]["result"]["stopped_reason"] == "no_measured_signal"
