from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator
from ..contracts import ArtifactInput, DraftResult, MarketingContext


class MetricsData(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workspace_id: UUID
    snapshot_id: UUID
    version: int = Field(ge=1)
    window_start: datetime
    window_end: datetime
    qualified_visits: int | None = Field(default=None, ge=0)
    leads: int | None = Field(default=None, ge=0)
    impressions: int | None = Field(default=None, ge=0)
    clicks: int | None = Field(default=None, ge=0)
    synthetic: bool = False

    @model_validator(mode="after")
    def valid_window(self):
        if self.window_start.tzinfo is None or self.window_end.tzinfo is None or self.window_end <= self.window_start:
            raise ValueError("Metrics require an ordered timezone-aware window")
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
    experiment: ExperimentSpec | None = None


class PerformanceReport(DraftResult):
    metrics: dict[str, int | None]
    window: dict[str, str] | None
    metric_snapshot_id: UUID | None
    observations: list[str]
    proposal: str | None
    experiment: ExperimentSpec | None = None
    attribution: str = "aggregate_observation_only_not_causal"
    spend_mutation_allowed: bool = False
