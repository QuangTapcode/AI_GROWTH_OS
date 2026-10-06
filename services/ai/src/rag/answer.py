"""knowledge.answer: English answer with evidence refs over approved, tenant-scoped sources."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from ..app.config import Settings
from ..app.runtime import OperationOutcome, RunContext
from ..app.schemas import AnswerPayload, EvidenceRef, JobRequest, SnapshotSource, SourceFact
from ..guardrails.facts import (
    has_price_claim,
    is_verified_value,
    missing_answer,
    sensitive_keys_in,
    unsupported_numbers,
)
from .chunking import estimate_tokens
from .ingest import document_embedding_input, query_embedding_input
from .places import fold, place_notes
from .retrieval import (
    ScoredChunk,
    eligible_sources,
    rank_chunks,
    select_within_budget,
    snapshot_scope_problems,
    terms,
)


PROMPT_VERSION = "knowledge-answer-v2"
SYSTEM_PROMPT = (Path(__file__).resolve().parents[2] / "prompts" / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")
INSUFFICIENT = "The approved sources do not contain enough information to answer this question."
_SENTENCE = re.compile(r"(?<=[.!?])\s+")


class LLMAnswer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str = Field(max_length=1500)
    cited_chunk_ids: list[str] = Field(default_factory=list, max_length=10)


def validate_answer(job: JobRequest, payload: AnswerPayload, settings: Settings) -> list[tuple[str, str]]:
    return snapshot_scope_problems(job, payload.snapshot)


def _fact_sentence(source: SnapshotSource, fact: SourceFact, label: str, verb: str) -> str:
    unit = f" {fact.unit}" if fact.unit else ""
    return f"According to {source.title or 'the approved source'}, the {label} {verb} {fact.value}{unit}."


def _expired(fact: SourceFact) -> bool:
    if fact.valid_until is None:
        return False
    valid_until = fact.valid_until if fact.valid_until.tzinfo else fact.valid_until.replace(tzinfo=timezone.utc)
    return valid_until < datetime.now(timezone.utc)


def _provenance_fields(source: SnapshotSource, chunk_url: str | None = None) -> dict:
    provenance = source.provenance
    if provenance is None:
        return {"source_url": chunk_url}
    return {
        "source_url": chunk_url or provenance.source_url,
        "license": provenance.license,
        "attribution": provenance.attribution,
    }


def _answer_from_facts(ctx: RunContext, eligible: list[SnapshotSource], result: dict, warnings: list[str]) -> OperationOutcome:
    """Sensitive questions are answered from verified structured facts only, without an LLM call."""

    sentences: list[str] = []
    evidence: list[EvidenceRef] = []
    missing_labels: list[str] = []
    for definition in sensitive_keys_in(ctx.payload.question):
        hit = next(
            (
                (source, fact)
                for source in eligible
                for fact in source.facts
                if fact.key == definition.key and is_verified_value(fact.value, fact.verification) and not _expired(fact)
            ),
            None,
        )
        if hit is None:
            missing_labels.append(definition.label)
            result["missing_fact_keys"].append(definition.key)
            if definition.warning not in warnings:
                warnings.append(definition.warning)
            continue
        source, fact = hit
        sentences.append(_fact_sentence(source, fact, definition.label, definition.verb))
        evidence.append(
            EvidenceRef(
                source_id=source.source_id,
                source_version=source.version,
                locator=fact.locator,
                quote=f"{fact.key}: {fact.value}{' ' + fact.unit if fact.unit else ''}"[:500],
                **_provenance_fields(source),
            )
        )
    if missing_labels:
        sentences.append(missing_answer(missing_labels))
    result["answer"] = " ".join(sentences)
    result["answered_from"] = "verified_facts" if evidence else "none"
    return OperationOutcome(result=result, evidence=evidence, warnings=warnings)


def _extractive_fake(question: str, selected: list[ScoredChunk], ids: list[str]) -> dict:
    question_terms = terms(question)
    best: tuple[float, str, str] | None = None
    for short_id, item in zip(ids, selected):
        for sentence in _SENTENCE.split(item.chunk.text):
            overlap = len(question_terms & terms(sentence))
            if overlap and (best is None or overlap > best[0]):
                best = (overlap, sentence.strip(), short_id)
    if best is None:
        return {"answer": INSUFFICIENT, "cited_chunk_ids": []}
    return {"answer": best[1], "cited_chunk_ids": [best[2]]}


async def run_answer(ctx: RunContext) -> OperationOutcome:
    payload: AnswerPayload = ctx.payload
    job = ctx.job
    eligible, excluded = eligible_sources(job, payload.snapshot)
    warnings: list[str] = [f"EXCLUDED_INELIGIBLE_SOURCES:{excluded}"] if excluded else []
    result: dict = {
        "answer": INSUFFICIENT,
        "language": "en",
        "missing_fact_keys": [],
        "answered_from": "none",
        "retrieved_chunks": [],
        "context_tokens_estimate": 0,
        "eligible_source_count": len(eligible),
        "synthetic": job.synthetic,
        "place_notes": [],
    }

    if sensitive_keys_in(payload.question):
        return _answer_from_facts(ctx, eligible, result, warnings)

    candidates = [(source, chunk) for source in eligible for chunk in source.chunks]
    if not candidates:
        warnings.append("NO_APPROVED_SOURCES" if not eligible else "NO_APPROVED_CHUNKS")
        return OperationOutcome(result=result, warnings=warnings)

    dim = ctx.settings.embedding_dim
    # Old/new 2025 place names are added to the search text only; they are hints, not evidence.
    notes = place_notes(payload.question)
    result["place_notes"] = notes
    # Folded to ASCII so lexical scoring also matches undiacritised guide text ("Hai Chau").
    search_text = " ".join([payload.question, *(fold(note) for note in notes)])
    to_embed = [query_embedding_input(search_text)]
    missing_positions: list[int] = []
    for position, (source, chunk) in enumerate(candidates):
        if not chunk.embedding or len(chunk.embedding) != dim:
            missing_positions.append(position)
            to_embed.append(document_embedding_input(source.title, chunk.text))
    vectors = await ctx.embed(to_embed)
    query_vector = vectors[0]
    filled = dict(zip(missing_positions, vectors[1:]))
    ranked = rank_chunks(
        search_text,
        query_vector,
        [(source, chunk, filled.get(position) or chunk.embedding or []) for position, (source, chunk) in enumerate(candidates)],
    )

    overhead = estimate_tokens(SYSTEM_PROMPT) + estimate_tokens(payload.question) + 300
    selected, used = select_within_budget(
        ranked,
        token_budget=max(0, ctx.settings.max_input_tokens - overhead),
        max_chunks=ctx.settings.max_retrieved_chunks,
    )
    result["context_tokens_estimate"] = used
    result["retrieved_chunks"] = [
        {
            "chunk_id": item.chunk.chunk_id,
            "source_id": str(item.source.source_id),
            "source_version": item.source.version,
            "score": round(item.score, 4),
        }
        for item in selected
    ]
    if not selected:
        warnings.append("CONTEXT_BUDGET_EXCEEDED")
        return OperationOutcome(result=result, warnings=warnings)

    # Short excerpt ids keep prompts small and avoid collisions between BE chunk ids.
    short_ids = [f"S{index}" for index in range(1, len(selected) + 1)]
    by_short_id = dict(zip(short_ids, selected))
    user = json.dumps(
        {
            "question": payload.question,
            "place_name_notes": notes,
            "excerpts": [
                {
                    "chunk_id": short_id,
                    "source_title": item.source.title,
                    "locator": item.chunk.locator,
                    "text": item.chunk.text,
                }
                for short_id, item in by_short_id.items()
            ],
        },
        ensure_ascii=False,
    )
    reply = await ctx.call_json(
        system=SYSTEM_PROMPT,
        user=user,
        model=LLMAnswer,
        fake=lambda: _extractive_fake(payload.question, selected, short_ids),
    )

    cited_ids = list(dict.fromkeys(reply.cited_chunk_ids))
    cited = [by_short_id[cid] for cid in cited_ids if cid in by_short_id]
    if len(cited) < len(cited_ids):
        warnings.append("INVALID_CITATION_DROPPED")
    answer = reply.answer.strip()
    if answer != INSUFFICIENT and not cited:
        warnings.append("UNCITED_ANSWER_REPLACED")
        answer = INSUFFICIENT
    if cited and unsupported_numbers(answer, [item.chunk.text for item in cited]):
        warnings.append("UNSUPPORTED_NUMERIC_CLAIM")
        answer, cited = INSUFFICIENT, []
    if cited and has_price_claim(answer):
        # Even a price quoted verbatim from a chunk is free text (possibly injected), not a verified fact.
        warnings.append("UNVERIFIED_PRICE_CLAIM")
        answer, cited = INSUFFICIENT, []
    if answer == INSUFFICIENT:
        cited = []
        warnings.append("INSUFFICIENT_EVIDENCE")

    result["answer"] = answer
    result["answered_from"] = "retrieved_chunks" if cited else "none"
    evidence = [
        EvidenceRef(
            source_id=item.source.source_id,
            source_version=item.source.version,
            chunk_id=item.chunk.chunk_id,
            locator=item.chunk.locator,
            quote=item.chunk.text[:500],
            **_provenance_fields(item.source, item.chunk.url),
        )
        for item in cited
    ]
    return OperationOutcome(result=result, evidence=evidence, warnings=warnings)
