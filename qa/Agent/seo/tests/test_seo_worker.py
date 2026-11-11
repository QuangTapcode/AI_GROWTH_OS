from __future__ import annotations

import hashlib
import json
from copy import deepcopy
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from conftest import run_job
from examples.six_role_requests import artifact_input, mock_research_request, request
from src.app.schemas import Usage

CTA = "Request the newcomer guide"
SOURCE_TEXT = (
    "The guide compares living areas for newcomers. Quiet river districts suit "
    "families who want shops within walking distance. Newcomers often read the "
    "guide before choosing living areas."
)
GROUNDED_SENTENCES = [
    "The guide compares living areas for newcomers.",
    "Quiet river districts suit families who want shops within walking distance.",
    "Newcomers often read the guide before choosing living areas.",
]


def seo_job(client: TestClient) -> dict[str, Any]:
    """Build a real upstream Research artifact for the SEO operation."""
    research_request = mock_research_request()
    research_request["payload"]["snapshot"]["sources"][0]["chunks"][0]["text"] = SOURCE_TEXT
    research_output = run_job(client, research_request)
    assert research_output["status"] == "completed", research_output
    return request(
        research_request,
        "seo.local_draft",
        {"research": artifact_input(research_output["result"]), "cta": CTA},
    )


def draft(
    *,
    title: str = "Living areas guide for newcomers",
    meta: str = "A cited guide comparing living areas for newcomers.",
    sections: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    return {
        "title": title,
        "meta_description": meta,
        "sections": sections
        or [
            {"heading": "Living areas", "body": GROUNDED_SENTENCES[0]},
            {"heading": "Quiet districts", "body": GROUNDED_SENTENCES[1]},
        ],
    }


class DraftProvider:
    """Deterministic model double; pipeline and validation remain production code."""

    model_version = "test/seo-worker"
    embedding_model_version = "test/embedding"

    def __init__(self, *drafts: dict[str, Any]) -> None:
        self.drafts = list(drafts) or [draft()]
        self.systems: list[str] = []
        self.prompts: list[dict[str, Any]] = []

    async def chat_json(
        self, *, system: str, user: str, **kwargs: Any
    ) -> tuple[str, Usage]:
        self.systems.append(system)
        prompt = user.split("\n\nYour previous reply", maxsplit=1)[0]
        self.prompts.append(json.loads(prompt))
        current = self.drafts[min(len(self.systems) - 1, len(self.drafts) - 1)]
        return json.dumps(current), Usage(llm_calls=1)


def body_result(run: dict[str, Any]) -> dict[str, Any]:
    return run["result"]["result"]


def canonicalize_artifact(artifact_input_value: dict[str, Any]) -> None:
    """Recompute the upstream artifact hash after deliberately changing its result."""
    value = artifact_input_value
    canonical = json.dumps(
        {"result": value["result"], "evidence": value["evidence"]},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    value["artifact"]["content_hash"] = hashlib.sha256(
        canonical.encode()
    ).hexdigest()


def test_valid_article_is_grounded_versioned_and_requires_review(
    client: TestClient, make_ai_client: Any
) -> None:
    """EP valid research + all decision gates pass; run transitions to reviewer draft."""
    job = seo_job(client)
    full_sections = [
        {
            "heading": "Living areas",
            "body": " ".join(GROUNDED_SENTENCES * 5),
        },
        {
            "heading": "Quiet districts",
            "body": " ".join(GROUNDED_SENTENCES * 5),
        },
    ]
    provider = DraftProvider(draft(sections=full_sections))
    run = run_job(make_ai_client(provider=provider, provider_mode="live"), job)

    assert run["status"] == "completed", run
    result = body_result(run)
    assert result["status"] == "draft"
    assert result["missing_facts"] == []
    assert result["title"] == "Living areas guide for newcomers"
    assert result["meta_description"]
    assert result["version"] == 1
    assert result["requires_human_approval"] is True
    assert result["applied"] is False
    assert result["input_artifact_refs"] == [job["payload"]["research"]["artifact"]]
    assert result["citations"][0]["quote"] in SOURCE_TEXT
    assert result["seo_checks"] == {
        "title": True,
        "meta": True,
        "headings": True,
        "internal_link": True,
        "citations": True,
    }
    assert result["body_markdown"].count("[Request information](/contact)") == 1
    assert result["body_markdown"].endswith(f"[Request information](/contact) — {CTA}")
    assert provider.prompts[0]["topic"] == "Living areas guide"
    assert provider.prompts[0]["keyword"] == "Living areas guide"


@pytest.mark.parametrize(
    ("case_id", "mutation", "error"),
    [
        pytest.param(
            "foreign-workspace",
            "workspace",
            "TENANT_SCOPE_VIOLATION",
            id="ep-foreign-tenant",
        ),
        pytest.param(
            "wrong-role", "role", "INVALID_ARTIFACT_ROLE", id="decision-wrong-upstream-role"
        ),
        pytest.param(
            "stale-context", "context", "STALE_ARTIFACT_CONTEXT", id="decision-stale-snapshot"
        ),
        pytest.param(
            "tampered-hash", "hash", "ARTIFACT_HASH_MISMATCH", id="decision-tampered-artifact"
        ),
        pytest.param(
            "wrong-version", "version", "ARTIFACT_VERSION_MISMATCH", id="bva-artifact-version"
        ),
        pytest.param(
            "revoked-source", "revoked", "UNGROUNDED_ARTIFACT", id="decision-revoked-evidence"
        ),
    ],
)
def test_upstream_research_integrity_is_checked_before_drafting(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    mutation: str,
    error: str,
) -> None:
    """EP/decision table reject untrusted or stale upstream research before model use."""
    del case_id
    job = seo_job(client)
    research = job["payload"]["research"]
    if mutation == "workspace":
        research["artifact"]["workspace_id"] = str(uuid4())
    elif mutation == "role":
        research["artifact"]["role"] = "content"
    elif mutation == "context":
        research["artifact"]["context_snapshot_id"] = str(uuid4())
    elif mutation == "hash":
        research["artifact"]["content_hash"] = "0" * 64
    elif mutation == "version":
        research["artifact"]["version"] = 2
        research["result"]["version"] = 1
        canonicalize_artifact(research)
    elif mutation == "revoked":
        job["payload"]["snapshot"]["sources"][0]["status"] = "revoked"
    provider = DraftProvider()
    client_for_run = make_ai_client(provider=provider, provider_mode="live")

    response = client_for_run.post("/internal/v1/runs", json=job)
    assert response.status_code == 422, response.text
    assert error in response.text
    assert provider.prompts == []


@pytest.mark.parametrize(
    ("case_id", "finding_index", "expected_status", "expected_error"),
    [
        pytest.param("first-finding", 0, None, None, id="bva-first-index"),
        pytest.param("past-last-finding", 1, 200, "MISSING_RESEARCH", id="bva-index-one-past-end"),
        pytest.param(
            "maximum-schema-index",
            2,
            200,
            "MISSING_RESEARCH",
            id="bva-schema-maximum-no-finding",
        ),
        pytest.param("over-schema-maximum", 3, 422, None, id="bva-index-above-schema-maximum"),
    ],
)
def test_finding_index_boundary_selects_only_an_available_finding(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    finding_index: int,
    expected_status: int | None,
    expected_error: str | None,
) -> None:
    """BVA finding index around the only finding; invalid indexes never draft another topic."""
    del case_id
    job = seo_job(client)
    job["payload"]["finding_index"] = finding_index
    provider = DraftProvider()
    client_for_run = make_ai_client(provider=provider, provider_mode="live")

    response = client_for_run.post("/internal/v1/runs", json=job)
    if expected_status == 422:
        assert response.status_code == 422
        assert provider.prompts == []
        return
    assert response.status_code in {200, 202}
    run = client_for_run.get(
        f"/internal/v1/runs/{response.json()['run_id']}"
    ).json()
    if expected_error:
        assert run["status"] == "failed"
        assert run["error_code"] == expected_error
        assert provider.prompts == []
    else:
        assert run["status"] == "completed", run
        assert provider.prompts[0]["topic"] == "Living areas guide"


@pytest.mark.parametrize(
    ("case_id", "cta", "expected_status"),
    [
        pytest.param("empty-cta", "", 422, id="bva-empty-cta"),
        pytest.param("one-character-cta", "X", 202, id="bva-minimum-cta"),
        pytest.param("maximum-cta", "x" * 200, 202, id="bva-maximum-cta"),
        pytest.param("overlong-cta", "x" * 201, 422, id="bva-cta-over-maximum"),
    ],
)
def test_call_to_action_length_boundaries(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    cta: str,
    expected_status: int,
) -> None:
    """BVA checks the CTA schema's 1..200 character range."""
    del case_id
    job = seo_job(client)
    job["payload"]["cta"] = cta
    response = make_ai_client().post("/internal/v1/runs", json=job)
    assert response.status_code == expected_status, response.text


def test_provider_receives_primary_passage_and_only_relevant_safe_related_evidence(
    client: TestClient, make_ai_client: Any
) -> None:
    """Decision table keeps relevant approved excerpts and excludes price/metadata/noise."""
    job = seo_job(client)
    source = job["payload"]["snapshot"]["sources"][0]
    source["chunks"].extend(
        [
            {
                "chunk_id": "related",
                "text": (
                    "Living areas near the river suit newcomers who want quiet streets "
                    "and short walks to shops."
                ),
                "locator": "mock:related",
            },
            {
                "chunk_id": "noise",
                "text": "The port handles container ships from three continents each week.",
                "locator": "mock:noise",
            },
            {
                "chunk_id": "priced",
                "text": "Living areas for newcomers cost $300 per month on average.",
                "locator": "mock:price",
            },
            {
                "chunk_id": "metadata",
                "text": "Keywords: living areas, newcomers, quiet streets, local shops.",
                "locator": "mock:metadata",
            },
        ]
    )
    provider = DraftProvider()
    run = run_job(make_ai_client(provider=provider, provider_mode="live"), job)

    assert run["status"] == "completed", run
    passage = provider.prompts[0]["source_passage"]
    assert passage.startswith(SOURCE_TEXT)
    assert "quiet streets" in passage
    assert "container ships" not in passage
    assert "$300" not in passage
    assert "Keywords:" not in passage
    result = body_result(run)
    assert [citation["chunk_id"] for citation in result["citations"]] == [
        "mock-guide",
        "related",
    ]
    assert result["body_markdown"].count("[source:") == 1


def test_related_evidence_count_is_bounded_and_primary_citation_is_first(
    client: TestClient, make_ai_client: Any
) -> None:
    """BVA checks MAX_RELATED_EXCERPTS=3 without allowing related sources to displace primary."""
    job = seo_job(client)
    chunks = job["payload"]["snapshot"]["sources"][0]["chunks"]
    chunks.extend(
        {
            "chunk_id": f"related-{index}",
            "text": (
                f"Living areas for newcomers include quiet district option {index} "
                "with shops and streets near the river."
            ),
            "locator": f"mock:related:{index}",
        }
        for index in range(5)
    )
    provider = DraftProvider()
    run = run_job(make_ai_client(provider=provider, provider_mode="live"), job)

    assert run["status"] == "completed", run
    assert provider.prompts[0]["source_passage"].startswith(SOURCE_TEXT)
    citations = body_result(run)["citations"]
    assert len(citations) == 4
    assert citations[0]["chunk_id"] == "mock-guide"
    assert len({citation["chunk_id"] for citation in citations}) == 4


@pytest.mark.parametrize(
    ("case_id", "title", "meta", "title_limit", "meta_limit"),
    [
        pytest.param("short-title", "A guide", "A short meta.", 70, 160, id="ep-short-metadata"),
        pytest.param(
            "maximum-input-title-meta",
            "Living areas guide comparing living areas for newcomers and quiet streets "
            "near the river",
            "The guide compares living areas for newcomers. " * 5,
            70,
            160,
            id="bva-long-title-and-meta",
        ),
    ],
)
def test_title_and_meta_are_safely_bounded(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    title: str,
    meta: str,
    title_limit: int,
    meta_limit: int,
) -> None:
    """BVA confirms schema-accepted metadata is shortened to display limits on word boundaries."""
    del case_id
    provider = DraftProvider(draft(title=title, meta=meta))
    run = run_job(
        make_ai_client(provider=provider, provider_mode="live"), seo_job(client)
    )

    assert run["status"] == "completed", run
    result = body_result(run)
    assert len(result["title"]) <= title_limit
    assert len(result["meta_description"]) <= meta_limit
    assert result["title"] == result["title"].strip()
    if title_limit < len(title):
        assert not result["title"].endswith(("the", "and", "for", "near"))


@pytest.mark.parametrize(
    ("case_id", "sections", "expected_error"),
    [
        pytest.param(
            "heading-markers-removed",
            [
                {"heading": "## Overview?", "body": GROUNDED_SENTENCES[0]},
                {"heading": "Next steps", "body": GROUNDED_SENTENCES[1]},
            ],
            None,
            id="ep-markdown-heading-normalization",
        ),
        pytest.param(
            "one-usable-heading",
            [
                {"heading": "##", "body": GROUNDED_SENTENCES[0]},
                {"heading": "Living areas", "body": GROUNDED_SENTENCES[1]},
            ],
            "SEO_CHECK_FAILED",
            id="decision-insufficient-usable-headings",
        ),
    ],
)
def test_headings_are_rendered_and_must_leave_two_usable_entries(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    sections: list[dict[str, str]],
    expected_error: str | None,
) -> None:
    """EP/decision table checks heading normalization and the two-heading minimum."""
    del case_id
    provider = DraftProvider(draft(sections=sections))
    run = run_job(
        make_ai_client(provider=provider, provider_mode="live"), seo_job(client)
    )

    if expected_error:
        assert run["status"] == "failed"
        assert run["error_code"] == expected_error
    else:
        result = body_result(run)
        assert result["headings"] == ["Overview?", "Next steps"]
        assert all(f"## {heading}" in result["body_markdown"] for heading in result["headings"])


@pytest.mark.parametrize(
    ("case_id", "title", "meta", "sections", "error"),
    [
        pytest.param(
            "too-few-sections",
            "Title",
            "Meta",
            [{"heading": "Only", "body": GROUNDED_SENTENCES[0]}],
            "INVALID_STRUCTURED_OUTPUT",
            id="bva-section-count-below-minimum",
        ),
        pytest.param(
            "too-many-sections",
            "Title",
            "Meta",
            [
                {"heading": f"Section {index}", "body": GROUNDED_SENTENCES[0]}
                for index in range(6)
            ],
            "INVALID_STRUCTURED_OUTPUT",
            id="bva-section-count-above-maximum",
        ),
        pytest.param(
            "empty-title",
            "",
            "Meta",
            [
                {"heading": "Overview", "body": GROUNDED_SENTENCES[0]},
                {"heading": "Next steps", "body": GROUNDED_SENTENCES[1]},
            ],
            "INVALID_STRUCTURED_OUTPUT",
            id="bva-empty-title",
        ),
        pytest.param(
            "too-long-heading",
            "Title",
            "Meta",
            [
                {"heading": "H" * 91, "body": GROUNDED_SENTENCES[0]},
                {"heading": "Next steps", "body": GROUNDED_SENTENCES[1]},
            ],
            "INVALID_STRUCTURED_OUTPUT",
            id="bva-heading-over-schema-limit",
        ),
    ],
)
def test_model_schema_rejects_invalid_seo_draft_shapes(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    title: str,
    meta: str,
    sections: list[dict[str, str]],
    error: str,
) -> None:
    """EP/BVA rejects empty or out-of-range model output instead of publishing it."""
    del case_id
    provider = DraftProvider(draft(title=title, meta=meta, sections=sections))
    run = run_job(
        make_ai_client(provider=provider, provider_mode="live"), seo_job(client)
    )
    assert run["status"] == "failed"
    assert run["error_code"] == error


def test_unsupported_sentences_are_removed_but_grounded_sentences_remain(
    client: TestClient, make_ai_client: Any
) -> None:
    """Decision table keeps supported claims and removes unsupported amenities."""
    sections = [
        {
            "heading": "Living areas",
            "body": (
                f"{GROUNDED_SENTENCES[0]} "
                "Every building includes a rooftop swimming pool and free airport pickup."
            ),
        },
        {"heading": "Quiet districts", "body": GROUNDED_SENTENCES[1]},
    ]
    provider = DraftProvider(draft(sections=sections))
    run = run_job(
        make_ai_client(provider=provider, provider_mode="live"), seo_job(client)
    )

    assert run["status"] == "completed", run
    body = body_result(run)["body_markdown"]
    assert GROUNDED_SENTENCES[0] in body
    assert "rooftop" not in body
    assert "airport pickup" not in body
    assert "UNSUPPORTED_SENTENCES_REMOVED" in run["result"]["warnings"][0]


@pytest.mark.parametrize(
    ("case_id", "sentence", "expected_error"),
    [
        pytest.param(
            "invented-number",
            "Newcomers compare 24 living areas.",
            "UNSUPPORTED_CONTENT_CLAIM",
            id="decision-unsupported-number-fails-closed",
        ),
        pytest.param(
            "invented-price",
            "Studios cost $300 per month.",
            "UNSUPPORTED_CONTENT_CLAIM",
            id="decision-unsupported-price-fails-closed",
        ),
    ],
)
def test_unresolved_numeric_and_price_claims_never_reach_output(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    sentence: str,
    expected_error: str,
) -> None:
    """State: initial unsupported draft -> one rewrite -> fail closed if claim remains."""
    del case_id
    provider = DraftProvider(
        draft(
            sections=[
                {"heading": "Living areas", "body": f"{GROUNDED_SENTENCES[0]} {sentence}"},
                {"heading": "Quiet districts", "body": GROUNDED_SENTENCES[1]},
            ]
        )
    )
    run = run_job(
        make_ai_client(provider=provider, provider_mode="live"), seo_job(client)
    )

    assert run["status"] == "failed"
    assert run["error_code"] == expected_error
    assert len(provider.systems) == 2
    assert "Revision required" in provider.systems[1]


def test_search_location_is_canonicalized_and_listing_artifacts_removed(
    client: TestClient, make_ai_client: Any
) -> None:
    """EP variant place spelling and listing dates/numbers normalize to profile/source."""
    job = seo_job(client)
    job["payload"]["business_profile"]["locations"] = ["Da Nang"]
    job["payload"]["snapshot"]["sources"][0]["chunks"][0]["text"] = (
        "11 Living areas in Da Nang suit newcomers (updated Jan 2023). "
        "Quiet river districts suit families who want shops within walking distance."
    )
    # Keep Research evidence and its artifact hash coherent with the changed snapshot.
    research = job["payload"]["research"]
    research["evidence"][0]["quote"] = job["payload"]["snapshot"]["sources"][0]["chunks"][0]["text"]
    research["result"]["findings"][0]["evidence"]["quote"] = research["evidence"][0]["quote"]
    canonicalize_artifact(research)
    provider = DraftProvider(
        draft(
            title="Living areas in Da N-ang",
            meta="The guide compares living areas in Da N-ang.",
            sections=[
                {
                    "heading": "Overview",
                    "body": "11 Living areas in Da N-ang suit newcomers (updated Jan 2023).",
                },
                {
                    "heading": "Quiet districts",
                    "body": GROUNDED_SENTENCES[1],
                },
            ],
        )
    )
    run = run_job(
        make_ai_client(provider=provider, provider_mode="live"), job
    )

    assert run["status"] == "completed", run
    result = body_result(run)
    assert "Da N-ang" not in result["title"] + result["meta_description"] + result["body_markdown"]
    assert "11 Living" not in result["body_markdown"]
    assert "updated Jan" not in result["body_markdown"]
    assert "Living areas in Da Nang" in result["title"]


def test_research_blocking_facts_control_article_handoff(
    client: TestClient, make_ai_client: Any
) -> None:
    """Decision table: research coverage notes do not block; confirmed missing facts do."""
    job = seo_job(client)
    research = job["payload"]["research"]
    research["result"]["missing_facts"] = [
        "complete_research_explanation",
        "source_gap:housing",
        "stale_evidence:2018",
    ]
    canonicalize_artifact(research)
    long_body = " ".join(GROUNDED_SENTENCES * 5)
    second_long_body = " ".join(GROUNDED_SENTENCES * 5)
    long_provider = DraftProvider(
        draft(
            sections=[
                {"heading": "Living areas", "body": long_body},
                {"heading": "Quiet districts", "body": second_long_body},
            ]
        )
    )
    first = run_job(
        make_ai_client(provider=long_provider, provider_mode="live"), job
    )
    assert body_result(first)["status"] == "draft"
    assert body_result(first)["missing_facts"] == []

    research["result"]["missing_facts"] = ["confirmed_offer"]
    canonicalize_artifact(research)
    job["job_id"] = str(uuid4())
    second = run_job(
        make_ai_client(
            provider=DraftProvider(
                draft(
                    sections=[
                        {"heading": "Living areas", "body": long_body},
                        {"heading": "Quiet districts", "body": second_long_body},
                    ]
                )
            ),
            provider_mode="live",
        ),
        job,
    )
    assert body_result(second)["status"] == "insufficient_data"
    assert body_result(second)["missing_facts"] == ["confirmed_offer"]


@pytest.mark.parametrize(
    (
        "case_id",
        "first_sentence_count",
        "second_sentence_count",
        "expected_status",
        "expected_missing",
    ),
    [
        pytest.param(
            "one-under-minimum",
            15,
            4,
            "insufficient_data",
            ["article_too_short"],
            id="bva-149-words",
        ),
        pytest.param("minimum-boundary", 12, 6, "draft", [], id="bva-150-words"),
    ],
)
def test_public_article_word_count_boundary(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    first_sentence_count: int,
    second_sentence_count: int,
    expected_status: str,
    expected_missing: list[str],
) -> None:
    """BVA at MIN_ARTICLE_WORDS: exact 149/150 grounded words straddle the handoff gate."""
    del case_id
    job = seo_job(client)
    sections = [
        {
            "heading": "Living areas",
            "body": " ".join(
                [GROUNDED_SENTENCES[0]] * (first_sentence_count // 2)
                + [GROUNDED_SENTENCES[1]] * (second_sentence_count // 2)
            ),
        },
        {
            "heading": "Quiet districts",
            "body": " ".join(
                [GROUNDED_SENTENCES[0]] * (first_sentence_count - first_sentence_count // 2)
                + [GROUNDED_SENTENCES[1]] * (second_sentence_count - second_sentence_count // 2)
            ),
        },
    ]
    provider = DraftProvider(draft(sections=sections))
    run = run_job(
        make_ai_client(provider=provider, provider_mode="live"), job
    )

    assert run["status"] == "completed", run
    result = body_result(run)
    expected_words = 7 * first_sentence_count + 11 * second_sentence_count
    actual_words = sum(len(section["body"].split()) for section in sections)
    assert actual_words == expected_words
    assert result["status"] == expected_status
    assert result["missing_facts"] == expected_missing


@pytest.mark.parametrize(
    ("case_id", "operation"),
    [
        pytest.param("audit-alias", "seo.audit", id="known-audit-alias"),
        pytest.param("refresh-alias", "content.refresh", id="known-refresh-alias"),
    ],
)
def test_audit_and_refresh_are_currently_routed_through_article_drafting(
    client: TestClient,
    make_ai_client: Any,
    case_id: str,
    operation: str,
) -> None:
    """State-transition sentinel: these operation codes currently invoke the SEO draft handler."""
    del case_id
    job = seo_job(client)
    job["operation"] = operation
    run = run_job(
        make_ai_client(provider=DraftProvider(), provider_mode="live"), job
    )
    assert run["status"] == "completed", run
    result = body_result(run)
    assert "body_markdown" in result
    assert "issues" not in result


def test_empty_research_artifact_is_rejected_without_provider_call(
    client: TestClient, make_ai_client: Any
) -> None:
    """EP empty-finding class transitions to explicit MISSING_RESEARCH failure."""
    job = seo_job(client)
    research = job["payload"]["research"]
    research["result"]["findings"] = []
    research["evidence"] = []
    research["result"]["evidence"] = []
    canonicalize_artifact(research)
    provider = DraftProvider()
    run = run_job(make_ai_client(provider=provider, provider_mode="live"), job)

    assert run["status"] == "failed"
    assert run["error_code"] == "MISSING_RESEARCH"
    assert provider.prompts == []


def test_article_generation_is_deterministic_for_same_job_and_input(
    client: TestClient, make_ai_client: Any
) -> None:
    """State/idempotency: retrying the same job does not create another model draft."""
    job = seo_job(client)
    provider = DraftProvider()
    service = make_ai_client(provider=provider, provider_mode="live")
    first = run_job(service, job)
    second = run_job(service, job)

    assert first["result"] == second["result"]
    assert provider.prompts
    assert first["provider_calls"] == second["provider_calls"]
