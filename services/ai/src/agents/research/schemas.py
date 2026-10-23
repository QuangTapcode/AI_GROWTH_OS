"""Bounded research contract. Source text is supplied by the scoped worker."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from ...app.schemas import BusinessProfile, EvidenceRef, GoalContext, KnowledgeSnapshot


class ContentInventoryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content_id: UUID
    workspace_id: UUID
    version: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=200)


class ResearchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: UUID
    business_profile: BusinessProfile
    goal_context: GoalContext | None = None
    snapshot: KnowledgeSnapshot
    content_inventory: list[ContentInventoryItem] = Field(default_factory=list, max_length=100)


class ResearchIdea(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topic: str = Field(min_length=1, max_length=180)
    audience_fit: str = Field(min_length=1, max_length=240)
    offer_fit: str = Field(min_length=1, max_length=240)
    rationale: str = Field(min_length=1, max_length=300)
    chunk_id: str = Field(min_length=1, max_length=120)
    quote: str = Field(min_length=1, max_length=400)
    keywords: list[str] = Field(min_length=1, max_length=5)
    user_need: str = Field(min_length=1, max_length=160)


class ResearchDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ideas: list[ResearchIdea] = Field(max_length=2)


class ResearchFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topic: str
    audience_fit: str
    offer_fit: str
    rationale: str
    evidence: EvidenceRef
    url: HttpUrl
    fetched_at: datetime
    confidence: Literal["hypothesis"] = "hypothesis"
    demand_estimate: None = None
    # Defaults keep persisted v1 artifacts readable; new runs always populate these.
    keywords: list[str] = Field(default_factory=list, max_length=5)
    user_need: str | None = None


class ResearchBrief(BaseModel):
    model_config = ConfigDict(extra="forbid")
    brief_id: UUID
    workspace_id: UUID
    profile_version: int | None
    context_snapshot_id: UUID | None
    status: Literal["ready_for_handoff", "insufficient_data"]
    findings: list[ResearchFinding]
    missing_facts: list[str]
    handoff_role: Literal["growth_lead"] = "growth_lead"
    handoff_operation: Literal["opportunity.score"] = "opportunity.score"
    requires_human_approval: Literal[True] = True
    applied: Literal[False] = False
    synthetic: bool
