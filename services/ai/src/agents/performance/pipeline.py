from datetime import datetime, timezone
from pydantic import ValidationError
from ...app.runtime import OperationOutcome
from ..contracts import artifact_problems, result_fields, validate_context
from .schemas import ExperimentSpec, MetricsData, PerformanceReport

PROMPT_VERSION = "performance-v1"
METRICS = ("qualified_visits", "leads", "impressions", "clicks")


def validate_performance(job, p, settings):
    problems = validate_context(job, p)
    if job.operation == "experiment.hypothesis" and p.experiment is None:
        problems.append(("EXPERIMENT_REQUIRED", "Experiment hypothesis, variants, metric, period and grouping are required"))
    if p.experiment and p.experiment.period.end > datetime.now(timezone.utc):
        problems.append(("FUTURE_EXPERIMENT_PERIOD", "Experiment period is in the future"))
    if p.metrics:
        problems += artifact_problems(job, p.metrics)
        try:
            data = MetricsData.model_validate(p.metrics.result)
            if data.window_end > datetime.now(timezone.utc):
                problems.append(("FUTURE_METRICS", "Metrics window is in the future"))
        except ValidationError:
            problems.append(("INVALID_METRICS", "Metrics data/window is invalid"))
    return problems


async def run_performance(ctx):
    p = ctx.payload
    experiment: ExperimentSpec | None = p.experiment
    data = MetricsData.model_validate(p.metrics.result) if p.metrics else None
    values = {key: getattr(data, key) if data else None for key in METRICS}
    missing = [key for key, value in values.items() if value is None]
    observations = [f"Observed {key}: {value}." for key, value in values.items() if value is not None]
    fields = result_fields(ctx, [p.metrics] if p.metrics else [])
    proposal = None
    if not missing:
        proposal = "Review the cited aggregate window before proposing the next content test."
        if ctx.job.operation == "experiment.hypothesis" and experiment:
            proposal = (f"Test the hypothesis '{experiment.hypothesis}' with "
                        f"'{experiment.control_variant}' versus '{experiment.treatment_variant}', "
                        f"using {experiment.primary_metric} as the primary metric, "
                        f"grouped by {experiment.grouping}. Do not declare causal impact from this draft alone.")
    result = PerformanceReport(**fields, status="insufficient_data" if missing else "draft",
        missing_facts=missing, metrics=values, metric_snapshot_id=data.snapshot_id if data else None,
        window={"start": data.window_start.isoformat(), "end": data.window_end.isoformat()} if data else None,
        observations=observations, proposal=proposal, experiment=experiment)
    return OperationOutcome(result=result.model_dump(mode="json"), warnings=["NO_CAUSAL_OR_ROI_CLAIM"])
