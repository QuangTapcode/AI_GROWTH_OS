"""knowledge.ingest: extract → normalize → chunk → embed, returned for BE to persist.

The AI service does not write chunks anywhere. BE stores them against the exact
source_id/version and only makes them searchable after human approval.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib

from ..app.runtime import OperationError, OperationOutcome, RunContext
from ..app.schemas import IngestPayload, JobRequest
from ..app.config import Settings
from .chunking import chunk_segments
from .parsing import PARSER_VERSION, check_url_allowed, fetch_url, parse_html, parse_pdf, parse_text


PROMPT_VERSION = "knowledge-ingest-v1"
# EmbeddingGemma expects task prefixes; queries must use the matching query prefix.
EMBEDDING_INPUT_FORMAT = "embeddinggemma-prefix-v1"


def document_embedding_input(title: str | None, text: str) -> str:
    return f"title: {title or 'none'} | text: {text}"


def query_embedding_input(question: str) -> str:
    return f"task: search result | query: {question}"


def validate_ingest(job: JobRequest, payload: IngestPayload, settings: Settings) -> list[tuple[str, str]]:
    """Create-time checks; returned as (code, message) pairs for a 422."""

    source = payload.source
    problems: list[tuple[str, str]] = []
    if source.workspace_id != job.workspace_id:
        problems.append(("TENANT_SCOPE_VIOLATION", "Source workspace does not match the job workspace"))
    if source.kind == "text" and not source.text:
        problems.append(("INVALID_SOURCE", "Text source requires text"))
    if source.kind == "pdf" and not source.content_base64:
        problems.append(("INVALID_SOURCE", "PDF source requires content_base64"))
    if source.kind == "url":
        if not source.url:
            problems.append(("INVALID_SOURCE", "URL source requires url"))
        else:
            try:
                check_url_allowed(source.url, settings.ingest_url_allowlist)
            except OperationError as exc:
                problems.append((exc.code, str(exc)))
    if source.text and len(source.text.encode("utf-8")) > settings.max_source_bytes:
        problems.append(("SOURCE_TOO_LARGE", "Text exceeds the source size limit"))
    if source.html and len(source.html.encode("utf-8")) > settings.max_source_bytes:
        problems.append(("SOURCE_TOO_LARGE", "HTML exceeds the source size limit"))
    return problems


async def run_ingest(ctx: RunContext) -> OperationOutcome:
    payload: IngestPayload = ctx.payload
    source = payload.source
    settings = ctx.settings
    warnings: list[str] = []
    page_count: int | None = None
    title = source.title
    final_url: str | None = None

    if source.kind == "text":
        raw = (source.text or "").encode("utf-8")
        segments = parse_text(source.text or "")
    elif source.kind == "pdf":
        try:
            raw = base64.b64decode(source.content_base64 or "", validate=True)
        except (binascii.Error, ValueError) as exc:
            raise OperationError("INVALID_SOURCE", "content_base64 is not valid base64") from exc
        if len(raw) > settings.max_source_bytes:
            raise OperationError("SOURCE_TOO_LARGE", "PDF exceeds the source size limit")
        # CPU-bound parsing runs off the event loop so status polling stays responsive.
        segments, page_count, empty_pages = await asyncio.to_thread(parse_pdf, raw)
        warnings.extend(f"PDF_PAGE_WITHOUT_TEXT:{page}" for page in empty_pages)
    else:
        if source.html is not None:
            final_url, html = source.url or "", source.html
        else:
            final_url, html = await fetch_url(source.url or "", settings)
        raw = html.encode("utf-8")
        segments, page_title = await asyncio.to_thread(parse_html, html, final_url)
        title = title or page_title

    if not segments:
        raise OperationError("EMPTY_SOURCE", "Source contains no extractable text")

    chunks = await asyncio.to_thread(chunk_segments, segments, max_tokens=settings.max_chunk_tokens)
    if len(chunks) > settings.max_chunks_per_source:
        raise OperationError(
            "SOURCE_TOO_LARGE",
            f"Source produced {len(chunks)} chunks; limit is {settings.max_chunks_per_source}",
        )

    vectors = await ctx.embed([document_embedding_input(title, chunk.text) for chunk in chunks])
    if source.provenance is None:
        # Not fatal (TripC's own uploads may be added later), but BE must not publish without reuse rights.
        warnings.append("PROVENANCE_MISSING")

    result = {
        "source_id": str(source.source_id),
        "source_version": source.version,
        "workspace_id": str(source.workspace_id),
        "kind": source.kind,
        # Canonical names consumed by the BE sources/source_chunks tables.
        "url_or_blob": final_url,
        "label": source.label,
        "title": title,
        "url": final_url,
        "page_count": page_count,
        "provenance": source.provenance.model_dump(mode="json") if source.provenance else None,
        "content_hash": hashlib.sha256(raw).hexdigest(),
        "parser_version": PARSER_VERSION,
        "embedding_model": ctx.provider.embedding_model_version,
        "embedding_dim": settings.embedding_dim,
        "embedding_input_format": EMBEDDING_INPUT_FORMAT,
        "chunk_count": len(chunks),
        "chunks": [
            {
                "chunk_index": chunk.index,
                "text": chunk.text,
                "text_content": chunk.text,
                "locator": chunk.locator,
                "citation_locator": chunk.locator,
                "page": chunk.page,
                "url": chunk.url,
                "paragraph_start": chunk.paragraph_start,
                "paragraph_end": chunk.paragraph_end,
                "token_estimate": chunk.token_estimate,
                "content_hash": chunk.content_hash,
                "embedding": vector,
                "model": ctx.provider.embedding_model_version,
            }
            for chunk, vector in zip(chunks, vectors, strict=True)
        ],
        # Indexing state stays with BE: chunks are not searchable until the version is approved.
        "searchable": False,
        "synthetic": ctx.job.synthetic,
    }
    return OperationOutcome(result=result, warnings=warnings)
