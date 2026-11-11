from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from src.app.schemas import Usage


SOURCE_TEXT = (
    "Coworking spaces in Da Nang serve remote workers who need reliable internet "
    "and quiet work areas near the city centre."
)


def research_job() -> dict[str, Any]:
    """Create one fully scoped, approved request with verifiable source text."""
    workspace_id, source_id, snapshot_id = (str(uuid4()) for _ in range(3))
    fetched_at = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    return {
        "job_id": str(uuid4()),
        "workspace_id": workspace_id,
        "operation": "research.run",
        "input_version": 1,
        "trace_id": "research-agent-qa",
        "synthetic": True,
        "context_snapshot_id": snapshot_id,
        "approved_source_versions": [{"source_id": source_id, "version": 1}],
        "payload": {
            "workspace_id": workspace_id,
            "business_profile": {
                "company": "TripC",
                "workspace_id": workspace_id,
                "version": 1,
                "products": ["coworking"],
                "locations": ["Da Nang"],
                "audiences": ["English-speaking expats"],
            },
            "snapshot": {
                "workspace_id": workspace_id,
                "snapshot_id": snapshot_id,
                "sources": [
                    {
                        "source_id": source_id,
                        "workspace_id": workspace_id,
                        "version": 1,
                        "status": "approved",
                        "provenance": {
                            "license": "Synthetic test fixture",
                            "attribution": "Research Agent QA",
                            "source_url": "https://example.org/coworking-guide",
                            "retrieved_at": fetched_at,
                        },
                        "chunks": [
                            {
                                "chunk_id": "coworking-guide",
                                "text": SOURCE_TEXT,
                                "locator": "paragraph:1",
                            }
                        ],
                    }
                ],
            },
        },
    }


def valid_idea(quote: str) -> dict[str, Any]:
    return {
        "topic": "Coworking spaces for remote workers",
        "audience_fit": "English-speaking expats can compare coworking spaces.",
        "offer_fit": "TripC offers coworking options.",
        "rationale": "The cited source describes coworking spaces for remote workers.",
        "chunk_id": "coworking-guide",
        "quote": quote,
        "keywords": ["coworking", "remote work"],
        "user_need": "Remote workers need coworking spaces with reliable internet.",
    }


class DraftProvider:
    """Deterministic model substitute; all source selection remains production code."""

    model_version = "test/research-agent-qa"
    embedding_model_version = "test/embedding"

    def __init__(self, **overrides: Any) -> None:
        self.overrides = overrides
        self.user: dict[str, Any] | None = None
        self.calls = 0

    async def chat_json(self, *, user: str, **kwargs: Any) -> tuple[str, Usage]:
        self.calls += 1
        self.user = json.loads(user)
        excerpt = next(
            row for row in self.user["excerpts"]
            if row["chunk_id"] == "coworking-guide"
        )
        idea = valid_idea(excerpt["text"])
        idea.update(self.overrides)
        return json.dumps({"ideas": [idea]}), Usage(llm_calls=1)


def run_job(client: TestClient, job: dict[str, Any]) -> dict[str, Any]:
    accepted = client.post("/internal/v1/runs", json=job)
    assert accepted.status_code in {200, 202}, accepted.text
    run_id = accepted.json()["run_id"]
    deadline = time.monotonic() + 5
    while True:
        body = client.get(f"/internal/v1/runs/{run_id}").json()
        if body["status"] in {"completed", "failed"} or time.monotonic() > deadline:
            return body
        time.sleep(0.01)


def result_of(body: dict[str, Any]) -> dict[str, Any]:
    return body["result"]["result"]


def test_grounded_finding_has_traceable_evidence_and_unmeasured_demand(
    make_ai_client: Any,
) -> None:
    """EP valid evidence + decision gates pass; state advances to handoff-ready."""
    provider = DraftProvider()
    body = run_job(make_ai_client(provider=provider, provider_mode="live"), research_job())
    assert body["status"] == "completed", body
    brief = result_of(body)
    finding = brief["findings"][0]
    assert brief["status"] == "ready_for_handoff"
    assert finding["evidence"]["quote"] == SOURCE_TEXT
    assert finding["evidence"]["source_id"]
    assert finding["quality_checks"] == {
        "topic_supported_by_quote": True,
        "offer_matches_profile": True,
        "specific_user_need": True,
        "audience_matches_profile": True,
        "traceable_source": True,
        "not_duplicate": True,
    }
    assert finding["confidence"] == "hypothesis"
    assert finding["demand_estimate"] is None
    assert "market_search_volume_not_measured" in finding["missing_data"]
    assert provider.calls == 1


@pytest.mark.parametrize(
    ("case_id", "overrides", "warning"),
    [
        pytest.param(
            "invented-quote",
            {"quote": "The source says the city has the fastest internet."},
            "UNGROUNDED_IDEA_DROPPED",
            id="decision-no-exact-grounding",
        ),
        pytest.param(
            "heading-only",
            {"quote": "Coworking spaces in Da Nang"},
            "WEAK_QUOTE_DROPPED",
            id="bva-quote-below-minimum-evidence",
        ),
        pytest.param(
            "unsupported-number",
            {"rationale": "The source confirms 99 coworking spaces for remote workers."},
            "UNSUPPORTED_CLAIM_DROPPED",
            id="decision-number-not-in-source",
        ),
        pytest.param(
            "price-claim",
            {"rationale": "The source lists coworking plans at $99 per month."},
            "UNSUPPORTED_CLAIM_DROPPED",
            id="decision-unverified-price",
        ),
        pytest.param(
            "sensitive-detail",
            {"rationale": "The venue's opening hours suit remote workers."},
            "UNSUPPORTED_CLAIM_DROPPED",
            id="decision-unverified-opening-hours",
        ),
        pytest.param(
            "search-landscape-as-fact",
            {"rationale": "Search results rank this location as the leading choice."},
            "LANDSCAPE_CLAIM_DROPPED",
            id="decision-ranking-is-not-source-evidence",
        ),
        pytest.param(
            "demand-claim",
            {"user_need": "Meet the strong demand for coworking among expats."},
            "DEMAND_CLAIM_DROPPED",
            id="decision-no-inferred-demand",
        ),
        pytest.param(
            "unsupported-topic",
            {"topic": "Nightlife for visitors"},
            "OFF_TOPIC_EVIDENCE_DROPPED",
            id="decision-topic-not-supported-by-quote",
        ),
        pytest.param(
            "unconfirmed-offer",
            {"offer_fit": "TripC offers airport transfer options."},
            "OFF_PROFILE_OFFER_DROPPED",
            id="decision-offer-not-in-business-profile",
        ),
        pytest.param(
            "vague-user-need",
            {"user_need": "People need useful information."},
            "VAGUE_USER_NEED_DROPPED",
            id="decision-user-need-not-specific",
        ),
        pytest.param(
            "wrong-audience",
            {"audience_fit": "Tourists can compare coworking spaces."},
            "AUDIENCE_MISMATCH_DROPPED",
            id="decision-audience-not-in-business-profile",
        ),
    ],
)
def test_decision_table_rejects_ideas_when_one_acceptance_rule_fails(
    make_ai_client: Any,
    case_id: str,
    overrides: dict[str, Any],
    warning: str,
) -> None:
    """Each row changes one decision-table condition while other input stays valid."""
    del case_id
    body = run_job(
        make_ai_client(provider=DraftProvider(**overrides), provider_mode="live"),
        research_job(),
    )
    assert body["status"] == "completed", body
    assert result_of(body)["findings"] == []
    assert warning in body["result"]["warnings"]
    assert result_of(body)["status"] == "insufficient_data"


@pytest.mark.parametrize(
    ("case_id", "change", "warning"),
    [
        pytest.param("revoked", "revoked", "EXCLUDED_SOURCES", id="ep-revoked-source"),
        pytest.param("deleted", "deleted", "EXCLUDED_SOURCES", id="ep-deleted-source"),
        pytest.param("wrong-version", "wrong-version", "EXCLUDED_SOURCES", id="bva-source-version"),
        pytest.param("missing-url", "missing-url", None, id="ep-source-without-url"),
        pytest.param("invalid-url", "invalid-url", None, id="ep-invalid-source-url"),
        pytest.param("future-fetch", "future-fetch", None, id="bva-future-retrieval-time"),
        pytest.param("sensitive-excerpt", "sensitive", "SENSITIVE_EXCERPT_EXCLUDED", id="decision-sensitive-excerpt"),
        pytest.param("keyword-metadata", "metadata", "METADATA_EXCERPT_EXCLUDED", id="decision-seo-metadata"),
    ],
)
def test_ineligible_source_partitions_never_reach_the_model(
    make_ai_client: Any,
    case_id: str,
    change: str,
    warning: str | None,
) -> None:
    """EP classes and source-eligibility decision rules are checked before model use."""
    del case_id
    job = research_job()
    source = job["payload"]["snapshot"]["sources"][0]
    if change == "revoked":
        source["status"] = "revoked"
    elif change == "deleted":
        source["deleted_at"] = datetime.now(timezone.utc).isoformat()
    elif change == "wrong-version":
        source["version"] = 2
    elif change == "missing-url":
        source["provenance"]["source_url"] = None
    elif change == "invalid-url":
        source["provenance"]["source_url"] = "javascript:alert(1)"
    elif change == "future-fetch":
        source["provenance"]["retrieved_at"] = "2999-01-01T00:00:00Z"
    elif change == "sensitive":
        source["chunks"][0]["text"] = "Monthly rent is 900 USD for each resident."
    elif change == "metadata":
        source["chunks"][0]["text"] = (
            "Keywords: coworking, expats, remote work, Da Nang, workspace."
        )
    provider = DraftProvider()
    body = run_job(make_ai_client(provider=provider, provider_mode="live"), job)
    assert body["status"] == "completed", body
    assert result_of(body)["status"] == "insufficient_data"
    assert result_of(body)["findings"] == []
    assert provider.calls == 0
    if warning:
        assert any(item.startswith(warning) for item in body["result"]["warnings"])


def test_guardrail_filtered_chunks_do_not_displace_eligible_evidence(
    make_ai_client: Any,
) -> None:
    """Decision-table filtering excludes sensitive/SEO text while retaining valid evidence."""
    job = research_job()
    chunks = job["payload"]["snapshot"]["sources"][0]["chunks"]
    chunks.extend(
        [
            {"chunk_id": "price", "text": "Rent is 900 USD each month.", "locator": "paragraph:2"},
            {
                "chunk_id": "metadata",
                "text": "Keywords: coworking, expats, remote work, workspace.",
                "locator": "metadata:keywords",
            },
        ]
    )
    provider = DraftProvider()
    body = run_job(make_ai_client(provider=provider, provider_mode="live"), job)
    assert body["status"] == "completed", body
    assert result_of(body)["status"] == "ready_for_handoff"
    assert provider.user is not None
    assert [row["chunk_id"] for row in provider.user["excerpts"]] == [
        "coworking-guide"
    ]
    assert {
        "SENSITIVE_EXCERPT_EXCLUDED",
        "METADATA_EXCERPT_EXCLUDED",
    }.issubset(set(body["result"]["warnings"]))


def test_duplicate_chunk_identifiers_fail_the_run_explicitly(
    make_ai_client: Any,
) -> None:
    """BVA at identifier uniqueness: the duplicate boundary is a hard data error."""
    job = research_job()
    source = job["payload"]["snapshot"]["sources"][0]
    source["chunks"].append(
        {"chunk_id": "coworking-guide", "text": "Different text.", "locator": "paragraph:2"}
    )
    body = run_job(make_ai_client(provider=DraftProvider()), job)
    assert body["status"] == "failed"
    assert body["error_code"] == "DUPLICATE_CHUNK_ID"


def test_retrieved_excerpt_limit_is_six_and_keeps_prompt_bounded(
    make_ai_client: Any,
) -> None:
    """BVA checks the configured max_retrieved_chunks limit without weakening source rules."""
    job = research_job()
    chunks = job["payload"]["snapshot"]["sources"][0]["chunks"]
    chunks.extend(
        {
            "chunk_id": f"extra-{index}",
            "text": (
                f"Coworking workspaces in Da Nang serve remote workers with "
                f"quiet meeting rooms and internet option {index}."
            ),
            "locator": f"paragraph:{index + 2}",
        }
        for index in range(8)
    )
    provider = DraftProvider()
    body = run_job(make_ai_client(provider=provider, provider_mode="live"), job)
    assert body["status"] == "completed", body
    assert provider.user is not None
    assert len(provider.user["excerpts"]) == 6
    assert result_of(body)["status"] == "ready_for_handoff"


def test_duplicate_content_is_not_reproposed(make_ai_client: Any) -> None:
    """EP existing-content class causes a decision-table duplicate rejection."""
    job = research_job()
    job["payload"]["content_inventory"] = [
        {
            "content_id": str(uuid4()),
            "workspace_id": job["workspace_id"],
            "version": 1,
            "title": "Coworking spaces for remote workers",
        }
    ]
    body = run_job(make_ai_client(provider=DraftProvider()), job)
    assert result_of(body)["findings"] == []
    assert "DUPLICATE_TOPIC_DROPPED" in body["result"]["warnings"]
    assert result_of(body)["status"] == "insufficient_data"


def test_trend_signal_is_metadata_and_only_attaches_to_matching_finding(
    make_ai_client: Any,
) -> None:
    """State: supplied signal -> validated -> matched by topic; ranking never proves demand."""
    job = research_job()
    observed_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    job["payload"]["trend_signals"] = [
        {
            "signal_id": str(uuid4()),
            "query": "Da Nang coworking expats",
            "rank": 1,
            "title": "Coworking spaces for remote workers in Da Nang",
            "url": "https://blog.example/coworking",
            "domain": "blog.example",
            "observed_at": observed_at,
        },
        {
            "signal_id": str(uuid4()),
            "query": "Da Nang coworking expats",
            "rank": 2,
            "title": "Da Nang weather in October",
            "url": "https://blog.example/weather",
            "domain": "blog.example",
            "observed_at": observed_at,
        },
    ]
    provider = DraftProvider()
    body = run_job(make_ai_client(provider=provider, provider_mode="live"), job)
    brief = result_of(body)
    finding = brief["findings"][0]
    assert provider.user is not None
    assert brief["trend_coverage"][0]["covered_chunks"] == 1
    assert [row["title"] for row in finding["trend_signals"]] == [
        "Coworking spaces for remote workers in Da Nang"
    ]
    assert finding["demand_estimate"] is None
    assert finding["confidence"] == "hypothesis"


@pytest.mark.parametrize(
    ("case_id", "hours_from_now", "expected_status"),
    [
        pytest.param("past-observation", -1, 202, id="bva-valid-past-boundary"),
        pytest.param("future-observation", 1, 422, id="bva-invalid-future-boundary"),
    ],
)
def test_trend_signal_observation_time_boundary_is_enforced_before_provider(
    make_ai_client: Any,
    case_id: str,
    hours_from_now: int,
    expected_status: int,
) -> None:
    """State transition: valid signal reaches processing; future signal is rejected at intake."""
    del case_id
    job = research_job()
    job["payload"]["trend_signals"] = [
        {
            "signal_id": str(uuid4()),
            "query": "Da Nang coworking expats",
            "rank": 1,
            "title": "Coworking spaces for remote workers",
            "url": "https://blog.example/coworking",
            "domain": "blog.example",
            "observed_at": (
                datetime.now(timezone.utc) + timedelta(hours=hours_from_now)
            ).isoformat(),
        }
    ]
    provider = DraftProvider()
    client = make_ai_client(provider=provider, provider_mode="live")
    response = client.post("/internal/v1/runs", json=job)
    if expected_status == 422:
        assert response.status_code == expected_status
        assert "INVALID_TREND_SIGNAL" in response.text
        assert provider.calls == 0
    else:
        assert response.status_code in {200, 202}
        assert provider.calls == 1
        run_id = response.json()["run_id"]
        final = client.get(f"/internal/v1/runs/{run_id}").json()
        assert final["status"] == "completed"


def test_research_fallback_recovers_only_from_grounded_trend_and_approved_source(
    make_ai_client: Any,
) -> None:
    """State transition: incomplete model draft -> deterministic grounded fallback -> handoff."""

    class IncompleteProvider(DraftProvider):
        async def chat_json(self, *, user: str, **kwargs: Any) -> tuple[str, Usage]:
            content, usage = await super().chat_json(user=user, **kwargs)
            draft = json.loads(content)
            for key in ("audience_fit", "offer_fit", "rationale", "user_need"):
                draft["ideas"][0][key] = draft["ideas"][0][key].rstrip(".") + " before"
            return json.dumps(draft), usage

    job = research_job()
    job["payload"]["trend_signals"] = [
        {
            "signal_id": str(uuid4()),
            "query": "Da Nang coworking expats",
            "rank": 1,
            "title": "Coworking spaces for remote workers in Da Nang",
            "url": "https://blog.example/coworking",
            "domain": "blog.example",
            "observed_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
        }
    ]
    body = run_job(
        make_ai_client(provider=IncompleteProvider(), provider_mode="live"), job
    )
    assert body["status"] == "completed", body
    assert result_of(body)["status"] == "ready_for_handoff"
    assert "INCOMPLETE_BRIEF_DROPPED" in body["result"]["warnings"]
    assert "GROUNDED_FALLBACK_USED" in body["result"]["warnings"]
    assert result_of(body)["findings"][0]["evidence"]["quote"] in SOURCE_TEXT


def test_stale_source_is_kept_with_explicit_reverification_requirement(
    make_ai_client: Any,
) -> None:
    """BVA freshness boundary preserves supported evidence but flags it for review."""
    job = research_job()
    source = job["payload"]["snapshot"]["sources"][0]
    source["provenance"]["retrieved_at"] = (
        datetime.now(timezone.utc) - timedelta(days=91)
    ).isoformat()
    body = run_job(
        make_ai_client(provider=DraftProvider(), provider_mode="live"), job
    )
    finding = result_of(body)["findings"][0]
    assert result_of(body)["status"] == "ready_for_handoff"
    assert "source_freshness_requires_reverification" in finding["missing_data"]


def test_input_budget_boundary_stops_before_provider(make_ai_client: Any) -> None:
    """BVA over the input-token budget fails closed and never invokes the provider."""
    job = research_job()
    job["payload"]["business_profile"]["overview"] = "oversized " * 4000
    provider = DraftProvider()
    body = run_job(
        make_ai_client(provider=provider, provider_mode="live"), job
    )
    assert body["status"] == "failed"
    assert body["error_code"] == "CONTEXT_BUDGET_EXCEEDED"
    assert provider.calls == 0


def test_missing_offer_and_audience_are_reported_as_missing_facts(
    make_ai_client: Any,
) -> None:
    """EP empty business-profile partitions are visible to downstream reviewers."""
    job = research_job()
    job["payload"]["business_profile"]["products"] = []
    job["payload"]["business_profile"]["audiences"] = []
    body = run_job(
        make_ai_client(provider=DraftProvider(), provider_mode="live"), job
    )
    missing = result_of(body)["missing_facts"]
    assert "confirmed_offer" in missing
    assert "target_audience" in missing


def test_provider_output_without_trend_recovery_fails_honestly(
    make_ai_client: Any,
) -> None:
    """State transition: invalid structured output without recovery inputs fails the run."""

    class InvalidProvider(DraftProvider):
        async def chat_json(self, *, user: str, **kwargs: Any) -> tuple[str, Usage]:
            content, usage = await super().chat_json(
                user=user.split("\n\nYour previous reply")[0], **kwargs
            )
            draft = json.loads(content)
            draft["ideas"][0]["user_need"] = "x" * 400
            return json.dumps(draft), usage

    body = run_job(
        make_ai_client(provider=InvalidProvider(), provider_mode="live"),
        research_job(),
    )
    assert body["status"] == "failed"
    assert body["error_code"] == "INVALID_STRUCTURED_OUTPUT"
