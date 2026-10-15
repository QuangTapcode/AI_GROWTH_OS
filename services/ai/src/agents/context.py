"""Shared context checks for business-profile and approved-knowledge inputs."""
from __future__ import annotations

from datetime import datetime, timezone

from ..app.schemas import ApprovedFact, BusinessProfile, GoalContext, JobRequest, KnowledgeSnapshot
from ..rag.retrieval import eligible_sources, snapshot_scope_problems


def context_problems(job: JobRequest, profile: BusinessProfile, goal: GoalContext | None,
                     snapshot: KnowledgeSnapshot | None = None) -> list[tuple[str, str]]:
    problems = []
    for value in (profile, goal):
        if value is not None and value.workspace_id is not None and value.workspace_id != job.workspace_id:
            problems.append(("TENANT_SCOPE_VIOLATION", "Profile or goal belongs to another workspace"))
    if snapshot is not None:
        problems.extend(snapshot_scope_problems(job, snapshot))
        if job.context_snapshot_id and snapshot.snapshot_id != job.context_snapshot_id:
            problems.append(("SNAPSHOT_MISMATCH", "Snapshot ID must equal context_snapshot_id"))
    return problems


def facts_from_snapshot(job: JobRequest, snapshot: KnowledgeSnapshot) -> list[ApprovedFact]:
    sources, _ = eligible_sources(job, snapshot)
    now = datetime.now(timezone.utc)
    facts = []
    for source in sources:
        for fact in source.facts:
            expiry = fact.valid_until
            if expiry and (expiry if expiry.tzinfo else expiry.replace(tzinfo=timezone.utc)) <= now:
                continue
            if fact.verification != "verified" or fact.value is None or fact.value == "":
                continue
            facts.append(ApprovedFact(key=fact.key, value=fact.value, unit=fact.unit,
                                      source_id=source.source_id, source_version=source.version,
                                      workspace_id=job.workspace_id, verification="verified",
                                      locator=fact.locator))
    return facts
