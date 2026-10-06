"""W1-QQ-03: knowledge.ingest for text, PDF with text, allowlisted URL."""

from __future__ import annotations

from conftest import run_job
from evals.fixtures import (
    GUIDE_PDF_PAGES,
    SOURCE_IDS,
    WS_A,
    ingest_pdf_payload,
    ingest_text_payload,
    job,
)
from src.rag.chunking import chunk_segments, estimate_tokens
from src.rag.parsing import Segment, parse_html


def test_src_housing_v1_text_ingest(client) -> None:
    body = run_job(client, job("knowledge.ingest", ingest_text_payload("SRC-HOUSING-v1"), name="t-ingest-housing"))
    assert body["status"] == "completed", body
    result = body["result"]["result"]
    assert result["source_id"] == SOURCE_IDS["SRC-HOUSING"]
    assert result["source_version"] == 1
    assert result["workspace_id"] == WS_A
    assert result["embedding_dim"] == 768
    assert result["searchable"] is False
    assert len(result["content_hash"]) == 64
    assert result["chunk_count"] == len(result["chunks"]) >= 1
    first = result["chunks"][0]
    assert first["locator"].startswith("paragraph:1")
    assert all(len(chunk["embedding"]) == 768 for chunk in result["chunks"])
    assert all(chunk["page"] is None for chunk in result["chunks"])
    assert "Example Residence" in " ".join(chunk["text"] for chunk in result["chunks"])
    assert body["result"]["usage"]["llm_calls"] == 0
    assert body["result"]["usage"]["embedding_calls"] >= 1
    assert result["provenance"]["license"] == "synthetic-fixture"
    assert body["result"]["warnings"] == []


def test_missing_provenance_is_flagged(client) -> None:
    payload = ingest_text_payload("SRC-HOUSING-v1")
    del payload["source"]["provenance"]
    body = run_job(client, job("knowledge.ingest", payload, name="t-ingest-no-provenance"))
    assert body["status"] == "completed"
    assert body["result"]["result"]["provenance"] is None
    assert "PROVENANCE_MISSING" in body["result"]["warnings"]


def test_two_page_pdf_keeps_page_locators(client) -> None:
    body = run_job(client, job("knowledge.ingest", ingest_pdf_payload(GUIDE_PDF_PAGES), name="t-ingest-pdf"))
    assert body["status"] == "completed", body
    result = body["result"]["result"]
    assert result["page_count"] == 2
    pages = {chunk["page"]: chunk for chunk in result["chunks"]}
    assert set(pages) == {1, 2}
    assert "Son Tra" in pages[1]["text"] and pages[1]["locator"].startswith("page:1;")
    assert "Hai Chau" in pages[2]["text"] and pages[2]["locator"].startswith("page:2;")
    assert "Hai Chau" not in pages[1]["text"]


def test_pdf_without_text_is_unsupported_not_ocr(client) -> None:
    body = run_job(client, job("knowledge.ingest", ingest_pdf_payload([[], []], label="SCAN"), name="t-ingest-scan"))
    assert body["status"] == "failed"
    assert body["error_code"] == "UNSUPPORTED_PDF_NO_TEXT"
    assert body["retryable"] is False
    assert body["result"] is None


def test_pdf_with_one_blank_page_warns(client) -> None:
    pages = [GUIDE_PDF_PAGES[0], []]
    body = run_job(client, job("knowledge.ingest", ingest_pdf_payload(pages, label="PARTIAL"), name="t-ingest-partial"))
    assert body["status"] == "completed"
    assert body["result"]["warnings"] == ["PDF_PAGE_WITHOUT_TEXT:2"]


def test_invalid_pdf_bytes(client) -> None:
    payload = ingest_pdf_payload(GUIDE_PDF_PAGES)
    payload["source"]["content_base64"] = "bm90IGEgcGRm"  # "not a pdf"
    body = run_job(client, job("knowledge.ingest", payload, name="t-ingest-invalid-pdf"))
    assert body["error_code"] == "INVALID_PDF"


def _url_payload(url: str, html: str | None) -> dict:
    return {
        "source": {
            "source_id": SOURCE_IDS["SRC-COWORKING"],
            "version": 1,
            "workspace_id": WS_A,
            "kind": "url",
            "url": url,
            "html": html,
        }
    }


def test_url_outside_allowlist_is_rejected_at_create(client) -> None:
    response = client.post(
        "/internal/v1/runs",
        json=job("knowledge.ingest", _url_payload("https://evil.example.com/page", "<p>x</p>"), name="t-url-deny"),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "URL_NOT_ALLOWED"
    lookalike = client.post(
        "/internal/v1/runs",
        json=job("knowledge.ingest", _url_payload("https://enostaspace.com.evil.io/", "<p>x</p>"), name="t-url-look"),
    )
    assert lookalike.json()["error"]["code"] == "URL_NOT_ALLOWED"


def test_allowlisted_url_with_prefetched_html(client) -> None:
    html = (
        "<html><head><title>Coworking (synthetic)</title><script>steal()</script></head>"
        "<body><nav>Menu</nav><h1>Coworking</h1><p>Hot desks are available in Hai Chau.</p>"
        "<p>Meeting rooms can be booked.</p><footer>Footer</footer></body></html>"
    )
    url = "https://enostaspace.com/coworking"
    body = run_job(client, job("knowledge.ingest", _url_payload(url, html), name="t-url-ok"))
    assert body["status"] == "completed", body
    result = body["result"]["result"]
    assert result["title"] == "Coworking (synthetic)"
    text = " ".join(chunk["text"] for chunk in result["chunks"])
    assert "Hot desks" in text and "steal" not in text and "Menu" not in text and "Footer" not in text
    assert all(chunk["url"] == url for chunk in result["chunks"])


def test_chunks_respect_token_cap_and_never_cross_pages() -> None:
    long_paragraph = " ".join(f"Sentence number {index} about Da Nang living." for index in range(400))
    segments = [Segment(long_paragraph, 1, page=1), Segment("Short page two text.", 1, page=2)]
    chunks = chunk_segments(segments, max_tokens=512)
    assert all(estimate_tokens(chunk.text) <= 512 for chunk in chunks)
    assert len({chunk.page for chunk in chunks}) == 2
    assert all(chunk.page in {1, 2} for chunk in chunks)
    assert chunks[-1].text == "Short page two text."


def test_html_parser_ignores_scripts() -> None:
    segments, title = parse_html("<title>T</title><style>.x{}</style><p>One</p><p>Two</p>", "https://vietnam.travel/")
    assert title == "T"
    assert [segment.text for segment in segments] == ["One", "Two"]
