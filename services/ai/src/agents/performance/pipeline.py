from datetime import datetime, timezone
from pydantic import ValidationError
from ...app.runtime import OperationOutcome
from ..contracts import artifact_problems, result_fields, validate_context
from .schemas import ExperimentSpec, MetricsData, PerformanceReport
from .baseline import compare_kpis, metric_value

PROMPT_VERSION = "performance-v2"
METRICS = ("qualified_visits", "leads", "impressions", "clicks")


def validate_performance(job, p, settings):
    problems = validate_context(job, p)
    if job.operation == "experiment.hypothesis" and p.experiment is None:
        problems.append(("EXPERIMENT_REQUIRED", "Experiment hypothesis, variants, metric, period and grouping are required"))
    if p.experiment and p.experiment.period.end > datetime.now(timezone.utc):
        problems.append(("FUTURE_EXPERIMENT_PERIOD", "Experiment period is in the future"))
    for item in (p.metrics, p.baseline_metrics):
        if not item:
            continue
        problems += artifact_problems(job, item)
        try:
            data = MetricsData.model_validate(item.result)
            if data.window_end > datetime.now(timezone.utc):
                problems.append(("FUTURE_METRICS", "Metrics window is in the future"))
            if data.captured_at and (data.captured_at.tzinfo is None or
                    not data.window_end <= data.captured_at <= datetime.now(timezone.utc)):
                problems.append(("INVALID_METRIC_TIMESTAMP", "Snapshot capture time must follow its window and not be in the future"))
        except ValidationError:
            problems.append(("INVALID_METRICS", "Metrics data/window is invalid"))
    return problems


async def run_performance(ctx):
    p = ctx.payload
    experiment: ExperimentSpec | None = p.experiment
    data = MetricsData.model_validate(p.metrics.result) if p.metrics else None
    baseline = MetricsData.model_validate(p.baseline_metrics.result) if p.baseline_metrics else None
    kpis = p.goal_context.kpis if p.goal_context else []
    keys = list(dict.fromkeys([*METRICS, *(k.metric_name for k in kpis)]))
    required = {k.metric_name for k in kpis} if kpis else set(keys)
    values = {key: metric_value(data, key) for key in keys}
    excused = {key: reason for key, reason in (data.unavailable.items() if data else []) if values.get(key) is None}
    missing = [key for key, value in values.items() if key in required and value is None and key not in excused]
    observations = [f"Observed {key}: {value}." for key, value in values.items() if value is not None]
    observations += [f"{key} not measured: {reason}." for key, reason in excused.items()]
    comparisons = compare_kpis(data, baseline, kpis, keys) if baseline or kpis else []
    missing += [f"kpi:{c['metric_name']}:{c['status']}" for c in comparisons
                if c['metric_name'] in required and c['status'] not in {"compared", "zero_baseline"}]
    observations += [f"{c['metric_name']}: measured change {c['absolute_change']}; "
                     + ("relative change unavailable for a zero baseline. " if c['status'] == 'zero_baseline'
                        else f"relative change {c['relative_change_pct']}%. ") + "Observation only, not causal."
                     for c in comparisons if c['status'] in {"compared", "zero_baseline"}]
    fields = result_fields(ctx, [item for item in (p.metrics, p.baseline_metrics) if item])
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
        observations=observations, proposal=proposal, experiment=experiment,
        baseline_snapshot_id=baseline.snapshot_id if baseline else None,
        baseline_window={"start": baseline.window_start.isoformat(), "end": baseline.window_end.isoformat()} if baseline else None,
        kpi_comparisons=comparisons)
    return OperationOutcome(result=result.model_dump(mode="json"), warnings=["NO_CAUSAL_OR_ROI_CLAIM"])
