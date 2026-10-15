"""W1-QQ-05: growth map / goal suggestions are proposals only."""

from __future__ import annotations

import json
import re

from conftest import run_job
from evals.fixtures import SOURCE_IDS, growth_map_payload, job
from src.agents.growth_map import CHANNELS


def suggest(client, *, name: str, facts=None, approved=None, goal=None):
    payload = growth_map_payload(fact_labels=facts, goal_context=goal)
    return run_job(client, job("growth_map.suggest", payload, name=name, approved=approved if approved is not None else (facts or [])))


def test_proposal_is_pending_review_and_never_applied(client) -> None:
    body = suggest(client, name="g-basic", facts=["SRC-HOUSING-v1"])
    assert body["status"] == "completed", body
    result = body["result"]["result"]
    assert result["proposal_status"] == "pending_human_review"
    assert result["applied"] is False and result["requires_human_approval"] is True
    assert result["audiences"] and result["topics"] and result["kpis"]
    assert {channel["channel"] for channel in result["channels"]} <= set(CHANNELS)
    assert all(topic["channel"] in CHANNELS for topic in result["topics"])
    assert {kpi["metric"] for kpi in result["kpis"]} >= {"persisted_leads", "qualified_sessions"}
    assert body["result"]["prompt_version"] == "growth-map-v1"


def test_missing_baseline_never_becomes_numeric_target(client) -> None:
    body = suggest(client, name="g-no-baseline", goal={"objective": "More housing leads", "primary_metric": "persisted_leads"})
    result = body["result"]["result"]
    goal = result["goal_suggestions"][0]
    assert goal["baseline"] is None and goal["target"] is None
    assert "MISSING_BASELINE" in body["result"]["warnings"]
    assert all(kpi["target"] is None for kpi in result["kpis"])
    assert not re.search(r"\d+\s*%", json.dumps(result))


def test_zero_baseline_is_not_treated_as_missing(client) -> None:
    body = suggest(client, name="g-zero", goal={"primary_metric": "persisted_leads", "baseline": 0})
    goal = body["result"]["result"]["goal_suggestions"][0]
    assert goal["baseline"] == 0 and goal["target"] is None
    assert "ZERO_BASELINE" in body["result"]["warnings"]
    assert "MISSING_BASELINE" not in body["result"]["warnings"]


def test_unapproved_and_null_facts_are_not_evidence(client) -> None:
    body = suggest(client, name="g-facts", facts=["SRC-HOUSING-v1", "SRC-REVOKED-v1"], approved=["SRC-HOUSING-v1"])
    result = body["result"]["result"]
    assert "EXCLUDED_UNAPPROVED_FACTS:1" in body["result"]["warnings"]
    assert {ref["source_id"] for ref in body["result"]["evidence"]} <= {SOURCE_IDS["SRC-HOUSING"]}
    assert "monthly_rent" in result["missing_facts"]
    assert "9000000" not in json.dumps(result)


def test_workspace_mismatch_rejected(client) -> None:
    payload = growth_map_payload()
    payload["workspace_id"] = "30000000-0000-4000-8000-000000000001"
    response = client.post("/internal/v1/runs", json=job("growth_map.suggest", payload, name="g-tenant"))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "TENANT_SCOPE_VIOLATION"
