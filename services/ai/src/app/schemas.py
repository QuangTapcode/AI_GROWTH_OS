"""Versioned HTTP schemas shared with the TypeScript worker."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


SCHEMA_VERSION = "1.0.0"
PROMPT_VERSION = "w1-bootstrap-1"


class ApprovedSourceVersion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: UUID
    version: int = Field(ge=1)


class JobConstraints(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: str = "en"
    max_cost_usd: float = Field(default=0, ge=0)
    timeout_seconds: int = Field(default=120, gt=0)
    max_output_tokens: int = Field(default=1024, gt=0, le=1024)
    # Optional tighter cap than AI_MAX_PROVIDER_CALLS; never raises the service cap.
    max_provider_calls: int | None = Field(default=None, ge=1)
    human_approval_required: bool = True


class JobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = SCHEMA_VERSION
    job_id: UUID
    workspace_id: UUID
    operation: str = Field(min_length=1, max_length=80)
    input_version: int = Field(ge=1)
    context_snapshot_id: UUID | None = None
    approved_source_versions: list[ApprovedSourceVersion] = Field(default_factory=list, max_length=100)
    constraints: JobConstraints = Field(default_factory=JobConstraints)
    # Optional pins: the worker may require the exact prompt/model it validated against.
    prompt_version: str | None = Field(default=None, max_length=80)
    model_version: str | None = Field(default=None, max_length=120)
    trace_id: str = Field(min_length=1, max_length=120)
    synthetic: bool = False
    payload: dict[str, Any] = Field(default_factory=dict)


class EvidenceRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: UUID | None = None
    source_version: int | None = Field(default=None, ge=1)
    chunk_id: str | None = Field(default=None, max_length=120)
    locator: str | None = Field(default=None, max_length=300)
    quote: str | None = Field(default=None, max_length=500)
    # Copied from the source provenance so the UI can show the required attribution.
    source_url: str | None = Field(default=None, max_length=2000)
    license: str | None = Field(default=None, max_length=120)
    attribution: str | None = Field(default=None, max_length=500)


class Usage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    latency_ms: int = Field(default=0, ge=0)
    provider_cost_usd: float = Field(default=0, ge=0)
    llm_calls: int = Field(default=0, ge=0)
    embedding_calls: int = Field(default=0, ge=0)
    embedding_input_tokens: int = Field(default=0, ge=0)

    def add(self, other: "Usage") -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.total_tokens += other.total_tokens
        self.latency_ms += other.latency_ms
        self.provider_cost_usd += other.provider_cost_usd
        self.llm_calls += other.llm_calls
        self.embedding_calls += other.embedding_calls
        self.embedding_input_tokens += other.embedding_input_tokens


class ProviderOutput(BaseModel):
    """The only shape accepted from fake or live providers for generic operations."""

    model_config = ConfigDict(extra="forbid")

    result: dict[str, Any]
    evidence: list[EvidenceRef] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list, max_length=20)


class AIResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = SCHEMA_VERSION
    run_id: UUID
    operation: str
    result: dict[str, Any]
    evidence: list[EvidenceRef] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    usage: Usage
    model_version: str
    prompt_version: str = PROMPT_VERSION
    input_version: int
    trace_id: str


RunState = Literal["queued", "running", "completed", "failed"]


class RunStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = SCHEMA_VERSION
    run_id: UUID
    job_id: UUID
    workspace_id: UUID
    operation: str
    input_version: int
    status: RunState
    attempt: int = 1
    provider_calls: int = 0
    max_provider_calls: int
    # True only for failures the worker may resend with the same idempotency key.
    retryable: bool = False
    result: AIResult | None = None
    error_code: str | None = None
    error_message: str | None = None
    deadline_at: datetime
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    provider_mode: Literal["fake", "live"]
    model: str
    embedding_model: str
    schema_version: str = SCHEMA_VERSION


# --- Operation payloads -----------------------------------------------------------------


class SourceProvenance(BaseModel):
    """Reuse rights and origin of a source; BE stores it with the source version."""

    model_config = ConfigDict(extra="forbid")

    license: str = Field(min_length=1, max_length=120)
    attribution: str = Field(min_length=1, max_length=500)
    source_url: str | None = Field(default=None, max_length=2000)
    upstream_version: str | None = Field(default=None, max_length=80)
    retrieved_at: datetime | None = None


class IngestSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: UUID
    version: int = Field(ge=1)
    workspace_id: UUID
    kind: Literal["text", "pdf", "url"]
    title: str | None = Field(default=None, max_length=300)
    label: str | None = Field(default=None, max_length=80)
    text: str | None = None
    content_base64: str | None = None
    url: str | None = Field(default=None, max_length=2000)
    # Optional page body already fetched by the worker; the URL must still be allowlisted.
    html: str | None = None
    provenance: SourceProvenance | None = None


class IngestPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: IngestSource


SourceStatus = Literal["imported", "processing", "needs_review", "approved", "rejected", "revoked", "deleted"]


class SourceFact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=80)
    value: str | int | float | None = None
    unit: str | None = Field(default=None, max_length=40)
    verification: Literal["verified", "missing", "unverified"] | None = None
    locator: str | None = Field(default=None, max_length=300)
    # Prices and availability go stale; an expired fact is treated as unverified.
    valid_until: datetime | None = None


class SnapshotChunk(BaseModel):
    model_config = ConfigDict(extra="forbid")

    chunk_id: str = Field(min_length=1, max_length=120)
    text: str = Field(min_length=1, max_length=8000)
    locator: str | None = Field(default=None, max_length=300)
    page: int | None = Field(default=None, ge=1)
    url: str | None = Field(default=None, max_length=2000)
    embedding: list[float] | None = None


class SnapshotSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: UUID
    version: int = Field(ge=1)
    workspace_id: UUID
    status: SourceStatus
    deleted_at: datetime | None = None
    title: str | None = Field(default=None, max_length=300)
    category: str | None = Field(default=None, max_length=80)
    label: str | None = Field(default=None, max_length=80)
    provenance: SourceProvenance | None = None
    facts: list[SourceFact] = Field(default_factory=list, max_length=200)
    chunks: list[SnapshotChunk] = Field(default_factory=list, max_length=500)


class KnowledgeSnapshot(BaseModel):
    """Tenant-scoped retrieval input issued by BE for one workspace."""

    model_config = ConfigDict(extra="forbid")

    snapshot_id: UUID | None = None
    workspace_id: UUID
    sources: list[SnapshotSource] = Field(default_factory=list, max_length=100)


class AnswerPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=1000)
    snapshot: KnowledgeSnapshot


class BusinessProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    company: str = Field(min_length=1, max_length=200)
    industry: str | None = Field(default=None, max_length=200)
    locations: list[str] = Field(default_factory=list, max_length=20)
    audiences: list[str] = Field(default_factory=list, max_length=20)
    language: str = "en"
    products: list[str] = Field(default_factory=list, max_length=50)
    services: list[str] = Field(default_factory=list, max_length=50)
    voice: str | None = Field(default=None, max_length=500)
    competitors: list[str] = Field(default_factory=list, max_length=20)
    topic_priority: list[str] = Field(default_factory=list, max_length=20)


class ApprovedFact(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1, max_length=80)
    value: str | int | float | None = None
    unit: str | None = Field(default=None, max_length=40)
    source_id: UUID
    source_version: int = Field(ge=1)
    locator: str | None = Field(default=None, max_length=300)


class GoalContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    objective: str | None = Field(default=None, max_length=200)
    primary_metric: str | None = Field(default=None, max_length=80)
    baseline: float | None = Field(default=None, ge=0)
    period_days: int | None = Field(default=None, ge=1, le=366)


class GrowthMapPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    workspace_id: UUID
    business_profile: BusinessProfile
    approved_facts: list[ApprovedFact] = Field(default_factory=list, max_length=200)
    goal_context: GoalContext | None = None
