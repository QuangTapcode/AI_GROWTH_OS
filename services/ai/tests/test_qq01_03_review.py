"""Reviewer cases QQ01/02/03; IDs map to the dated BA/QA review pack."""
import asyncio
import hashlib
import json
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

import pytest

from conftest import run_job, wait_for_run
from examples.growth_lead_request import mock_research_request
from src.app.operations import OPERATIONS
from src.app.config import Settings
from src.app.schemas import JobRequest, AIResult, Usage
from src.agents.registry import AGENT_ROLES, ROLE_TOOLS


class ObservedProvider:
    model_version = "test/qq-review"
    embedding_model_version = "test/embed"

    def __init__(self, mutate=None, delay=0):
        self.calls = []
        self.mutate = mutate
        self.delay = delay
        self.active = 0
        self.peak = 0

    async def chat_json(self, *, fake, user, **kwargs):
        self.calls.append(user)
        self.active += 1
        self.peak = max(self.peak, self.active)
        try:
            await asyncio.sleep(self.delay)
            draft = fake()
            if self.mutate:
                self.mutate(draft)
            return json.dumps(draft), Usage(llm_calls=1)
        finally:
            self.active -= 1


def fresh_request():
    request = mock_research_request()
    request["job_id"] = str(uuid4())
    request["trace_id"] = "qq-review-" + str(uuid4())
    return request


def test_QQ01_A01_bundle_matches_executable_contract(client):
    root = Path(__file__).resolve().parents[3]
    bundle = json.loads((root / "contracts/schemas/ai-six-role-contracts.json").read_text(encoding="utf-8"))
    assert bundle["job_request_schema"] == JobRequest.model_json_schema()
    assert bundle["run_result_schema"] == AIResult.model_json_schema()
    roles = client.get("/internal/v1/agents").json()["roles"]
    assert {r["id"] for r in roles} == {"research", "growth_lead", "seo", "content", "community", "performance"}
    for role in roles:
        contract = next(r for r in bundle["roles"] if r["role"] == role["id"])
        assert contract["allowed_tools"] == list(ROLE_TOOLS[role["id"]])
        assert contract["operations"] == list(AGENT_ROLES[role["id"]].operations)
        for operation in role["operations"]:
            assert operation["status"] == contract["runtime_status"][operation["name"]]
            if operation["status"] == "dedicated":
                assert operation["payload_schema"] == OPERATIONS[operation["name"]].payload_model.model_json_schema()
    research = next(r for r in bundle["roles"] if r["role"] == "research")
    assert research["input_schema"] == OPERATIONS["research.run"].payload_model.model_json_schema()


def test_QQ01_A02_marketing_roles_cannot_publish_or_mutate_ads(client):
    roles = client.get("/internal/v1/agents").json()["roles"]
    forbidden = ("publish", "send", "delete", "spend", "ads.write", "approval.grant")
    assert all(not any(word in tool for word in forbidden) for role in roles for tool in role["tools"])
    request = fresh_request()
    request["operation"] = "publish.everything"
    response = client.post("/internal/v1/runs", json=request)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNSUPPORTED_OPERATION"


def test_QQ01_A05_seven_owners_and_declared_caps_match_runtime():
    root = Path(__file__).resolve().parents[3]
    roster = (root / "docs/coordination/TEAM.md").read_text(encoding="utf-8")
    member_rows = [line for line in roster.splitlines() if line.startswith("| [")]
    assert len(member_rows) == 7
    limits = json.loads((root / "contracts/schemas/ai-six-role-contracts.json").read_text(encoding="utf-8"))["limits"]
    settings = Settings()
    assert limits["ai_concurrency"] == 1
    assert limits["max_llm_calls_per_job"] == settings.max_provider_calls == 2
    assert limits["max_attempts"] == settings.max_run_attempts == 2
    assert limits["input_token_estimate"] == settings.max_input_tokens == 2800
    assert limits["output_tokens"] == settings.max_output_tokens == 1024
    assert limits["paid_provider_budget_usd"] == JobRequest.model_validate(fresh_request()).constraints.max_cost_usd == 0
    assert limits["automatic_external_actions"] is False


def test_QQ01_A03_only_one_provider_call_is_active_per_process(make_client):
    provider = ObservedProvider(delay=0.05)
    client = make_client(provider=provider)
    first, second = fresh_request(), fresh_request()
    ids = [client.post("/internal/v1/runs", json=r).json()["run_id"] for r in (first, second)]
    assert all(wait_for_run(client, run_id)["status"] == "completed" for run_id in ids)
    assert len(provider.calls) == 2
    assert provider.peak == 1


@pytest.mark.parametrize("missing", ["job_pin", "snapshot_id", "both", "profile_version"],
                         ids=["QQ02_A01_job_pin", "QQ02_A02_snapshot_id", "QQ02_A03_both", "QQ02_A04_profile_version"])
def test_research_requires_versioned_pinned_context(make_client, missing):
    provider = ObservedProvider()
    client = make_client(provider=provider)
    request = fresh_request()
    if missing in ("job_pin", "both"):
        request.pop("context_snapshot_id")
    if missing in ("snapshot_id", "both"):
        request["payload"]["snapshot"].pop("snapshot_id")
    if missing == "profile_version":
        request["payload"]["business_profile"].pop("version")
    response = client.post("/internal/v1/runs", json=request)
    assert response.status_code == 422, response.text
    expected_code = {"job_pin": "SNAPSHOT_REQUIRED", "both": "SNAPSHOT_REQUIRED",
                     "snapshot_id": "SNAPSHOT_MISMATCH", "profile_version": "PROFILE_VERSION_REQUIRED"}[missing]
    assert response.json()["error"]["code"] == expected_code
    assert not provider.calls


@pytest.mark.parametrize("change", ["imported", "processing", "needs_review", "rejected", "revoked", "deleted", "unpinned", "stale"],
                         ids=["QQ03_A01_imported", "QQ03_A02_processing", "QQ03_A03_needs_review", "QQ03_A04_rejected",
                              "QQ03_A05_revoked", "QQ03_A06_deleted", "QQ03_A07_unpinned", "QQ03_A08_stale"])
def test_unapproved_research_never_reaches_provider(make_client, change):
    provider = ObservedProvider()
    client = make_client(provider=provider)
    request = fresh_request()
    source = request["payload"]["snapshot"]["sources"][0]
    if change == "deleted": source["deleted_at"] = "2026-01-02T00:00:00Z"
    elif change == "unpinned": request["approved_source_versions"] = []
    elif change == "stale": source["version"] = 2
    else: source["status"] = change
    body = run_job(client, request)
    assert body["status"] == "completed", body
    assert body["result"]["result"]["status"] == "insufficient_data"
    assert body["result"]["evidence"] == []
    assert body["provider_calls"] == 0 and not provider.calls


@pytest.mark.parametrize("change", ["file_url", "missing_url", "future_date", "naive_date", "missing_date"],
                         ids=["QQ03_A09_file_url", "QQ03_A10_missing_url", "QQ03_A11_future_date", "QQ03_A12_naive_date", "QQ03_A13_missing_date"])
def test_invalid_public_source_metadata_blocks_handoff(make_client, change):
    provider = ObservedProvider()
    client = make_client(provider=provider)
    request = fresh_request()
    provenance = request["payload"]["snapshot"]["sources"][0]["provenance"]
    if change == "file_url": provenance["source_url"] = "file:///secret.txt"
    if change == "missing_url": provenance["source_url"] = None
    if change == "future_date": provenance["retrieved_at"] = "2099-01-01T00:00:00Z"
    if change == "naive_date": provenance["retrieved_at"] = "2026-01-01T00:00:00"
    if change == "missing_date": provenance["retrieved_at"] = None
    body = run_job(client, request)
    assert body["status"] == "completed", body
    assert body["result"]["result"]["status"] == "insufficient_data"
    assert any(x.endswith("url") or x.endswith("fetched_at") for x in body["result"]["result"]["missing_facts"])
    assert not provider.calls


@pytest.mark.parametrize("change", ["quote", "blank_quote", "chunk", "demand", "price"],
                         ids=["QQ03_A14_fake_quote", "QQ03_A15_blank_quote", "QQ03_A16_fake_chunk", "QQ03_A17_fake_demand", "QQ03_A18_fake_price"])
def test_fabricated_model_output_never_becomes_an_opportunity(make_client, change):
    def mutate(draft):
        idea = draft["ideas"][0]
        if change == "quote": idea["quote"] = "This sentence does not exist in the source."
        if change == "blank_quote": idea["quote"] = " "
        if change == "chunk": idea["chunk_id"] = "unknown-chunk"
        if change == "demand": idea["rationale"] = "Demand is 98765 monthly searches."
        if change == "price": idea["offer_fit"] = "Monthly rent is 900 USD."
    body = run_job(make_client(provider=ObservedProvider(mutate)), fresh_request())
    assert body["status"] == "completed", body
    assert body["result"]["result"]["status"] == "insufficient_data"
    assert body["result"]["evidence"] == []
    assert body["result"]["result"]["findings"] == []


def test_QQ03_A19_valid_opportunity_preserves_provenance_and_missing_facts(client):
    request = fresh_request()
    request["payload"]["business_profile"]["services"] = []
    body = run_job(client, request)
    output = body["result"]
    brief = output["result"]
    finding = brief["findings"][0]
    source = request["payload"]["snapshot"]["sources"][0]
    assert "confirmed_offer" in brief["missing_facts"]
    assert finding["demand_estimate"] is None and finding["confidence"] == "hypothesis"
    assert finding["url"] == source["provenance"]["source_url"]
    assert finding["evidence"]["quote"] in source["chunks"][0]["text"]
    assert finding["evidence"]["attribution"] == source["provenance"]["attribution"]
    assert finding["evidence"]["license"] == source["provenance"]["license"]
    assert finding["fetched_at"] == source["provenance"]["retrieved_at"]
    assert brief["handoff_role"] == "growth_lead" and brief["handoff_operation"] == "opportunity.score"
    assert brief["requires_human_approval"] and not brief["applied"] and brief["synthetic"]


@pytest.mark.parametrize("field", ["audience_fit", "offer_fit", "rationale", "user_need"])
def test_QQ03_A21_incomplete_explanation_is_not_handed_off(make_client, field):
    def mutate(draft):
        draft["ideas"][0][field] = "This explanation stops before"
    body = run_job(make_client(provider=ObservedProvider(mutate)), fresh_request())
    assert body["result"]["result"]["findings"] == []
    assert "complete_research_explanation" in body["result"]["result"]["missing_facts"]
    assert "INCOMPLETE_BRIEF_DROPPED" in body["result"]["warnings"]


def test_QQ03_A20_duplicate_topics_and_inventory_are_not_handed_off(make_client):
    def duplicate(draft):
        draft["ideas"].append(deepcopy(draft["ideas"][0]))
    client = make_client(provider=ObservedProvider(duplicate))
    first = fresh_request()
    result = run_job(client, first)["result"]
    assert len(result["result"]["findings"]) == 1
    assert "DUPLICATE_TOPIC_DROPPED" in result["warnings"]
    second = fresh_request()
    second["payload"]["content_inventory"] = [{"workspace_id": second["workspace_id"],
        "content_id": str(uuid4()), "version": 1, "title": "Living areas guide"}]
    assert run_job(client, second)["result"]["result"]["findings"] == []


def test_QQ02_A05_artifact_hash_scope_version_and_retry_survive_restart(make_client):
    first = make_client()
    request = fresh_request()
    body = run_job(first, request)
    output = body["result"]
    artifact = output["artifact"]
    canonical = json.dumps({"result": output["result"], "evidence": output["evidence"]},
                           ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    assert artifact["content_hash"] == hashlib.sha256(canonical.encode()).hexdigest()
    assert artifact["workspace_id"] == request["workspace_id"]
    assert artifact["version"] == request["input_version"]
    assert artifact["context_snapshot_id"] == request["context_snapshot_id"]
    first.__exit__(None, None, None)
    restarted = make_client()
    assert restarted.get(f'/internal/v1/runs/{body["run_id"]}').json()["result"] == output
    replay = run_job(restarted, request)
    assert replay["result"] == output and replay["provider_calls"] == body["provider_calls"]
    changed = deepcopy(request)
    changed["payload"]["business_profile"]["company"] = "Changed test company"
    assert restarted.post("/internal/v1/runs", json=changed).status_code == 409


def test_QQ01_A04_repair_budget_does_not_reset_across_operations(make_client):
    def invalid(draft): draft["unexpected_tool"] = "publish.everything"
    provider = ObservedProvider(invalid)
    client = make_client(provider=provider)
    request = fresh_request()
    failed = run_job(client, request)
    assert failed["error_code"] == "INVALID_STRUCTURED_OUTPUT"
    assert failed["provider_calls"] == len(provider.calls) == 2
    other = {**request, "operation": "health.check", "payload": {}}
    refused = run_job(client, other)
    assert refused["error_code"] == "CALL_CAP_EXCEEDED"
    assert len(provider.calls) == 2
