"""Shared scoped inputs/guards for dedicated marketing pipelines."""
import hashlib
import json
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID, NAMESPACE_URL, uuid5

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from ..app.schemas import BusinessProfile, EvidenceRef, GoalContext, JobRequest, KnowledgeSnapshot, RunArtifact
from ..app.runtime import OperationError, RunContext
from ..guardrails.facts import has_price_claim, unsupported_numbers
from ..rag.chunking import estimate_tokens
from ..rag.retrieval import eligible_sources
from .context import context_problems


class ArtifactInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    artifact: RunArtifact
    result: dict
    evidence: list[EvidenceRef] = Field(default_factory=list, max_length=50)


class MarketingContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: UUID
    business_profile: BusinessProfile
    goal_context: GoalContext | None = None
    snapshot: KnowledgeSnapshot


class DraftResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: UUID
    context_snapshot_id: UUID
    profile_version: int
    version: int
    status: Literal["draft", "needs_assets", "insufficient_data"]
    missing_facts: list[str] = Field(default_factory=list)
    input_artifact_refs: list[RunArtifact] = Field(default_factory=list)
    requires_human_approval: Literal[True] = True
    applied: Literal[False] = False
    synthetic: bool


class ImageAsset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_id: UUID
    workspace_id: UUID
    version: int = Field(ge=1)
    url: HttpUrl
    content_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    license: str = Field(min_length=1, max_length=200)
    attribution: str = Field(min_length=1, max_length=200)
    status: Literal["approved", "pending", "revoked"]
    synthetic: bool = False


def validate_context(job: JobRequest, payload: MarketingContext) -> list[tuple[str, str]]:
    problems = context_problems(job, payload.business_profile, payload.goal_context, payload.snapshot)
    if payload.workspace_id != job.workspace_id:
        problems.append(("TENANT_SCOPE_VIOLATION", "Payload workspace differs"))
    if not job.context_snapshot_id or payload.snapshot.snapshot_id != job.context_snapshot_id:
        problems.append(("SNAPSHOT_REQUIRED", "Pin the current knowledge snapshot"))
    if payload.business_profile.version is None:
        problems.append(("PROFILE_VERSION_REQUIRED", "Pin the business profile version"))
    if not job.constraints.human_approval_required:
        problems.append(("APPROVAL_REQUIRED", "External drafts require human approval"))
    return problems


def artifact_problems(job: JobRequest, item: ArtifactInput, role: str | None = None) -> list[tuple[str, str]]:
    problems = []
    ref = item.artifact
    if ref.workspace_id != job.workspace_id or item.result.get("workspace_id") != str(job.workspace_id):
        problems.append(("TENANT_SCOPE_VIOLATION", "Foreign upstream artifact"))
    if ref.context_snapshot_id != job.context_snapshot_id:
        problems.append(("STALE_ARTIFACT_CONTEXT", "Upstream snapshot differs"))
    if role and ref.role != role:
        problems.append(("INVALID_ARTIFACT_ROLE", f"Expected upstream {role}"))
    digest = hashlib.sha256(json.dumps({"result": item.result,
        "evidence": [x.model_dump(mode="json") for x in item.evidence]}, sort_keys=True,
        ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()
    if digest != ref.content_hash:
        problems.append(("ARTIFACT_HASH_MISMATCH", "Upstream content hash differs"))
    if item.result.get("version", item.result.get("input_version", ref.version)) != ref.version:
        problems.append(("ARTIFACT_VERSION_MISMATCH", "Upstream result version differs"))
    return problems


def evidence_problems(job, snapshot, evidence):
    sources, _ = eligible_sources(job, snapshot)
    return [("UNGROUNDED_ARTIFACT", "Upstream evidence is no longer approved/current")
        for ref in evidence if not any(s.source_id == ref.source_id and s.version == ref.source_version
            and any(c.chunk_id == ref.chunk_id and ref.quote and ref.quote.strip() and ref.quote in c.text for c in s.chunks)
            for s in sources)]


def result_fields(ctx: RunContext, refs=()):
    p = ctx.payload
    return dict(workspace_id=ctx.job.workspace_id, context_snapshot_id=ctx.job.context_snapshot_id,
        profile_version=p.business_profile.version, version=ctx.job.input_version,
        input_artifact_refs=[x.artifact for x in refs],
        synthetic=ctx.job.synthetic or ctx.settings.provider_mode == "fake" or any(x.result.get("synthetic", False) for x in refs))


def stable_id(ctx, kind):
    return uuid5(NAMESPACE_URL, f"{ctx.job.workspace_id}:{ctx.job.job_id}:{ctx.job.input_version}:{kind}")


def ensure_grounded(text, grounding):
    # Until a dedicated sensitive-fact renderer is requested, omit prices entirely.
    if has_price_claim(text) or unsupported_numbers(text, grounding):
        raise OperationError("UNSUPPORTED_CONTENT_CLAIM", "Draft contains an unsupported numeric/price claim")


async def call_draft(ctx, system, data, model, fake):
    user = json.dumps(data, ensure_ascii=False)
    if estimate_tokens(system + user + json.dumps(model.model_json_schema())) > ctx.settings.max_input_tokens:
        raise OperationError("CONTEXT_BUDGET_EXCEEDED", "Marketing draft context exceeds budget")
    return await ctx.call_json(system=system, user=user, model=model, fake=fake)


def aware_past(value: datetime):
    return value.tzinfo is not None and value <= datetime.now(timezone.utc)
