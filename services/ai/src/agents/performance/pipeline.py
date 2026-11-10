from datetime import datetime, timezone
from pydantic import ValidationError
from ...app.runtime import OperationOutcome
from ..contracts import artifact_problems, result_fields, validate_context
from .schemas import ExperimentSpec, MetricsData, PerformanceReport
from .baseline import compare_kpis, metric_value

PROMPT_VERSION = "performance-v3"
METRICS = ("qualified_visits", "leads", "impressions", "clicks")


def validate_performance(job, p, settings):
    problems = validate_context(job, p)
    if job.operation == "experiment.hypothesis" and p.experiment is None:
        problems.append(("EXPERIMENT_REQUIRED", "Experiment hypothesis, variants, metric, period and grouping are required"))
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
    keys = list(dict.fromkeys([*METRICS, *(k.metric_name for k in kpis),
                              *(key for key in ("sessions", "pageviews", "ad_spend", "ad_clicks", "ad_impressions", "ad_ctr", "ctr", "cvr", "cpl") if metric_value(data, key) is not None)]))
    required = {k.metric_name for k in kpis} if kpis else set(METRICS)
    values = {key: metric_value(data, key) for key in keys}
    excused = {key: reason for key, reason in (data.unavailable.items() if data else []) if values.get(key) is None}
    missing = [key for key, value in values.items() if key in required and value is None and key not in excused]
    missing += [f"coverage:{key}" for key in required if data and data.coverage.get(key, {}).get("status", "available") != "available" and key not in excused]
    observations = [f"Observed {key}: {value}." for key, value in values.items() if value is not None]
    observations += [f"{key} not measured: {reason}." for key, reason in excused.items()]
    if data:
        observations += [f"{post.provider} post {post.external_post_id}: lifetime counters observed at {post.captured_at.isoformat()}; "
                         + ", ".join(f"{key}={value if value is not None else 'unavailable'}" for key, value in post.counters.items())
                         + (". Content was edited externally after approval" if post.external_content_modified else "")
                         + ". Not period reach, ad attribution or causal evidence."
                         for post in data.social_posts]
        observations += [f"{key} covers {coverage.get('from', 'unknown')} to {coverage.get('to', 'unknown')} in {coverage.get('timezone', 'unknown')}; coverage={coverage.get('status', 'unknown')}."
                         for key, coverage in data.coverage.items()]
        observations += [f"Group {g.group_id}: native period {g.period_from} to {g.period_to}; "
                         + ", ".join(f"{k}={v if v is not None else 'unavailable'}" for k, v in g.metrics.items())
                         + f"; current total members={g.total_members}. Total members is not new members."
                         for g in data.group_metrics]
    comparisons = compare_kpis(data, baseline, kpis, keys) if baseline or kpis else []
    missing += [f"kpi:{c['metric_name']}:{c['status']}" for c in comparisons
                if c['metric_name'] in required and c['status'] not in {"compared", "zero_baseline"}]
    observations += [f"{c['metric_name']}: measured change {c['absolute_change']}; "
                     + ("relative change unavailable for a zero baseline. " if c['status'] == 'zero_baseline'
                        else f"relative change {c['relative_change_pct']}%. ") + "Observation only, not causal."
                     for c in comparisons if c['status'] in {"compared", "zero_baseline"}]
    articles = data.content_metrics if data else []
    if articles:
        top = max(articles, key=lambda article: (article.cta_clicks, article.page_views, article.slug))
        observations.append(f"Top article '{top.title}': {top.page_views} views, {top.cta_clicks} CTA clicks. Observation only, not causal.")
    fields = result_fields(ctx, [item for item in (p.metrics, p.baseline_metrics) if item])
    proposal = None
    if not missing:
        proposal = "Review the cited aggregate window before proposing the next content test."
        if ctx.job.operation == "experiment.hypothesis" and experiment:
            proposal = (f"Test the hypothesis '{experiment.hypothesis}' with "
                        f"'{experiment.control_variant}' versus '{experiment.treatment_variant}', "
                        f"using {experiment.primary_metric} as the primary metric, "
                        f"grouped by {experiment.grouping}. Do not declare causal impact from this draft alone.")
    actions = [{"role": "research", "operation": "research.run", "priority": "high",
                "metric_name": c["metric_name"], "reason": f"Investigate the measured change of {c['absolute_change']} in {c['metric_name']} before changing content.",
                "requires_human_approval": True, "input_artifact_refs": fields.get("input_artifact_refs", [])}
               for c in comparisons if c["status"] in {"compared", "zero_baseline"}
               and c["absolute_change"] is not None and c["absolute_change"] < 0 and c["direction"] == "higher_is_better"]
    result = PerformanceReport(**fields, status="insufficient_data" if missing else "draft",
        missing_facts=missing, metrics=values, metric_snapshot_id=data.snapshot_id if data else None,
        window={"start": data.window_start.isoformat(), "end": data.window_end.isoformat()} if data else None,
        observations=observations, proposal=proposal, experiment=experiment,
        baseline_snapshot_id=baseline.snapshot_id if baseline else None,
        baseline_window={"start": baseline.window_start.isoformat(), "end": baseline.window_end.isoformat()} if baseline else None,
        kpi_comparisons=comparisons, content_metrics=articles, coverage=data.coverage if data else {},
        currency=data.currency if data else None, actions=actions, channel_metrics=data.channel_metrics if data else {},
        social_posts=data.social_posts if data else [], group_metrics=data.group_metrics if data else [])
    return OperationOutcome(result=result.model_dump(mode="json"), warnings=["NO_CAUSAL_OR_ROI_CLAIM"])
