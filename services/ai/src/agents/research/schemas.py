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


class TrendSignal(BaseModel):
    """One web search result observed by the backend discovery step (metadata only, no page text)."""
    model_config = ConfigDict(extra="forbid")
    signal_id: UUID
    query: str = Field(min_length=1, max_length=200)
    rank: int = Field(ge=1, le=50)
    title: str = Field(min_length=1, max_length=300)
    url: HttpUrl
    domain: str = Field(min_length=1, max_length=255)
    observed_at: datetime
    # Rank of the same URL for the same query in the previous discovery run (None: not ranked then).
    previous_rank: int | None = Field(default=None, ge=1, le=50)
    is_new: bool = False


class ResearchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: UUID
    business_profile: BusinessProfile
    goal_context: GoalContext | None = None
    snapshot: KnowledgeSnapshot
    content_inventory: list[ContentInventoryItem] = Field(default_factory=list, max_length=100)
    # Search landscape: what currently ranks for the profile's queries. It guides topic
    # choice only; every finding must still quote an approved snapshot excerpt.
    trend_signals: list[TrendSignal] = Field(default_factory=list, max_length=30)


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
    # Year the cited excerpt says it was last updated, e.g. "(updated Jan 2018)"; None if unstated.
    evidence_updated: int | None = None
    # Search results whose titles share the finding's terms; matched by code, not the model.
    trend_signals: list[TrendSignal] = Field(default_factory=list, max_length=5)


class TrendCoverage(BaseModel):
    """Approved excerpts mentioning every word of a searched topic. 0 is a certain source gap;
    a positive count is a lexical mention, not a judgement that the topic is well covered."""
    model_config = ConfigDict(extra="forbid")
    query: str
    topic: str
    signal_count: int = Field(ge=0)
    covered_chunks: int = Field(ge=0)


class ResearchBrief(BaseModel):
    model_config = ConfigDict(extra="forbid")
    brief_id: UUID
    workspace_id: UUID
    profile_version: int | None
    context_snapshot_id: UUID | None
    status: Literal["ready_for_handoff", "insufficient_data"]
    findings: list[ResearchFinding]
    missing_facts: list[str]
    # Topics from the search landscape with no approved source text become source_gap:<topic> facts.
    trend_coverage: list[TrendCoverage] = Field(default_factory=list)
    handoff_role: Literal["growth_lead"] = "growth_lead"
    handoff_operation: Literal["opportunity.score"] = "opportunity.score"
    requires_human_approval: Literal[True] = True
    applied: Literal[False] = False
    synthetic: bool
