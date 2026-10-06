"""Tenant-scoped retrieval over a BE-issued snapshot.

The filter is code, not prompt: only sources of the job workspace, status
``approved``, not deleted, and listed in ``approved_source_versions`` at the exact
version are eligible. Nothing is cached between runs, so a revoked source is gone
on the very next job.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

from ..app.schemas import JobRequest, KnowledgeSnapshot, SnapshotChunk, SnapshotSource
from .chunking import estimate_tokens


_WORD = re.compile(r"[a-z0-9]+")
_STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for", "from", "how", "i",
    "in", "is", "it", "me", "of", "on", "or", "the", "there", "this", "to", "what", "when", "where",
    "which", "who", "with", "you", "your",
}


def snapshot_scope_problems(job: JobRequest, snapshot: KnowledgeSnapshot) -> list[tuple[str, str]]:
    """Create-time checks. Foreign-tenant data rejects the whole request instead of being skipped."""

    problems: list[tuple[str, str]] = []
    if snapshot.workspace_id != job.workspace_id:
        problems.append(("TENANT_SCOPE_VIOLATION", "Snapshot workspace does not match the job workspace"))
    foreign = sorted({str(source.source_id) for source in snapshot.sources if source.workspace_id != job.workspace_id})
    if foreign:
        problems.append(("TENANT_SCOPE_VIOLATION", f"Snapshot contains sources from another workspace: {foreign}"))
    if job.context_snapshot_id and snapshot.snapshot_id and job.context_snapshot_id != snapshot.snapshot_id:
        problems.append(("SNAPSHOT_MISMATCH", "payload.snapshot.snapshot_id does not match context_snapshot_id"))
    return problems


def eligible_sources(job: JobRequest, snapshot: KnowledgeSnapshot) -> tuple[list[SnapshotSource], int]:
    approved = {(item.source_id, item.version) for item in job.approved_source_versions}
    eligible: list[SnapshotSource] = []
    excluded = 0
    for source in snapshot.sources:
        if (
            source.workspace_id == job.workspace_id
            and source.status == "approved"
            and source.deleted_at is None
            and (source.source_id, source.version) in approved
        ):
            eligible.append(source)
        else:
            excluded += 1
    return eligible, excluded


@dataclass(frozen=True)
class ScoredChunk:
    source: SnapshotSource
    chunk: SnapshotChunk
    score: float


def terms(text: str) -> set[str]:
    return {word for word in _WORD.findall(text.lower()) if word not in _STOPWORDS}


def lexical_overlap(question_terms: set[str], text: str) -> float:
    if not question_terms:
        return 0.0
    return len(question_terms & terms(text)) / len(question_terms)


def cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    norm = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    return dot / norm if norm else 0.0


def rank_chunks(
    question: str,
    query_vector: list[float],
    candidates: list[tuple[SnapshotSource, SnapshotChunk, list[float]]],
) -> list[ScoredChunk]:
    question_terms = terms(question)
    scored = [
        ScoredChunk(source, chunk, cosine(query_vector, vector) + 0.25 * lexical_overlap(question_terms, chunk.text))
        for source, chunk, vector in candidates
    ]
    return sorted(scored, key=lambda item: item.score, reverse=True)


def select_within_budget(ranked: list[ScoredChunk], *, token_budget: int, max_chunks: int) -> tuple[list[ScoredChunk], int]:
    """Greedy top-k by score; a chunk that does not fit is skipped, never truncated."""

    selected: list[ScoredChunk] = []
    used = 0
    for item in ranked:
        if len(selected) >= max_chunks:
            break
        cost = estimate_tokens(item.chunk.text) + 30
        if used + cost > token_budget:
            continue
        selected.append(item)
        used += cost
    return selected, used
