"""QQ-04: proposals only; backend owns validation, persistence and dispatch."""
from typing import Literal
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ...app.schemas import BusinessProfile, GoalContext, KnowledgeSnapshot, RunArtifact
from ..research.schemas import ResearchBrief, ResearchFinding


class GrowthLeadPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: UUID
    business_profile: BusinessProfile
    goal_context: GoalContext | None = None
    snapshot: KnowledgeSnapshot
    research: ResearchBrief
    research_artifact: RunArtifact
    cta: str | None = Field(default=None, min_length=1, max_length=200)
    deadline: datetime | None = None
    score_factors: dict[Literal["demand", "business_relevance", "growth_potential", "content_gap", "freshness", "conversion_potential"], float | None] = Field(default_factory=dict)


class OpportunitySelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    finding_index: int = Field(ge=0, le=2)


class TaskBrief(BaseModel):
    model_config = ConfigDict(extra="forbid")
    topic: str
    audience: list[str]
    offer: list[str]
    audience_fit: str
    offer_fit: str
    intent: Literal["informational"] = "informational"
    deliverable: Literal["seo_article_draft", "social_pack_draft"]
    cta: str | None
    acceptance: list[str]


class CampaignTask(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_id: UUID
    role: Literal["seo", "content"]
    operation: Literal["seo.local_draft", "content.repurpose"]
    tools: list[Literal["knowledge.read", "content.draft"]]
    depends_on: list[UUID]
    input_artifact_refs: list[RunArtifact]
    dependency_artifact_from: list[UUID]
    brief: TaskBrief
    requires_human_approval: Literal[True] = True
    deadline: datetime | None = None


class CampaignPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contract_version: Literal["growth-lead-plan-v2"] = "growth-lead-plan-v2"
    plan_id: UUID
    workspace_id: UUID
    input_version: int = Field(ge=1)
    profile_version: int | None
    context_snapshot_id: UUID
    status: Literal["proposed", "blocked"]
    objective: str
    selection_method: Literal["model_selection_from_grounded_research", "derived_score_ranking"] = "model_selection_from_grounded_research"
    # Every research finding with its derived score, best first (empty when the model selected).
    ranked_opportunities: list[dict] = Field(default_factory=list, max_length=3)
    selected_opportunity: ResearchFinding | None
    research_artifact: RunArtifact
    tasks: list[CampaignTask]
    missing_facts: list[str]
    requires_human_approval: Literal[True] = True
    applied: Literal[False] = False
    synthetic: bool
    opportunity_score: dict = Field(default_factory=dict)
