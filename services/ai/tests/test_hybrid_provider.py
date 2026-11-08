"""Hybrid mode: routine operations on the local model, customer-facing writing on Gemini."""
import asyncio
import json
from dataclasses import replace
from types import SimpleNamespace

import pytest

from conftest import run_job
from examples.growth_lead_request import mock_research_request
from src.app.providers import GeminiProvider, HybridProvider, ProviderError, build_provider
from src.app.schemas import Usage


class Stub:
    def __init__(self, name, error=None):
        self.model_version = f"{name}/model"
        self.embedding_model_version = f"{name}/embed"
        self.error = error
        self.chats = 0
        self.embeds = 0

    async def chat_json(self, *, fake, **kwargs):
        self.chats += 1
        if self.error:
            raise self.error
        return json.dumps(fake()), Usage(llm_calls=1)

    async def embed(self, texts):
        self.embeds += 1
        return [[0.0] * 768 for _ in texts], Usage(embedding_calls=1)


def chat(provider):
    return asyncio.run(provider.chat_json(system="s", user="u", schema={}, max_output_tokens=10, fake=lambda: {"ok": True}))


def test_routine_operations_never_touch_the_api_key(settings):
    local, cloud = Stub("local"), Stub("cloud")
    hybrid = HybridProvider(settings, local=local, cloud=cloud)
    for operation in ("opportunity.score", "strategy.generate", "seo.audit", "analytics.report", "learning.analyze"):
        routed = hybrid.for_operation(operation)
        chat(routed)
        assert routed.models_used == ["local/model"] and hybrid.model_version_for(operation) == "local/model"
    assert cloud.chats == 0


def test_customer_facing_writing_uses_the_cloud_model(settings):
    local, cloud = Stub("local"), Stub("cloud")
    hybrid = HybridProvider(settings, local=local, cloud=cloud)
    for operation in ("research.run", "content.generate", "content.repurpose", "seo.local_draft", "community.response"):
        routed = hybrid.for_operation(operation)
        chat(routed)
        assert routed.models_used == ["cloud/model"] and not routed.fell_back
    assert local.chats == 0


def test_exhausted_quota_falls_back_to_the_local_model(settings):
    local = Stub("local")
    cloud = Stub("cloud", ProviderError("PROVIDER_QUOTA_EXHAUSTED", "quota", retryable=True))
    routed = HybridProvider(settings, local=local, cloud=cloud).for_operation("content.generate")
    chat(routed)
    assert routed.models_used == ["local/model"] and routed.fell_back


def test_a_non_retryable_cloud_error_is_not_hidden(settings):
    cloud = Stub("cloud", ProviderError("BAD_REQUEST", "bad", retryable=False))
    routed = HybridProvider(settings, local=Stub("local"), cloud=cloud).for_operation("content.generate")
    with pytest.raises(ProviderError, match="bad"):
        chat(routed)


def test_without_an_api_key_everything_runs_locally(settings):
    hybrid = HybridProvider(replace(settings, gemini_api_key=""), local=Stub("local"))
    assert hybrid.cloud is None
    assert hybrid.model_version_for("content.generate") == "local/model"


def test_embeddings_always_stay_local_so_stored_vectors_match(settings):
    local, cloud = Stub("local"), Stub("cloud")
    routed = HybridProvider(settings, local=local, cloud=cloud).for_operation("content.generate")
    asyncio.run(routed.embed(["a", "b"]))
    assert local.embeds == 1 and cloud.embeds == 0 and routed.embedding_model_version == "local/embed"


def test_quality_operations_are_configurable(settings):
    hybrid = HybridProvider(replace(settings, quality_operations=("research.run",)), local=Stub("local"), cloud=Stub("cloud"))
    assert hybrid.model_version_for("research.run") == "cloud/model"
    assert hybrid.model_version_for("content.generate") == "local/model"


def test_hybrid_mode_is_selected_from_settings(settings):
    assert isinstance(build_provider(replace(settings, provider_mode="hybrid", gemini_api_key="")), HybridProvider)


def test_gemini_in_hybrid_mode_reports_exhaustion_instead_of_faking(settings):
    gemini = GeminiProvider(replace(settings, gemini_api_key="test-key"), fake_on_exhaustion=False)

    def exhausted(**kwargs):
        raise RuntimeError("429 RESOURCE_EXHAUSTED")

    gemini.client = SimpleNamespace(models=SimpleNamespace(generate_content=exhausted))
    with pytest.raises(ProviderError) as caught:
        chat(gemini)
    assert caught.value.code == "PROVIDER_QUOTA_EXHAUSTED" and caught.value.retryable


def test_a_run_records_the_model_that_actually_answered(settings, make_client):
    local = Stub("local")
    cloud = Stub("cloud", ProviderError("PROVIDER_QUOTA_EXHAUSTED", "quota", retryable=True))
    client = make_client(provider=HybridProvider(settings, local=local, cloud=cloud))
    body = run_job(client, mock_research_request())
    assert body["status"] == "completed", body
    # research.run asks Gemini first; with the quota gone the local model answered and the run says so.
    assert body["result"]["model_version"] == "local/model" and cloud.chats == 1
    assert "QUALITY_MODEL_UNAVAILABLE_LOCAL_MODEL_USED" in body["result"]["warnings"]


# --- Research reads more evidence when Gemini answers, and never hands that prompt to the local model

from test_research_trends import LandscapeProvider, long_source_job, signal  # noqa: E402


class CloudLandscape(LandscapeProvider):
    model_version = "cloud/model"


def test_research_on_the_cloud_model_reads_more_excerpts_than_the_local_budget(settings, make_client):
    cloud = CloudLandscape()
    client = make_client(provider=HybridProvider(settings, local=Stub("local"), cloud=cloud))
    body = run_job(client, long_source_job())
    assert body["status"] == "completed", body
    # 9 clean excerpts: the local budget stops at 6, the cloud budget reads them all.
    assert len(cloud.user["excerpts"]) == 9 > settings.max_retrieved_chunks


def test_research_lists_each_existing_article_once(settings, make_client):
    job = long_source_job()
    article = {"workspace_id": job["workspace_id"], "version": 1, "title": "Coworking in Hoi An"}
    job["payload"]["content_inventory"] = [{**article, "content_id": str(__import__("uuid").uuid4())} for _ in range(3)]
    cloud = CloudLandscape()
    run_job(make_client(provider=HybridProvider(settings, local=Stub("local"), cloud=cloud)), job)
    assert cloud.user["inventory"] == ["Coworking in Hoi An"]


def test_a_prompt_sized_for_gemini_is_not_handed_to_the_local_model(settings):
    local = Stub("local")
    cloud = Stub("cloud", ProviderError("PROVIDER_QUOTA_EXHAUSTED", "quota", retryable=True))
    routed = HybridProvider(settings, local=local, cloud=cloud).for_operation("research.run")
    big = "word " * (settings.max_input_tokens * 2)
    with pytest.raises(ProviderError) as caught:
        asyncio.run(routed.chat_json(system="s", user=big, schema={}, max_output_tokens=10, fake=dict))
    assert caught.value.code == "PROVIDER_QUOTA_EXHAUSTED" and local.chats == 0


def test_research_still_finds_a_grounded_topic_when_gemini_is_out_of_quota(settings, make_client):
    job = long_source_job()
    job["payload"]["trend_signals"] = [signal("Coworking spaces in Da Nang for expats")]
    # Pad the excerpts so the cloud-sized prompt exceeds the local budget.
    for i in range(20):
        job["payload"]["snapshot"]["sources"][0]["chunks"].append(
            {"chunk_id": f"long-{i}", "locator": f"paragraph:{200 + i}",
             "text": "Coworking spaces in Da Nang offer desks, meeting rooms and fast internet for remote workers. " * 6})
    local = Stub("local")
    cloud = Stub("cloud", ProviderError("PROVIDER_QUOTA_EXHAUSTED", "quota", retryable=True))
    body = run_job(make_client(provider=HybridProvider(settings, local=local, cloud=cloud)), job)
    assert body["status"] == "completed", body
    result = body["result"]
    assert result["result"]["status"] == "ready_for_handoff" and local.chats == 0
    assert "QUALITY_MODEL_UNAVAILABLE" in result["warnings"] and "GROUNDED_FALLBACK_USED" in result["warnings"]


# --- Stored vectors arrive packed from the worker

import base64  # noqa: E402
import struct  # noqa: E402

from src.app.schemas import SnapshotChunk  # noqa: E402


def test_a_packed_float16_embedding_is_read_as_a_vector():
    vector = [0.125, -0.5, 0.0, 1.0]
    packed = "f16:" + base64.b64encode(struct.pack("<4e", *vector)).decode()
    assert SnapshotChunk(chunk_id="c", text="t", embedding=packed).embedding == vector
    assert SnapshotChunk(chunk_id="c", text="t", embedding=vector).embedding == vector


def test_a_damaged_packed_embedding_is_rejected():
    with pytest.raises(ValueError):
        SnapshotChunk(chunk_id="c", text="t", embedding="f16:@@not-base64@@")
    with pytest.raises(ValueError):
        SnapshotChunk(chunk_id="c", text="t", embedding="f16:" + base64.b64encode(b"abc").decode())
