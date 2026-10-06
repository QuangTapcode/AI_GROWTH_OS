"""W1-QQ-04: tenant-scoped retrieval, evidence refs, missing facts, revoke."""

from __future__ import annotations

import json
import re

from conftest import run_job
from evals.fixtures import (
    GUIDE_PDF_PAGES,
    SOURCE_IDS,
    WS_A,
    answer_payload,
    ingest_pdf_payload,
    job,
    snapshot_source,
)
from src.app.providers import hashed_embedding
from src.app.schemas import Usage


def ask(client, question: str, labels: list[str], *, approved: list[str] | None = None, name: str, sources=None):
    payload = answer_payload(question, sources or [snapshot_source(label) for label in labels])
    return run_job(client, job("knowledge.answer", payload, name=name, approved=approved if approved is not None else labels))


def cited_sources(body) -> set[str]:
    return {item["source_id"] for item in body["result"]["evidence"]}


def test_residence_name_answer_cites_housing_source(client) -> None:
    body = ask(client, "Which area of Da Nang is Example Residence in?", ["SRC-HOUSING-v1"], name="a-name")
    assert body["status"] == "completed", body
    result = body["result"]["result"]
    assert "Son Tra" in result["answer"]
    assert result["answered_from"] == "retrieved_chunks"
    evidence = body["result"]["evidence"][0]
    assert evidence["source_id"] == SOURCE_IDS["SRC-HOUSING"]
    assert evidence["source_version"] == 1
    assert evidence["locator"] == "paragraph:2"
    assert body["result"]["prompt_version"] == "knowledge-answer-v2"


def test_monthly_rent_null_reports_missing_without_number(client) -> None:
    body = ask(client, "What is the monthly rent?", ["SRC-HOUSING-v1"], name="a-rent")
    result = body["result"]["result"]
    assert result["answer"] == "The available sources do not include a verified monthly rent."
    assert result["missing_fact_keys"] == ["monthly_rent"]
    assert body["result"]["warnings"] == ["MISSING_VERIFIED_PRICE"]
    assert body["result"]["evidence"] == []
    assert not re.search(r"\d", result["answer"])
    assert body["result"]["usage"]["llm_calls"] == 0


def test_revoked_price_source_is_never_used(client) -> None:
    sources = [snapshot_source("SRC-HOUSING-v1"), snapshot_source("SRC-REVOKED-v1")]
    body = ask(
        client,
        "How much is the monthly rent at Example Residence?",
        [],
        approved=["SRC-HOUSING-v1", "SRC-REVOKED-v1"],
        sources=sources,
        name="a-revoked-price",
    )
    result = body["result"]["result"]
    assert "9,000,000" not in result["answer"] and "9000000" not in result["answer"]
    assert result["missing_fact_keys"] == ["monthly_rent"]
    assert "EXCLUDED_INELIGIBLE_SOURCES:1" in body["result"]["warnings"]


def test_revoke_then_ask_again_uses_no_old_chunks(client) -> None:
    question = "Which coworking space is in Hai Chau?"
    before = ask(client, question, ["SRC-COWORKING-v1", "SRC-HOUSING-v1"], name="a-before-revoke")
    assert SOURCE_IDS["SRC-COWORKING"] in cited_sources(before)

    # After revoke BE drops the version from approved_source_versions; a stale snapshot may still carry it.
    after = ask(
        client,
        question,
        [],
        approved=["SRC-HOUSING-v1"],
        sources=[snapshot_source("SRC-COWORKING-v1", status="revoked"), snapshot_source("SRC-HOUSING-v1")],
        name="a-after-revoke",
    )
    assert SOURCE_IDS["SRC-COWORKING"] not in cited_sources(after)
    assert all(chunk["source_id"] != SOURCE_IDS["SRC-COWORKING"] for chunk in after["result"]["result"]["retrieved_chunks"])
    assert "Cowork Hub" not in after["result"]["result"]["answer"]


def test_deleted_and_stale_versions_are_excluded(client) -> None:
    deleted = ask(
        client,
        "Which coworking space is in Hai Chau?",
        [],
        approved=["SRC-COWORKING-v1"],
        sources=[snapshot_source("SRC-COWORKING-v1", deleted=True)],
        name="a-deleted",
    )
    assert deleted["result"]["evidence"] == []
    assert "NO_APPROVED_SOURCES" in deleted["result"]["warnings"]

    stale = ask(
        client,
        "Does Example Residence have a rooftop terrace?",
        [],
        approved=["SRC-HOUSING-v2"],
        sources=[snapshot_source("SRC-HOUSING-v1"), snapshot_source("SRC-HOUSING-v2")],
        name="a-stale-version",
    )
    assert {item["source_version"] for item in stale["result"]["evidence"]} <= {2}
    assert all(chunk["source_version"] == 2 for chunk in stale["result"]["result"]["retrieved_chunks"])


def test_workspace_b_source_rejects_the_request(client) -> None:
    payload = answer_payload("What is the monthly rent?", [snapshot_source("SRC-HOUSING-v1"), snapshot_source("SRC-WSB-v1")])
    response = client.post("/internal/v1/runs", json=job("knowledge.answer", payload, name="a-wsb", approved=["SRC-HOUSING-v1"]))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "TENANT_SCOPE_VIOLATION"
    assert "12,000,000" not in response.text


def test_injected_instructions_do_not_produce_price(client) -> None:
    labels = ["SRC-INJECTION-v1", "SRC-HOUSING-v1"]
    food = ask(client, "What food can I find near Han Market?", labels, name="a-injection-food")
    assert "5,000,000" not in food["result"]["result"]["answer"]
    assert "system prompt" not in food["result"]["result"]["answer"].lower()
    price = ask(client, "How much does Example Residence cost per month?", labels, name="a-injection-price")
    assert price["result"]["result"]["missing_fact_keys"] == ["monthly_rent"]
    assert not re.search(r"\d", price["result"]["result"]["answer"])


def test_numbers_present_in_cited_chunk_are_allowed(client) -> None:
    body = ask(client, "How many hot desks and meeting rooms are offered?", ["SRC-COWORKING-v1"], name="a-desks")
    assert "40" in body["result"]["result"]["answer"]
    assert "UNSUPPORTED_NUMERIC_CLAIM" not in body["result"]["warnings"]


def test_opening_hours_only_from_verified_facts(client) -> None:
    # The chunk lists hours, but free-text hours are third-party and may be stale.
    body = ask(client, "What are the coworking space opening hours?", ["SRC-COWORKING-v1"], name="a-hours")
    result = body["result"]["result"]
    assert result["missing_fact_keys"] == ["opening_hours"]
    assert body["result"]["warnings"] == ["MISSING_VERIFIED_HOURS"]
    assert "8:00" not in result["answer"]

    verified = snapshot_source("SRC-COWORKING-v1")
    verified["facts"] = [
        *verified["facts"],
        {"key": "opening_hours", "value": "Mon-Fri 08:00-20:00", "verification": "verified", "locator": "paragraph:3"},
    ]
    body = ask(
        client,
        "What are the coworking space opening hours?",
        [],
        approved=["SRC-COWORKING-v1"],
        sources=[verified],
        name="a-hours-verified",
    )
    assert body["result"]["result"]["answer"] == (
        "According to Example Cowork Hub (synthetic), the opening hours are Mon-Fri 08:00-20:00."
    )


def test_evidence_carries_source_provenance(client) -> None:
    source = snapshot_source("SRC-HOUSING-v1")
    source["provenance"] = {
        "license": "CC BY-SA 4.0",
        "attribution": "Example attribution",
        "source_url": "https://example.org/housing",
    }
    body = ask(
        client,
        "Which area of Da Nang is Example Residence in?",
        [],
        approved=["SRC-HOUSING-v1"],
        sources=[source],
        name="a-provenance",
    )
    evidence = body["result"]["evidence"][0]
    assert (evidence["license"], evidence["attribution"]) == ("CC BY-SA 4.0", "Example attribution")
    assert evidence["source_url"] == "https://example.org/housing"


def test_pdf_citation_keeps_page_from_ingest(client) -> None:
    ingested = run_job(client, job("knowledge.ingest", ingest_pdf_payload(GUIDE_PDF_PAGES), name="a-pdf-ingest"))["result"]["result"]
    source = {
        "source_id": SOURCE_IDS["SRC-GUIDE-PDF"],
        "version": 1,
        "workspace_id": WS_A,
        "status": "approved",
        "title": ingested["title"],
        "chunks": [
            {"chunk_id": f"pdf-{chunk['chunk_index']}", "text": chunk["text"], "locator": chunk["locator"], "page": chunk["page"], "embedding": chunk["embedding"]}
            for chunk in ingested["chunks"]
        ],
    }
    payload = answer_payload("Where are coworking spaces near the Han River?", [source])
    body = run_job(
        client,
        {**job("knowledge.answer", payload, name="a-pdf-answer"), "approved_source_versions": [{"source_id": SOURCE_IDS["SRC-GUIDE-PDF"], "version": 1}]},
    )
    evidence = body["result"]["evidence"]
    assert evidence and evidence[0]["locator"].startswith("page:2;")
    assert "Hai Chau" in body["result"]["result"]["answer"]


def test_no_approved_sources_reports_insufficient(client) -> None:
    body = ask(client, "Which coworking space is in Hai Chau?", ["SRC-COWORKING-v1"], approved=[], name="a-none")
    assert body["result"]["result"]["answer"].startswith("The approved sources do not contain")
    assert "NO_APPROVED_SOURCES" in body["result"]["warnings"]


class RepeatsInjectedPrice:
    """LLM double that follows the injected instruction and cites every excerpt."""

    model_version = "test/injected"
    embedding_model_version = "test/embed"

    async def chat_json(self, **_: object):  # type: ignore[no-untyped-def]
        reply = {"answer": "Example Residence costs 5,000,000 VND per month.", "cited_chunk_ids": ["S1", "S2", "S3"]}
        return json.dumps(reply), Usage(llm_calls=1)

    async def embed(self, texts: list[str]):  # type: ignore[no-untyped-def]
        return [hashed_embedding(text, 768) for text in texts], Usage(embedding_calls=1)


def test_price_quoted_from_free_text_is_blocked(make_client) -> None:
    client = make_client(provider=RepeatsInjectedPrice())
    body = ask(client, "What does the Example Food Street source say?", ["SRC-INJECTION-v1"], name="a-price-claim")
    result = body["result"]["result"]
    assert result["answer"].startswith("The approved sources do not contain")
    assert "5,000,000" not in json.dumps(body)
    assert "UNVERIFIED_PRICE_CLAIM" in body["result"]["warnings"]
    assert body["result"]["evidence"] == []


def test_old_place_names_expand_retrieval(client) -> None:
    body = ask(client, "Which coworking space is in the old Hai Chau district?", ["SRC-COWORKING-v1"], name="a-places")
    notes = body["result"]["result"]["place_notes"]
    assert any("Hải Châu" in note and "abolished 1 July 2025" in note for note in notes)
    assert body["result"]["evidence"][0]["source_id"] == SOURCE_IDS["SRC-COWORKING"]


def test_expired_verified_fact_is_not_used(client) -> None:
    source = snapshot_source("SRC-HOUSING-v1")
    rent = {"key": "monthly_rent", "value": 15000000, "unit": "VND/month", "verification": "verified", "locator": "paragraph:4"}
    source["facts"] = [{**rent, "valid_until": "2026-01-01T00:00:00Z"}]
    body = ask(client, "What is the monthly rent?", [], approved=["SRC-HOUSING-v1"], sources=[source], name="a-expired")
    assert body["result"]["result"]["missing_fact_keys"] == ["monthly_rent"]
    assert "15000000" not in body["result"]["result"]["answer"]

    source["facts"] = [{**rent, "valid_until": "2099-01-01T00:00:00Z"}]
    body = ask(client, "What is the monthly rent?", [], approved=["SRC-HOUSING-v1"], sources=[source], name="a-fresh")
    assert "15000000 VND/month" in body["result"]["result"]["answer"]
