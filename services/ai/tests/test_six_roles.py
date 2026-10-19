import hashlib
import json
from copy import deepcopy
from uuid import uuid4

import pytest

from conftest import run_job
from examples.six_role_requests import artifact_input, mock_research_request, growth_lead_request, request, metrics, leads, image
from src.app.schemas import Usage


def run(client, job):
    body = run_job(client, job)
    assert body["status"] == "completed", body
    return body["result"]


def chain(client):
    base = mock_research_request()
    research = run(client, base)
    plan = run(client, growth_lead_request(base, research))
    seo_job = request(base, "seo.local_draft", {"research": artifact_input(research), "cta": "Request the guide"})
    seo = run(client, seo_job)
    content_job = request(base, "content.repurpose", {"source_article": artifact_input(seo), "cta": "Request the guide", "assets": [image(base)]})
    content = run(client, content_job)
    performance_job = request(base, "analytics.report", {"metrics": metrics(base)})
    performance = run(client, performance_job)
    return base, research, plan, seo, content, performance, seo_job, content_job, performance_job


def test_six_dedicated_roles_end_to_end(client):
    base, research, plan, seo, social, performance, *_ = chain(client)
    assert research["result"]["findings"][0]["keywords"]
    assert research["result"]["findings"][0]["user_need"]
    assert plan["result"]["opportunity_score"]["score"] == 3 ** 6
    assert plan["result"]["opportunity_score"]["estimated"] is True
    assert all(t["deadline"] for t in plan["result"]["tasks"])
    assert all(seo["result"]["seo_checks"].values())
    assert social["result"]["parent_content_id"] == seo["result"]["article_id"]
    assert social["result"]["parent_version"] == seo["artifact"]["version"]
    assert social["result"]["image_assets"] and social["result"]["synthetic"]
    community = run(client, request(base, "community.response", {"question": "Can you explain living areas?"}))
    assert community["result"]["citations"] and not community["result"]["applied"]
    learning = run(client, request(base, "learning.analyze", {"performance": artifact_input(performance), "lead_summary": leads(base)}))
    assert len(learning["result"]["next_tasks"]) == 1
    assert learning["result"]["next_tasks"][0]["input_artifact_refs"]
    roles = client.get("/internal/v1/agents").json()["roles"]
    assert len(roles) == 6
    assert all(op["status"] == "dedicated" for r in roles for op in r["operations"])


@pytest.mark.parametrize("role", ["seo", "content", "performance", "community", "learning"])
def test_tenant_approval_and_context_are_enforced(client, role):
    base, research, _, seo, _, perf, *_ = chain(client)
    specs = {
        "seo": ("seo.local_draft", {"research": artifact_input(research), "cta": "Request the guide"}),
        "content": ("content.repurpose", {"source_article": artifact_input(seo), "cta": "Request the guide"}),
        "performance": ("analytics.report", {"metrics": metrics(base)}),
        "community": ("community.response", {"question": "living areas?"}),
        "learning": ("learning.analyze", {"performance": artifact_input(perf), "lead_summary": leads(base)}),
    }
    job = request(base, *specs[role])
    job["payload"]["workspace_id"] = str(uuid4())
    assert client.post("/internal/v1/runs", json=job).status_code == 422
    job = request(base, *specs[role])
    job["constraints"] = {"human_approval_required": False}
    assert client.post("/internal/v1/runs", json=job).status_code == 422


def test_revoked_or_tampered_parent_is_rejected(client):
    base, _, _, _, _, _, seo_job, content_job, _ = chain(client)
    for job, field in [(seo_job, "research"), (content_job, "source_article")]:
        tampered = deepcopy(job)
        tampered["job_id"] = str(uuid4())
        tampered["payload"][field]["result"]["workspace_id"] = str(uuid4())
        assert client.post("/internal/v1/runs", json=tampered).status_code == 422
        revoked = deepcopy(job)
        revoked["job_id"] = str(uuid4())
        revoked["payload"]["snapshot"]["sources"][0]["status"] = "revoked"
        assert client.post("/internal/v1/runs", json=revoked).status_code == 422


@pytest.mark.parametrize("state", ["missing", "pending", "revoked", "foreign"])
def test_real_asset_requirement_never_fakes_an_image(client, state):
    base, _, _, _, _, _, _, content_job, _ = chain(client)
    content_job["job_id"] = str(uuid4())
    if state == "missing": content_job["payload"]["assets"] = []
    elif state == "foreign": content_job["payload"]["assets"][0]["workspace_id"] = str(uuid4())
    else: content_job["payload"]["assets"][0]["status"] = state
    if state == "foreign":
        assert client.post("/internal/v1/runs", json=content_job).status_code == 422
    else:
        output = run(client, content_job)["result"]
        assert output["status"] == "needs_assets" and output["image_assets"] == []


@pytest.mark.parametrize("question", ["What is the monthly rent?", "What is the address?", "I want to book a room."])
def test_community_escalates_missing_sensitive_facts_or_lead_consent(client, question):
    base = mock_research_request()
    body = run_job(client, request(base, "community.response", {"question": question}))
    result = body["result"]["result"]
    assert result["escalation_required"] and result["status"] == "insufficient_data"
    assert not result["applied"]
    if "book" in question:
        assert result["lead_proposal"]["persisted"] is False
        assert result["lead_proposal"]["requires_consent"]
    else:
        assert body["provider_calls"] == 0


@pytest.mark.parametrize("mode", ["none", "missing", "zero"])
def test_metrics_distinguish_zero_from_missing(client, mode):
    base = mock_research_request()
    payload = {"metrics": None if mode == "none" else metrics(base, missing=mode == "missing", zero=mode == "zero")}
    body = run_job(client, request(base, "analytics.report", payload))
    result = body["result"]["result"]
    assert body["provider_calls"] == 0
    assert result["metrics"]["leads"] == (0 if mode == "zero" else None)
    assert result["status"] == ("draft" if mode == "zero" else "insufficient_data")
    assert result["spend_mutation_allowed"] is False


@pytest.mark.parametrize("stop", ["missing", "max_iterations", "task_quota", "duplicate"])
def test_learning_is_bounded_and_never_invents_metrics(client, stop):
    base, _, _, _, _, performance, *_ = chain(client)
    payload = {"performance": artifact_input(performance), "lead_summary": leads(base)}
    if stop == "missing": payload.pop("performance")
    if stop == "max_iterations": payload["iteration"] = 3
    if stop == "task_quota": payload["task_quota"] = 0
    if stop == "duplicate":
        previous = run(client, request(base, "learning.analyze", payload))["result"]
        payload["prior_dedup_keys"] = [previous["next_tasks"][0]["dedup_key"]]
    result = run(client, request(base, "learning.analyze", payload))["result"]
    assert result["next_tasks"] == [] and result["stopped_reason"]
    if stop == "missing": assert result["learning"] == []


def test_learning_rejects_contact_data_and_replay_preserves_result(client):
    base, _, _, _, _, performance, *_ = chain(client)
    aggregate = leads(base)
    aggregate["result"]["email"] = "sensitive@example.org"
    job = request(base, "learning.analyze", {"performance": artifact_input(performance), "lead_summary": aggregate})
    assert client.post("/internal/v1/runs", json=job).status_code == 422
    job = request(base, "learning.analyze", {"performance": artifact_input(performance), "lead_summary": leads(base)})
    first = run(client, job)
    assert run(client, job) == first
