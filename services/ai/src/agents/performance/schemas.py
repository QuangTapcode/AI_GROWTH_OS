from datetime import date, datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator
from ..contracts import ArtifactInput, DraftResult, MarketingContext
from ...app.schemas import KpiMeasurement


class ContentMetric(BaseModel):
    """One article in the window: counts only, never a session or a person."""
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=300)
    page_views: int = Field(ge=0)
    cta_clicks: int = Field(ge=0)
    qualified_visits: int | None = Field(default=None, ge=0)
    leads: int | None = Field(default=None, ge=0)


class SocialPostEvidence(BaseModel):
    """Counters as observed, not reach or conversions during the report window."""
    model_config = ConfigDict(extra="forbid")
    workspace_id: UUID
    publishing_job_id: UUID
    content_id: UUID
    artifact_id: UUID
    artifact_version: int = Field(ge=1)
    campaign_id: UUID | None = None
    external_post_id: str = Field(pattern=r"^\d+(?:_\d+)?$")
    published_at: datetime
    captured_at: datetime
    provider: Literal["facebook_page", "facebook_group"] = "facebook_page"
    group_id: str | None = Field(default=None, pattern=r"^\d{5,30}$")
    external_content_modified: bool = False
    observed_text_hash: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    scope: Literal["post_lifetime"] = "post_lifetime"
    counters: dict[Literal["reactions", "comments", "shares"], int | None]
    missing_reasons: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def valid_observation(self):
        if self.provider == "facebook_group":
            if not self.group_id or "_" in self.external_post_id:
                raise ValueError("Group evidence requires a group and numeric post ID")
        elif "_" not in self.external_post_id or self.group_id is not None:
            raise ValueError("Page evidence requires a Page post ID")
        if (self.published_at.tzinfo is None or self.captured_at.tzinfo is None
                or self.captured_at < self.published_at):
            raise ValueError("Social counters require ordered timezone-aware timestamps")
        if any(value is not None and value < 0 for value in self.counters.values()):
            raise ValueError("Counters must be nonnegative")
        return self


class GroupMetricsEvidence(BaseModel):
    """Native group period, never silently aligned with website or ads windows."""
    model_config = ConfigDict(extra="forbid")
    workspace_id: UUID
    group_id: str = Field(pattern=r"^\d{5,30}$")
    source: Literal["facebook_group_browser"]
    captured_at: datetime
    period_from: date
    period_to: date
    timezone: Literal["provider_unspecified"]
    source_url: str
    total_members: int | None = Field(default=None, ge=0)
    metrics: dict[Literal["posts", "comments", "reactions", "new_members"], int | None]
    missing_reasons: dict[str, str] = Field(default_factory=dict)

    @model_validator(mode="after")
    def valid_group(self):
        if (self.captured_at.tzinfo is None or self.period_from > self.period_to
                or self.period_to > self.captured_at.date()
                or self.source_url != f"https://www.facebook.com/groups/{self.group_id}/insights/?section=engagement"):
            raise ValueError("Invalid group source or native period")
        if any(v is not None and (isinstance(v, bool) or v < 0) for v in self.metrics.values()):
            raise ValueError("Invalid group counters")
        return self


class MetricsData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: UUID
    snapshot_id: UUID
    version: int = Field(ge=1)
    window_start: datetime
    window_end: datetime
    qualified_visits: int | None = Field(default=None, ge=0)
    converted_visits: int | None = Field(default=None, ge=0)
    leads: int | None = Field(default=None, ge=0)
    impressions: int | None = Field(default=None, ge=0)
    clicks: int | None = Field(default=None, ge=0)
    sessions: int | None = Field(default=None, ge=0)
    pageviews: int | None = Field(default=None, ge=0)
    ad_spend: int | float | None = Field(default=None, ge=0)
    ad_clicks: int | None = Field(default=None, ge=0)
    ad_impressions: int | None = Field(default=None, ge=0)
    spend_window_leads: int | None = Field(default=None, ge=0)
    captured_at: datetime | None = None
    timezone: str | None = Field(default=None, max_length=100)
    metric_definitions: dict[str, KpiMeasurement] = Field(default_factory=dict, max_length=20)
    synthetic: bool = False
    # Metrics whose source is not connected, with the reason (e.g. no Search Console). Only a
    # declared, null metric is excused; an undeclared null still counts as missing data.
    unavailable: dict[str, str] = Field(default_factory=dict, max_length=20)
    coverage: dict[str, dict] = Field(default_factory=dict, max_length=20)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    source: str | None = Field(default=None, max_length=50)
    content_metrics: list[ContentMetric] = Field(default_factory=list, max_length=20)
    community_metrics: dict[str, int | float | str | bool | None] | None = None
    channel_metrics: dict[str, dict[str, int]] = Field(default_factory=dict, max_length=10)
    social_posts: list[SocialPostEvidence] = Field(default_factory=list, max_length=20)
    group_metrics: list[GroupMetricsEvidence] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def valid_window(self):
        if self.window_start.tzinfo is None or self.window_end.tzinfo is None or self.window_end <= self.window_start:
            raise ValueError("Metrics require an ordered timezone-aware window")
        if self.converted_visits is not None and self.qualified_visits is not None and self.converted_visits > self.qualified_visits:
            raise ValueError('Converted qualified sessions cannot exceed qualified sessions')
        for group in self.group_metrics:
            if group.workspace_id != self.workspace_id or not self.captured_at or group.captured_at > self.captured_at:
                raise ValueError("Group must belong to the workspace and precede its snapshot")
        for post in self.social_posts:
            if post.workspace_id != self.workspace_id:
                raise ValueError('Social post belongs to another workspace')
            if not self.window_start <= post.published_at < self.window_end:
                raise ValueError('Social post was not published in the selected window')
            if not self.captured_at or post.captured_at > self.captured_at:
                raise ValueError('Social observation is newer than its containing snapshot')
        return self


class ExperimentPeriod(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: datetime
    end: datetime

    @model_validator(mode="after")
    def valid_period(self):
        if self.start.tzinfo is None or self.end.tzinfo is None or self.end <= self.start:
            raise ValueError("Experiment requires an ordered timezone-aware period")
        return self


class ExperimentSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")
    hypothesis: str = Field(min_length=1, max_length=500)
    control_variant: str = Field(min_length=1, max_length=200)
    treatment_variant: str = Field(min_length=1, max_length=200)
    primary_metric: str = Field(min_length=1, max_length=100)
    period: ExperimentPeriod
    grouping: str = Field(min_length=1, max_length=100)


class PerformancePayload(MarketingContext):
    metrics: ArtifactInput | None = None
    baseline_metrics: ArtifactInput | None = None
    experiment: ExperimentSpec | None = None


class PerformanceReport(DraftResult):
    metrics: dict[str, int | float | None]
    window: dict[str, str] | None
    metric_snapshot_id: UUID | None
    observations: list[str]
    proposal: str | None
    experiment: ExperimentSpec | None = None
    attribution: str = "aggregate_observation_only_not_causal"
    spend_mutation_allowed: Literal[False] = False
    baseline_snapshot_id: UUID | None = None
    baseline_window: dict[str, str] | None = None
    kpi_comparisons: list[dict] = Field(default_factory=list)
    content_metrics: list[ContentMetric] = Field(default_factory=list)
    coverage: dict[str, dict] = Field(default_factory=dict)
    currency: str | None = None
    actions: list[dict] = Field(default_factory=list)
    channel_metrics: dict[str, dict[str, int]] = Field(default_factory=dict)
    social_posts: list[SocialPostEvidence] = Field(default_factory=list, max_length=20)
    group_metrics: list[GroupMetricsEvidence] = Field(default_factory=list, max_length=10)
