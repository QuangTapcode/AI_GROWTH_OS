from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from uuid import uuid4

import pytest

from conftest import run_job
from src.app.schemas import Usage
from src.agents.research.schemas import ResearchBrief


def research_job() -> dict:
    ws, src, snap = (str(uuid4()) for _ in range(3))
    return {"job_id": str(uuid4()), "workspace_id": ws, "operation": "research.run",
            "input_version": 1, "trace_id": "research-test", "synthetic": True,
            "context_snapshot_id": snap,
            "approved_source_versions": [{"source_id": src, "version": 1}],
            "payload": {"workspace_id": ws, "business_profile": {
                "company": "TripC test", "workspace_id": ws, "version": 1,
                "audiences": ["English-speaking residents"], "topic_priority": ["Living areas guide"]},
                "snapshot": {"workspace_id": ws, "snapshot_id": snap, "sources": [{
                    "source_id": src, "workspace_id": ws, "version": 1, "status": "approved",
                    "provenance": {"license": "test fixture", "attribution": "Synthetic test",
                                   "source_url": "https://example.org/guide", "retrieved_at": "2026-01-01T00:00:00Z"},
                    "chunks": [{"chunk_id": "guide", "text": "The guide compares living areas for newcomers.",
                                "locator": "paragraph:1"}]}]}}}


def test_dedicated_research_handoff_artifact_and_idempotency(client):
    request = research_job()
    body = run_job(client, request)
    assert body["status"] == "completed", body
    result = body["result"]
    brief = ResearchBrief.model_validate(result["result"])
    assert brief.status == "ready_for_handoff" and brief.handoff_role == "growth_lead"
    assert brief.findings[0].evidence.quote in request["payload"]["snapshot"]["sources"][0]["chunks"][0]["text"]
    assert result["prompt_version"] == "research-v5"
    assert result["artifact"]["role"] == "research"
    canonical = json.dumps({"result": result["result"], "evidence": result["evidence"]},
                           sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    assert result["artifact"]["content_hash"] == hashlib.sha256(canonical.encode()).hexdigest()
    retried = run_job(client, request)
    assert retried["result"] == result and retried["provider_calls"] == body["provider_calls"]


@pytest.mark.parametrize("field", ["workspace", "profile", "source", "chunk", "snapshot", "inventory"])
def test_foreign_context_rejected_before_provider(client, field):
    request = research_job()
    payload = request["payload"]
    other = str(uuid4())
    if field == "workspace": payload["workspace_id"] = other
    if field == "profile": payload["business_profile"]["workspace_id"] = other
    if field == "source": payload["snapshot"]["sources"][0]["workspace_id"] = other
    if field == "chunk": payload["snapshot"]["sources"][0]["chunks"][0]["workspace_id"] = other
    if field == "snapshot": payload["snapshot"]["snapshot_id"] = other
    if field == "inventory": payload["content_inventory"] = [{"content_id": str(uuid4()), "workspace_id": other, "version": 1, "title": "Other"}]
    response = client.post("/internal/v1/runs", json=request)
    assert response.status_code == 422


@pytest.mark.parametrize("change", ["revoked", "deleted", "wrong_version", "missing_url", "future_date", "sensitive"])
def test_ineligible_sources_not_sent_to_model(client, change):
    request = research_job()
    source = request["payload"]["snapshot"]["sources"][0]
    if change == "revoked": source["status"] = "revoked"
    if change == "deleted": source["deleted_at"] = "2026-01-02T00:00:00Z"
    if change == "wrong_version": source["version"] = 2
    if change == "missing_url": source["provenance"]["source_url"] = None
    if change == "future_date": source["provenance"]["retrieved_at"] = "2099-01-01T00:00:00Z"
    if change == "sensitive": source["chunks"][0]["text"] = "Monthly rent is 900 USD."
    body = run_job(client, request)
    assert body["status"] == "completed", body
    assert body["provider_calls"] == 0
    assert body["result"]["result"]["status"] == "insufficient_data"
    assert body["result"]["evidence"] == []


def test_inventory_dedup_and_missing_offer(client):
    request = research_job()
    request["payload"]["content_inventory"] = [{"content_id": str(uuid4()), "workspace_id": request["workspace_id"], "version": 1, "title": "Living areas guide"}]
    body = run_job(client, request)
    assert "DUPLICATE_TOPIC_DROPPED" in body["result"]["warnings"]
    assert "confirmed_offer" in body["result"]["result"]["missing_facts"]


class InventedQuoteProvider:
    model_version = "test/invented"
    embedding_model_version = "test/embed"

    async def chat_json(self, *, fake, **kwargs):
        draft = fake()
        draft["ideas"][0]["quote"] = "Not a sentence from the source"
        return json.dumps(draft), Usage(llm_calls=1)


def test_fabricated_quote_is_not_handed_off(make_client):
    body = run_job(make_client(provider=InventedQuoteProvider()), research_job())
    assert body["result"]["result"]["status"] == "insufficient_data"
    assert "UNGROUNDED_IDEA_DROPPED" in body["result"]["warnings"]


def test_input_budget_and_approval_enforced(client):
    request = research_job()
    request["payload"]["business_profile"]["overview"] = "large " * 4000
    body = run_job(client, request)
    assert body["error_code"] == "CONTEXT_BUDGET_EXCEEDED" and body["provider_calls"] == 0
    request = research_job()
    request["constraints"] = {"human_approval_required": False}
    assert client.post("/internal/v1/runs", json=request).json()["error"]["code"] == "APPROVAL_REQUIRED"


def test_six_roles_contract_is_authenticated(make_client):
    client = make_client(internal_ai_auth_token="test-internal")
    assert client.get("/internal/v1/agents").status_code == 401
    body = client.get("/internal/v1/agents", headers={"Authorization": "Bearer test-internal"}).json()
    assert len(body["roles"]) == 6 and body["concurrency"] == 1
    research = next(role for role in body["roles"] if role["id"] == "research")
    assert research["operations"][0]["status"] == "dedicated"
    assert all("publish" not in tool for role in body["roles"] for tool in role["tools"])


def test_growth_map_uses_verified_snapshot_facts_only(client):
    request = research_job()
    request["operation"] = "growth_map.suggest"
    source = request["payload"]["snapshot"]["sources"][0]
    source["facts"] = [{"key": "district", "value": "Coastal area", "verification": "verified"}]
    request["payload"]["approved_facts"] = [{"key": "price", "value": 9999,
        "source_id": source["source_id"], "source_version": 1}]
    body = run_job(client, request)
    assert body["status"] == "completed", body
    assert "9999" not in json.dumps(body["result"])
    assert any("district" in x["quote"] for x in body["result"]["evidence"])


def test_artifact_survives_service_restart(make_client):
    request = research_job()
    first = run_job(make_client(), request)
    second = make_client().get(f'/internal/v1/runs/{first["run_id"]}').json()
    assert second["result"] == first["result"]
