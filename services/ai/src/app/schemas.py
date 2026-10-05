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
    trace_id: str = Field(min_length=1, max_length=120)
    synthetic: bool = False
    payload: dict[str, Any] = Field(default_factory=dict)


class EvidenceRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_id: UUID | None = None
    source_version: int | None = Field(default=None, ge=1)
    locator: str | None = Field(default=None, max_length=300)
    quote: str | None = Field(default=None, max_length=500)


class Usage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    latency_ms: int = Field(default=0, ge=0)
    provider_cost_usd: float = Field(default=0, ge=0)


class ProviderOutput(BaseModel):
    """The only shape accepted from fake or live providers."""

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

    run_id: UUID
    job_id: UUID
    workspace_id: UUID
    operation: str
    status: RunState
    result: AIResult | None = None
    error_code: str | None = None
    error_message: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    provider_mode: Literal["fake", "live"]
    model: str
    schema_version: str = SCHEMA_VERSION
