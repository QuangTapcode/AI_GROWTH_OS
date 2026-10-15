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
