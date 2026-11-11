"""QQ-04: proposals only; backend owns validation, persistence and dispatch."""
from typing import Literal
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from ...app.schemas import BusinessProfile, GoalContext, GoalKpi, KnowledgeSnapshot, RunArtifact
from ..contracts import ArtifactInput
from ..research.schemas import ResearchBrief, ResearchFinding


class CommunityContextInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    group_name: str | None = Field(default=None, max_length=200)
    current_members: int = Field(ge=0, le=10000000)
    week1_baseline_members: int | None = Field(default=None, ge=0, le=10000000)
    page_followers: int | None = Field(default=None, ge=0, le=10000000)
    identified_prospects: int = Field(default=0, ge=0, le=1000000)
    invites_sent_7d: int = Field(default=0, ge=0, le=100000)
    comments_replied_7d: int = Field(default=0, ge=0, le=100000)
    pending_questions: int = Field(default=0, ge=0, le=100000)
    current_campaign_week: int = Field(default=1, ge=1, le=52)
    daily_invite_cap: int = Field(default=12, ge=1, le=20)
    auto_reply_comments: bool = True
    auto_invite_enabled: bool = True


class WeeklyCommunityTarget(BaseModel):
    model_config = ConfigDict(extra="forbid")
    week: int = Field(ge=1, le=4)
    label: str = Field(min_length=1, max_length=120)
    member_target: int = Field(ge=1, le=10000000)
    weekly_new_target: int = Field(ge=0, le=1000000)
    focus: str = Field(min_length=1, max_length=300)
    channel_tactic: str = Field(min_length=1, max_length=300)


class CommunityGrowthPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: Literal["growth_lead_agent"] = "growth_lead_agent"
    auto_apply: Literal[True] = True
    current_members: int = Field(ge=0)
    pacing_status: Literal["ahead", "on_track", "behind", "baseline"]
    recommended_daily_invite_limit: int = Field(ge=10, le=15)
    recommended_auto_reply_comments: bool = True
    recommended_auto_invite_enabled: bool = True
    week1_target: int = Field(ge=1)
    week2_target: int = Field(ge=1)
    week3_target: int = Field(ge=1)
    week4_target: int = Field(ge=1)
    weekly_targets: list[WeeklyCommunityTarget] = Field(min_length=4, max_length=4)
    rationale: str = Field(min_length=1, max_length=1000)
    focus_channels: list[str] = Field(min_length=1, max_length=6)


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
    # Latest measured snapshot: what it shows decides whether this plan goes for reach or for conversion.
    latest_metrics: ArtifactInput | None = None
    score_factors: dict[Literal["demand", "business_relevance", "growth_potential", "content_gap", "freshness", "conversion_potential"], float | None] = Field(default_factory=dict)
    community_context: CommunityContextInput | None = None


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
    strategy_alignment: dict | None = None


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
    kpis: list[GoalKpi] = Field(default_factory=list, max_length=5)
    # How the goal stands in the latest measurement and what this plan therefore goes for; null when nothing is measured.
    kpi_progress: list[dict] = Field(default_factory=list, max_length=5)
    priority: dict | None = None
    strategy_alignment: dict | None = None
    community_growth_plan: CommunityGrowthPlan | None = None
