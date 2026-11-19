"""Gemini free-tier accounting: the agents' daily share is kept, only the spare answers Community questions."""
import json
import sqlite3
from datetime import datetime, timedelta, timezone

from src.app.gemini_quota import GeminiQuota, parse_limits, quota_failure
from src.app.providers import HybridProvider
from test_hybrid_provider import Stub, chat

# 20:00 UTC on 12 Nov 2026 is 12:00 in California (PST): the Pacific day is 2026-11-12.
NOW = datetime(2026, 11, 12, 20, 0, tzinfo=timezone.utc)
DAILY_429 = ("429 RESOURCE_EXHAUSTED. {'error': {'code': 429, 'message': 'You exceeded your current quota. Quota exceeded "
             "for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-2.5-flash', "
             "'details': [{'@type': 'type.googleapis.com/google.rpc.QuotaFailure', 'violations': [{'quotaId': "
             "'GenerateRequestsPerDayPerProjectPerModel-FreeTier', 'quotaValue': '25'}]}]}}")
MINUTE_429 = "429 RESOURCE_EXHAUSTED quotaId: GenerateRequestsPerMinutePerProjectPerModel-FreeTier, 'quotaValue': '10'"


def ledger(tmp_path, clock=lambda: NOW, **kw):
    return GeminiQuota(str(tmp_path / "runs.sqlite3"), primary_model="gemini-2.5-flash", clock=clock, **kw)


def add_runs(path, rows):
    db = sqlite3.connect(path)
    db.execute("CREATE TABLE IF NOT EXISTS runs (operation TEXT, created_at TEXT, result_json TEXT)")
    for operation, at, model, calls in rows:
        db.execute("INSERT INTO runs VALUES (?, ?, ?)", (operation, at.isoformat(),
                                                         json.dumps({"model_version": model, "usage": {"llm_calls": calls}})))
    db.commit()
    db.close()


def test_the_day_follows_pacific_midnight(tmp_path):
    q = ledger(tmp_path)
    assert q.day(datetime(2026, 11, 12, 7, 59, tzinfo=timezone.utc)) == "2026-11-11"  # 23:59 PST
    assert q.day(datetime(2026, 11, 12, 8, 0, tzinfo=timezone.utc)) == "2026-11-12"
    assert q.resets_at().startswith("2026-11-13T08:00")


def test_requests_count_against_the_estimate_until_a_429_states_the_real_limit(tmp_path):
    q = ledger(tmp_path, default_limit=20, agent_reserve_min=0)
    for _ in range(3):
        q.record_call("gemini-2.5-flash")
    status = q.status()
    assert status["models"][0] == {"model": "gemini-2.5-flash", "used": 3, "limit": 20, "limit_basis": "default_estimate",
                                   "closed_today": False, "remaining": 17}
    q.record_failure("gemini-2.5-flash", DAILY_429)
    model = q.status()["models"][0]
    assert model["limit"] == 25 and model["limit_basis"] == "learned_from_429"
    assert model["closed_today"] and model["remaining"] == 0


def test_a_per_minute_429_does_not_close_the_day(tmp_path):
    q = ledger(tmp_path)
    q.record_failure("gemini-2.5-flash", MINUTE_429)
    assert not q.closed_today("gemini-2.5-flash")
    assert quota_failure(MINUTE_429) == (False, 10)


def test_a_model_the_key_cannot_use_is_closed_for_the_day(tmp_path):
    q = ledger(tmp_path)
    q.record_failure("gemini-3.5-flash", "404 NOT_FOUND models/gemini-3.5-flash is not found")
    assert q.closed_today("gemini-3.5-flash")
    assert not q.closed_today("gemini-2.5-flash")


def test_the_closed_day_reopens_after_midnight_pacific(tmp_path):
    now = [NOW]
    q = ledger(tmp_path, clock=lambda: now[0])
    q.record_failure("gemini-2.5-flash", DAILY_429)
    now[0] = NOW + timedelta(days=1)
    assert not q.closed_today("gemini-2.5-flash")


def test_a_fallback_that_answered_adds_its_own_daily_capacity(tmp_path):
    q = ledger(tmp_path, default_limit=20, agent_reserve_min=0)
    q.record_call("gemini-flash-lite-latest")
    assert [m["model"] for m in q.status()["models"]] == ["gemini-2.5-flash", "gemini-flash-lite-latest"]
    assert q.status()["remaining_today"] == 39


def test_the_agents_reserve_is_their_busiest_day_of_the_week(tmp_path):
    path = str(tmp_path / "runs.sqlite3")
    add_runs(path, [
        ("research.run", NOW - timedelta(days=2), "gemini/gemini-2.5-flash", 3),
        ("content.repurpose", NOW - timedelta(days=2), "gemini/gemini-2.5-flash", 9),
        ("seo.local_draft", NOW - timedelta(days=3), "gemini/gemini-2.5-flash", 4),
        # The Community bot's own calls and local-model runs are not the agents' need.
        ("community.response", NOW - timedelta(days=2), "gemini/gemini-2.5-flash", 16),
        ("research.run", NOW - timedelta(days=1), "ollama/qwen3:4b-instruct", 5),
        # Today the cycle already spent 4 of its share.
        ("research.run", NOW - timedelta(hours=1), "gemini/gemini-2.5-flash", 4),
    ])
    q = ledger(tmp_path, default_limit=20, agent_reserve_min=5)
    for _ in range(4):
        q.record_call("gemini-2.5-flash")
    status = q.status()
    assert status["agents"]["reserve_per_day"] == 12
    assert status["agents"]["used_today"] == 4 and status["agents"]["still_reserved"] == 8
    # Two days ago 28 Gemini calls were served without a fallback: the capacity is at least that, not the estimate of 20.
    assert status["capacity_today"] == 28 and status["capacity_basis"] == "proven_by_history"
    assert status["remaining_today"] == 24
    assert status["spare_today"] == 16


def test_calls_made_before_the_ledger_existed_still_count(tmp_path):
    add_runs(str(tmp_path / "runs.sqlite3"), [("community.response", NOW - timedelta(hours=2), "gemini/gemini-2.5-flash", 11)])
    q = ledger(tmp_path, default_limit=20, agent_reserve_min=5)
    status = q.status()
    assert status["used_today"] == 11 and status["remaining_today"] == 9 and status["spare_today"] == 4


def test_a_day_that_fell_back_proves_no_capacity(tmp_path):
    path = str(tmp_path / "runs.sqlite3")
    add_runs(path, [("content.generate", NOW - timedelta(days=1), "gemini/gemini-2.5-flash", 30)])
    db = sqlite3.connect(path)
    db.execute("INSERT INTO runs VALUES (?, ?, ?)", ("community.response", (NOW - timedelta(days=1)).isoformat(),
               json.dumps({"model_version": "ollama/qwen3", "warnings": ["QUALITY_MODEL_UNAVAILABLE_LOCAL_MODEL_USED"]})))
    db.commit(); db.close()
    assert ledger(tmp_path, default_limit=20).status()["capacity_today"] == 20


def test_after_a_daily_429_only_the_stated_limits_count(tmp_path):
    add_runs(str(tmp_path / "runs.sqlite3"), [("content.generate", NOW - timedelta(days=1), "gemini/gemini-2.5-flash", 30)])
    q = ledger(tmp_path, default_limit=20, agent_reserve_min=0)
    q.record_failure("gemini-2.5-flash", DAILY_429)
    status = q.status()
    assert status["capacity_basis"] == "limits_after_429" and status["remaining_today"] == 0


def test_the_minimum_reserve_holds_when_there_is_no_history(tmp_path):
    q = ledger(tmp_path, default_limit=20, agent_reserve_min=15)
    assert q.status()["agents"]["reserve_per_day"] == 15
    assert q.spare() == 5


def test_community_answers_go_local_once_the_spare_is_spent(settings, tmp_path):
    q = ledger(tmp_path, default_limit=20, agent_reserve_min=15)
    for _ in range(5):
        q.record_call("gemini-2.5-flash")
    local, cloud = Stub("local"), Stub("cloud")
    hybrid = HybridProvider(settings, local=local, cloud=cloud, quota=q)
    community = hybrid.for_operation("community.response")
    chat(community)
    assert community.models_used == ["local/model"] and community.spare_spent and community.fell_back
    # The agents keep their share: their writing still goes to Gemini.
    content = hybrid.for_operation("content.generate")
    chat(content)
    assert content.models_used == ["cloud/model"] and not content.spare_spent


def test_community_answers_use_gemini_while_there_is_spare(settings, tmp_path):
    q = ledger(tmp_path, default_limit=20, agent_reserve_min=15)
    hybrid = HybridProvider(settings, local=Stub("local"), cloud=Stub("cloud"), quota=q)
    routed = hybrid.for_operation("community.response")
    chat(routed)
    assert routed.models_used == ["cloud/model"] and not routed.spare_spent


def test_limits_from_the_environment():
    assert parse_limits("gemini-2.5-flash=20, gemini-flash-lite-latest=1000,bad") == {
        "gemini-2.5-flash": 20, "gemini-flash-lite-latest": 1000}
