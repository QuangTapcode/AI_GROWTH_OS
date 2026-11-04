import hashlib
import json
from copy import deepcopy
from uuid import uuid4

import pytest

from conftest import run_job
from examples.growth_lead_request import growth_lead_request, mock_research_request
from src.app.schemas import Usage


def request_for(client):
    request = mock_research_request()
    request["payload"]["content_inventory"] = []
    return growth_lead_request(request, run_job(client, request)["result"])


@pytest.mark.parametrize("operation", ["opportunity.score", "strategy.generate", "brief.generate"])
def test_dedicated_plan_handoff_and_retry(client, operation):
    request = request_for(client)
    request["operation"] = operation
    body = run_job(client, request)
    assert body["status"] == "completed", body
    output = body["result"]
    plan = output["result"]
    assert output["artifact"]["role"] == "growth_lead" and output["prompt_version"] == "growth-lead-v1"
    assert plan["status"] == "proposed" and plan["synthetic"] and not plan["applied"]
    seo, social = plan["tasks"]
    assert social["depends_on"] == social["dependency_artifact_from"] == [seo["task_id"]]
    assert seo["depends_on"] == []
    assert all(t["input_artifact_refs"] == [request["payload"]["research_artifact"]] for t in plan["tasks"])
    assert plan["selected_opportunity"] in request["payload"]["research"]["findings"]
    assert run_job(client, request)["result"] == output


@pytest.mark.parametrize("change", ["workspace", "snapshot", "profile", "hash", "revoked", "approval"])
def test_invalid_context_rejected_before_run(client, change):
    request = request_for(client)
    p = request["payload"]
    if change == "workspace": p["research_artifact"]["workspace_id"] = str(uuid4())
    if change == "snapshot": p["research"]["context_snapshot_id"] = str(uuid4())
    if change == "profile": p["business_profile"]["version"] = 2
    if change == "hash": p["research"]["findings"][0]["topic"] = "Forged topic"
    if change == "revoked": p["snapshot"]["sources"][0]["status"] = "revoked"
    if change == "approval": request["constraints"] = {"human_approval_required": False}
    assert client.post("/internal/v1/runs", json=request).status_code == 422


@pytest.mark.parametrize("field", ["cta", "audiences", "services", "version"])
def test_missing_business_data_blocks_plan(client, field):
    request = request_for(client)
    if field == "cta": request["payload"].pop("cta")
    elif field == "version":
        request["payload"]["business_profile"]["version"] = None
        # Profile mismatch must be rejected rather than silently replacing prior research.
        assert client.post("/internal/v1/runs", json=request).status_code == 422
        return
    else: request["payload"]["business_profile"][field] = []
    body = run_job(client, request)
    assert body["result"]["result"]["status"] == "blocked"
    assert body["result"]["result"]["missing_facts"]


class BadSelectionProvider:
    model_version = "test/selection"
    embedding_model_version = "test/embed"
    async def chat_json(self, **kwargs):
        return json.dumps({"finding_index": 2}), Usage(llm_calls=1)


def test_model_cannot_invent_opportunity(client, make_client):
    request = request_for(client)
    result = run_job(make_client(provider=BadSelectionProvider()), request)
    assert result["error_code"] == "INVALID_OPPORTUNITY"


def test_no_research_produces_blocked_plan_without_model(client):
    request = mock_research_request()
    request["payload"]["snapshot"]["sources"][0]["provenance"]["source_url"] = None
    research = run_job(client, request)["result"]
    body = run_job(client, growth_lead_request(request, research))
    assert body["provider_calls"] == 0
    assert body["result"]["result"]["tasks"] == []
    assert body["result"]["result"]["status"] == "blocked"


def test_plan_budget_and_restart(client, make_client):
    request = request_for(client)
    body = run_job(client, request)
    assert make_client().get(f'/internal/v1/runs/{body["run_id"]}').json()["result"] == body["result"]
    huge = deepcopy(request)
    huge["job_id"] = str(uuid4())
    huge["payload"]["business_profile"]["overview"] = "large " * 4000
    assert run_job(client, huge)["error_code"] == "CONTEXT_BUDGET_EXCEEDED"


@pytest.mark.parametrize("change", ["past_deadline", "naive_deadline", "negative_score", "large_score"])
def test_new_plan_rejects_invalid_deadline_or_estimated_factor(client, change):
    job = request_for(client)
    if change == "past_deadline": job["payload"]["deadline"] = "2020-01-01T00:00:00Z"
    elif change == "naive_deadline": job["payload"]["deadline"] = "2099-01-01T00:00:00"
    else: job["payload"]["score_factors"]["demand"] = -1 if change == "negative_score" else 6
    assert client.post("/internal/v1/runs", json=job).status_code == 422


def test_missing_deadline_blocks_enqueue_and_unknown_score_stays_null(client):
    job = request_for(client)
    job["payload"].pop("deadline")
    job["payload"]["score_factors"] = {"demand": None}
    result = run_job(client, job)["result"]["result"]
    assert result["status"] == "blocked" and "campaign_deadline" in result["missing_facts"]
    assert result["opportunity_score"]["score"] is None
    assert result["opportunity_score"]["label"] == "insufficient_data"


def test_research_coverage_notes_do_not_block_but_stale_selected_evidence_does(client):
    from examples.growth_lead_request import growth_lead_request, mock_research_request
    base = mock_research_request()
    research = run_job(client, base)["result"]

    def plan(missing, evidence_updated=None):
        brief = json.loads(json.dumps(research))
        brief["result"]["missing_facts"] = missing
        brief["result"]["findings"][0]["evidence_updated"] = evidence_updated
        canonical = json.dumps({"result": brief["result"], "evidence": brief["evidence"]}, sort_keys=True,
                               ensure_ascii=False, separators=(",", ":"))
        brief["artifact"]["content_hash"] = hashlib.sha256(canonical.encode()).hexdigest()
        job = growth_lead_request(base, brief)
        job["job_id"] = str(uuid4())
        return run_job(client, job)["result"]["result"]

    gap = plan(["source_gap:coworking"])
    assert gap["status"] == "proposed" and "source_gap:coworking" in gap["missing_facts"]
    # A grounded finding recovered after the model's draft was dropped is still a valid opportunity.
    dropped_draft = plan(["complete_research_explanation", "source_gap:community events"])
    assert dropped_draft["status"] == "proposed" and "complete_research_explanation" in dropped_draft["missing_facts"]
    stale = plan(["stale_evidence:2018"], evidence_updated=2018)
    assert stale["status"] == "blocked" and "stale_evidence:2018" in stale["missing_facts"]


def test_score_is_derived_from_research_signals_when_no_operator_estimate(client):
    from datetime import datetime, timezone
    from src.agents.growth_lead.scoring import SOURCE, derive_factors
    from src.agents.research.schemas import ResearchFinding, TrendCoverage
    from src.app.schemas import BusinessProfile
    now = datetime.now(timezone.utc).isoformat()
    signal = lambda rank, prev=None, new=False: {"signal_id": str(uuid4()), "query": "Da Nang coworking expats", "rank": rank,
        "title": "Coworking in Da Nang", "url": f"https://x.example/{rank}", "domain": "x.example", "observed_at": now,
        "previous_rank": prev, "is_new": new}
    finding = ResearchFinding(topic="Coworking for remote workers", audience_fit="Fits.", offer_fit="TripC lists coworking options.",
        rationale="Excerpt.", url="https://tripc.ai/blog/x", fetched_at=now, keywords=["coworking"], user_need="Work.",
        evidence={"source_id": str(uuid4()), "source_version": 1, "chunk_id": "c", "quote": "Coworking spaces near the beach.",
                  "source_url": "https://tripc.ai/blog/x"},
        trend_signals=[signal(1, 2), signal(3, new=True), signal(6, 9)])
    profile = BusinessProfile(company="TripC", products=["housing", "coworking"])
    coverage = [TrendCoverage(query="Da Nang coworking expats", topic="coworking", signal_count=10, covered_chunks=8, distinct_domains=10)]
    factors, basis = derive_factors(finding, coverage, profile, "Ask TripC")
    assert factors == {"demand": 4, "business_relevance": 3, "growth_potential": 4, "content_gap": 2, "freshness": 4, "conversion_potential": 3}
    assert "not search volume" in basis["demand"] and set(basis) == set(factors)
    stale, _ = derive_factors(finding.model_copy(update={"evidence_updated": 2018, "trend_signals": []}), [], profile, None)
    assert stale["freshness"] == 1 and stale["demand"] == 1 and stale["conversion_potential"] == 2

    job = request_for(client)
    job["payload"].pop("score_factors", None)
    result = run_job(client, job)["result"]["result"]["opportunity_score"]
    assert result["source"] == SOURCE and result["label"] == "estimated" and result["score"] is not None and result["basis"]


def test_findings_are_ranked_by_derived_score_without_a_model_call(client):
    from examples.growth_lead_request import growth_lead_request, mock_research_request
    base = mock_research_request()
    research = run_job(client, base)["result"]
    brief = json.loads(json.dumps(research))
    first = brief["result"]["findings"][0]
    now = first["fetched_at"]
    signal = lambda title, rank: {"signal_id": str(uuid4()), "query": "Da Nang living areas expats", "rank": rank, "title": title,
                                  "url": f"https://x.example/{rank}", "domain": "x.example", "observed_at": now}
    strong = {**first, "topic": "Living areas guide for services", "trend_signals": [signal("Living areas guide", 1), signal("Areas guide", 2), signal("Living areas", 3)]}
    weak = {**first, "topic": "Weather overview", "keywords": ["weather"], "trend_signals": []}
    brief["result"]["findings"] = [weak, strong]
    brief["evidence"] = [weak["evidence"], strong["evidence"]]
    canonical = json.dumps({"result": brief["result"], "evidence": brief["evidence"]}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    brief["artifact"]["content_hash"] = hashlib.sha256(canonical.encode()).hexdigest()
    job = growth_lead_request(base, brief)
    job["job_id"] = str(uuid4())
    job["payload"].pop("score_factors", None)
    body = run_job(client, job)
    plan = body["result"]["result"]
    assert plan["selection_method"] == "derived_score_ranking" and body["provider_calls"] == 0
    assert [r["finding_index"] for r in plan["ranked_opportunities"]] == [1, 0]
    assert plan["ranked_opportunities"][0]["score"] > plan["ranked_opportunities"][1]["score"]
    assert plan["selected_opportunity"]["topic"] == "Living areas guide for services"
    assert plan["opportunity_score"]["score"] == plan["ranked_opportunities"][0]["score"]


def test_a_finding_on_the_requested_offer_outranks_a_higher_scored_one(client):
    from examples.growth_lead_request import growth_lead_request, mock_research_request
    base = mock_research_request()
    research = run_job(client, base)["result"]
    brief = json.loads(json.dumps(research))
    first = brief["result"]["findings"][0]
    now = first["fetched_at"]
    signal = lambda title, rank: {"signal_id": str(uuid4()), "query": "Da Nang living areas expats", "rank": rank, "title": title,
                                  "url": f"https://x.example/{rank}", "domain": "x.example", "observed_at": now}
    strong = {**first, "topic": "Living areas guide for services", "trend_signals": [signal("Living areas guide", 1), signal("Areas guide", 2)]}
    requested = {**first, "topic": "Street food stalls", "keywords": ["street food"], "trend_signals": []}
    brief["result"]["findings"] = [strong, requested]
    brief["evidence"] = [strong["evidence"], requested["evidence"]]
    canonical = json.dumps({"result": brief["result"], "evidence": brief["evidence"]}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    brief["artifact"]["content_hash"] = hashlib.sha256(canonical.encode()).hexdigest()
    job = growth_lead_request(base, brief)
    job["job_id"] = str(uuid4())
    job["payload"].pop("score_factors", None)
    job["payload"]["goal_context"] = {**(job["payload"].get("goal_context") or {}), "focus_offers": ["food"]}
    plan = run_job(client, job)["result"]["result"]
    assert plan["selected_opportunity"]["topic"] == "Street food stalls"
    assert [r["finding_index"] for r in plan["ranked_opportunities"]] == [1, 0]


def kpi_plan(client, metrics_values, target=3):
    """A plan choosing between a topic people can find and a topic close to the offer, given measured KPIs."""
    from examples.growth_lead_request import growth_lead_request, mock_research_request
    from examples.six_role_requests import aggregate
    base = mock_research_request()
    base["payload"]["business_profile"]["products"] = ["housing"]
    research = run_job(client, base)["result"]
    brief = json.loads(json.dumps(research))
    first = brief["result"]["findings"][0]
    now = first["fetched_at"]
    signal = lambda rank: {"signal_id": str(uuid4()), "query": "Da Nang weather expats", "rank": rank, "title": "Weather overview for expats",
                           "url": f"https://x.example/{rank}", "domain": "x.example", "observed_at": now, "is_new": True}
    findable = {**first, "topic": "Weather overview", "keywords": ["weather"], "offer_fit": "Fits.", "trend_signals": [signal(1), signal(2), signal(3)]}
    close_to_offer = {**first, "topic": "Housing near the river", "keywords": ["housing"], "offer_fit": "TripC can help with housing.", "trend_signals": []}
    brief["result"]["findings"] = [findable, close_to_offer]
    brief["evidence"] = [findable["evidence"], close_to_offer["evidence"]]
    canonical = json.dumps({"result": brief["result"], "evidence": brief["evidence"]}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    brief["artifact"]["content_hash"] = hashlib.sha256(canonical.encode()).hexdigest()
    job = growth_lead_request(base, brief)
    job["job_id"] = str(uuid4())
    job["payload"].pop("score_factors", None)
    measurement = {"definition": "Leads in the window", "unit": "count", "source": "first_party", "scope": "site"}
    job["payload"]["goal_context"] = {**(job["payload"].get("goal_context") or {}), "kpis": [
        {"metric_name": "leads", "baseline_value": None, "target_value": target, "current_value": None, "baseline_status": "missing", "measurement": measurement}]}
    if metrics_values is not None:
        job["payload"]["latest_metrics"] = aggregate(job, {"workspace_id": job["workspace_id"], "snapshot_id": str(uuid4()), "version": 1,
            "window_start": "2026-10-01T00:00:00Z", "window_end": "2026-10-08T00:00:00Z", "synthetic": True, **metrics_values}, role="performance")
    body = run_job(client, job)
    assert body["status"] == "completed", body
    return body["result"]["result"]


def test_without_traffic_the_plan_chooses_the_topic_people_can_find(client):
    plan = kpi_plan(client, {"qualified_visits": 0, "leads": 0, "clicks": 0, "impressions": 0})
    assert plan["priority"]["mode"] == "reach"
    assert plan["selected_opportunity"]["topic"] == "Weather overview"
    assert plan["kpi_progress"] == [{"metric_name": "leads", "target_value": 3, "current_value": 0, "status": "behind"}]


def test_with_traffic_but_few_leads_the_plan_chooses_the_topic_close_to_the_offer(client):
    plan = kpi_plan(client, {"qualified_visits": 40, "leads": 1, "clicks": 70, "impressions": 900})
    assert plan["priority"]["mode"] == "conversion"
    assert plan["selected_opportunity"]["topic"] == "Housing near the river"


def test_a_reached_target_is_reported_and_the_plan_maintains(client):
    plan = kpi_plan(client, {"qualified_visits": 40, "leads": 5, "clicks": 70, "impressions": 900})
    assert plan["priority"]["mode"] == "maintain"
    assert plan["kpi_progress"][0]["status"] == "reached"


def test_without_a_measurement_the_plan_keeps_the_plain_score_and_says_so(client):
    plan = kpi_plan(client, None)
    assert plan["priority"] is None and plan["kpi_progress"] == []
