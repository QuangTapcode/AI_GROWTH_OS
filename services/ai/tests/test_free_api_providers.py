"""Groq and OpenRouter's free models answer the Community bot after Gemini's spare, before the local model."""
import asyncio
import json
from dataclasses import replace
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from src.app.free_providers import GROQ_URL, OPENROUTER_URL, FreeApiProvider, free_api_providers, json_object
from src.app.free_quota import FreeTierQuota
from src.app.gemini_quota import GeminiQuota
from src.app.providers import HybridProvider, ProviderError
from test_hybrid_provider import Stub, chat

NOW = datetime(2026, 11, 12, 10, 0, tzinfo=timezone.utc)
ANSWER = {"choices": [{"message": {"content": '```json\n{"ok": true}\n```'}}],
          "usage": {"prompt_tokens": 1800, "completion_tokens": 120}, "model": "google/gemma-4-31b-it:free"}


def quota(tmp_path, provider, *, limit, reserve, clock=lambda: NOW):
    return FreeTierQuota(str(tmp_path / "runs.sqlite3"), provider=provider, daily_limit=limit, reserve=reserve, clock=clock)


def groq(settings, tmp_path, handler, *, reserve=300, q=None):
    return FreeApiProvider(settings, name="groq", base_url=GROQ_URL, api_key="g", model="openai/gpt-oss-120b",
                           quota=q or quota(tmp_path, "groq", limit=1000, reserve=reserve), input_limit=5000,
                           transport=httpx.MockTransport(handler))


def openrouter(settings, tmp_path, handler, *, q=None):
    return FreeApiProvider(settings, name="openrouter", base_url=OPENROUTER_URL, api_key="o",
                           model="google/gemma-4-31b-it:free", fallback_models=("openrouter/free",),
                           quota=q or quota(tmp_path, "openrouter", limit=50, reserve=15), input_limit=16000,
                           transport=httpx.MockTransport(handler))


def groq_headers(remaining, tokens_left=7000):
    return {"x-ratelimit-limit-requests": "1000", "x-ratelimit-remaining-requests": str(remaining),
            "x-ratelimit-remaining-tokens": str(tokens_left), "x-ratelimit-reset-tokens": "7.5s"}


def test_groq_answers_with_the_schema_in_the_prompt_and_reports_what_is_left(settings, tmp_path):
    sent = {}

    def handler(request):
        sent.update(json.loads(request.content))
        return httpx.Response(200, json=ANSWER, headers=groq_headers(640))

    api = groq(settings, tmp_path, handler)
    content, usage = asyncio.run(api.chat_json(system="Be kind.", user="u", schema={"type": "object"},
                                               max_output_tokens=600, fake=dict))
    assert json.loads(content) == {"ok": True} and usage.input_tokens == 1800 and usage.llm_calls == 1
    assert sent["response_format"] == {"type": "json_object"} and sent["reasoning_effort"] == "low"
    assert '{"type":"object"}' in sent["messages"][0]["content"]
    status = api.quota.status()
    # The header counts the video script's calls too: 640 left, 300 kept for it.
    assert status["remaining_today"] == 640 and status["remaining_basis"] == "reported_by_provider"
    assert status["spare_today"] == 340


def test_before_any_report_our_own_calls_count_against_the_limit(tmp_path):
    q = quota(tmp_path, "groq", limit=1000, reserve=300)
    for _ in range(3):
        q.record_call()
    assert q.status()["remaining_today"] == 997 and q.spare() == 697
    q.record_reported(1000, 500)
    q.record_call()  # after the report, so not in it yet
    assert q.status()["remaining_today"] == 499


def test_a_report_from_yesterday_is_not_today(tmp_path):
    now = [NOW]
    q = quota(tmp_path, "openrouter", limit=50, reserve=15, clock=lambda: now[0])
    q.record_reported(50, 3)
    now[0] = NOW + timedelta(days=1)
    assert q.status()["remaining_today"] == 50 and q.spare() == 35


def test_a_per_minute_429_skips_groq_only_until_it_passes(settings, tmp_path):
    now = [NOW]
    q = quota(tmp_path, "groq", limit=1000, reserve=300, clock=lambda: now[0])
    api = groq(settings, tmp_path, lambda r: httpx.Response(429, text="Rate limit reached on tokens per minute (TPM)",
                                                            headers={"retry-after": "20"}), q=q)
    with pytest.raises(ProviderError):
        chat(api)
    assert q.spare() == 0 and q.status()["cooling_down_until"]
    now[0] = NOW + timedelta(seconds=21)
    assert q.spare() == 700  # a refused request is not counted


def test_a_per_day_429_closes_the_provider_for_today(settings, tmp_path):
    api = openrouter(settings, tmp_path, lambda r: httpx.Response(429, text="Rate limit exceeded: free-models-per-day"))
    api.quota.record_reported(50, 40)  # fresh report: no refresh needed
    with pytest.raises(ProviderError):
        chat(api)
    assert api.quota.status()["remaining_basis"] == "closed_by_429" and api.quota.spare() == 0


def test_too_few_tokens_left_this_minute_pauses_groq(settings, tmp_path):
    api = groq(settings, tmp_path, lambda r: httpx.Response(200, json=ANSWER, headers=groq_headers(900, tokens_left=1200)))
    chat(api)
    assert api.quota.status()["cooling_down_until"] and api.quota.spare() == 0


def test_openrouter_asks_only_free_models_and_reads_the_keys_daily_count(settings, tmp_path):
    sent = {}

    def handler(request):
        if request.url.path.endswith("/key"):
            return httpx.Response(200, json={"data": {"free_model_daily_requests": {"used": 12, "limit": 50, "remaining": 38}}})
        sent.update(json.loads(request.content))
        return httpx.Response(200, json=ANSWER)

    api = openrouter(settings, tmp_path, handler)
    chat(api)
    assert sent["models"] == ["google/gemma-4-31b-it:free", "openrouter/free"] and "model" not in sent
    assert api.model_version == "openrouter/google/gemma-4-31b-it:free"
    assert api.quota.status()["remaining_today"] == 37 and api.quota.spare() == 22


def test_paid_openrouter_models_are_never_configured(settings):
    s = replace(settings, openrouter_api_key="o", openrouter_models=("openai/gpt-5", "google/gemma-4-31b-it:free"))
    (api,) = free_api_providers(s)
    assert api.model == "google/gemma-4-31b-it:free" and api.fallback_models == ()


def test_an_answer_that_is_not_json_moves_the_chain_on(settings, tmp_path):
    api = groq(settings, tmp_path, lambda r: httpx.Response(200, json={"choices": [{"message": {"content": "Xin chào!"}}]},
                                                            headers=groq_headers(800)))
    with pytest.raises(ProviderError) as caught:
        chat(api)
    assert caught.value.retryable and api.quota.status()["used_by_this_service_today"] == 1
    assert json_object('Here: {"a": 1} done') == '{"a": 1}'


class FreeStub(Stub):
    def __init__(self, name, spare, error=None, input_limit=5000):
        super().__init__(name, error)
        self.input_limit = input_limit
        self.quota = type("Q", (), {"spare": lambda _self: spare})()


def gemini_ledger(tmp_path, used):
    q = GeminiQuota(str(tmp_path / "gemini.sqlite3"), primary_model="gemini-2.5-flash", default_limit=20, agent_reserve_min=15)
    for _ in range(used):
        q.record_call("gemini-2.5-flash")
    return q


def test_community_answers_try_gemini_spare_then_groq_then_openrouter_then_local(settings, tmp_path):
    local, cloud = Stub("local"), Stub("cloud", ProviderError("PROVIDER_QUOTA_EXHAUSTED", "429", retryable=True))
    g = FreeStub("groq", 300, ProviderError("PROVIDER_QUOTA_EXHAUSTED", "TPM", retryable=True))
    o = FreeStub("openrouter", 20)
    hybrid = HybridProvider(settings, local=local, cloud=cloud, quota=gemini_ledger(tmp_path, 0), free_apis=[g, o])
    routed = hybrid.for_operation("community.response")
    assert [p.model_version for p in routed.chain] == ["cloud/model", "groq/model", "openrouter/model", "local/model"]
    chat(routed)
    # Another cloud model answered: not the local downgrade the run warns about.
    assert routed.models_used == ["openrouter/model"] and not routed.fell_back and local.chats == 0


def test_with_gemini_spare_spent_the_free_apis_answer_before_the_local_model(settings, tmp_path):
    g = FreeStub("groq", 300)
    hybrid = HybridProvider(settings, local=Stub("local"), cloud=Stub("cloud"), quota=gemini_ledger(tmp_path, 5),
                            free_apis=[g, FreeStub("openrouter", 0)])
    routed = hybrid.for_operation("community.response")
    assert [p.model_version for p in routed.chain] == ["groq/model", "local/model"]
    chat(routed)
    assert routed.models_used == ["groq/model"] and routed.spare_spent and not routed.fell_back
    assert routed.budget[0] == 5000


def test_the_agents_never_use_the_free_apis(settings, tmp_path):
    hybrid = HybridProvider(settings, local=Stub("local"), cloud=Stub("cloud"), quota=gemini_ledger(tmp_path, 0),
                            free_apis=[FreeStub("groq", 300)])
    assert [p.model_version for p in hybrid.for_operation("content.generate").chain] == ["cloud/model", "local/model"]
    assert [p.model_version for p in hybrid.for_operation("opportunity.score").chain] == ["local/model"]


def test_a_prompt_too_long_for_groq_goes_to_the_next_model(settings, tmp_path):
    g, o = FreeStub("groq", 300, input_limit=50), FreeStub("openrouter", 20, input_limit=16000)
    hybrid = HybridProvider(settings, local=Stub("local"), cloud=Stub("cloud"), quota=gemini_ledger(tmp_path, 5),
                            free_apis=[g, o])
    routed = hybrid.for_operation("community.response")
    asyncio.run(routed.chat_json(system="s", user="word " * 400, schema={}, max_output_tokens=10, fake=dict))
    assert g.chats == 0 and routed.models_used == ["openrouter/model"]
