import hashlib
from datetime import datetime
from pydantic import Field
from ...app.runtime import OperationOutcome
from pydantic import ValidationError
from ..performance.schemas import SocialPostEvidence, GroupMetricsEvidence
from ..contracts import ArtifactInput, DraftResult, MarketingContext, artifact_problems, result_fields, validate_context

PROMPT_VERSION = "learning-v2"
MIN_READERS_FOR_WEAK = 10
MAX_LESSON_TITLES = 5


class LearningPayload(MarketingContext):
    performance: ArtifactInput | None = None
    lead_summary: ArtifactInput | None = None
    iteration: int = Field(default=0, ge=0)
    max_iterations: int = Field(default=3, ge=1, le=3)
    task_quota: int = Field(default=1, ge=0, le=3)
    prior_dedup_keys: list[str] = Field(default_factory=list, max_length=100)


class LearningReport(DraftResult):
    iteration: int
    max_iterations: int
    learning: list[str]
    next_tasks: list[dict]
    stopped_reason: str | None
    # Which past articles readers acted on: passed to the Research round this report opens.
    lessons: dict[str, list[str]] = Field(default_factory=lambda: {"promising_titles": [], "weak_titles": []})


def article_lessons(articles: list[dict]) -> dict[str, list[str]]:
    """A click shows interest; views without one count against an article only once enough people came."""
    return {"promising_titles": [a["title"] for a in articles if a["cta_clicks"] > 0][:MAX_LESSON_TITLES],
            "weak_titles": [a["title"] for a in articles if a["page_views"] >= MIN_READERS_FOR_WEAK and not a["cta_clicks"]][:MAX_LESSON_TITLES]}


def validate_learning(job, p, settings):
    problems = validate_context(job, p)
    if p.performance:
        problems += artifact_problems(job, p.performance, "performance")
        try:
            posts = p.performance.result.get('social_posts') or []
            if not isinstance(posts, list) or len(posts) > 20:
                raise ValueError('At most 20 social observations are allowed')
            for raw in posts:
                post = SocialPostEvidence.model_validate(raw)
                if post.workspace_id != p.workspace_id:
                    raise ValueError('Foreign social observation')
            groups = p.performance.result.get('group_metrics') or []
            if not isinstance(groups, list) or len(groups) > 10:
                raise ValueError('At most 10 group observations are allowed')
            for raw in groups:
                if GroupMetricsEvidence.model_validate(raw).workspace_id != p.workspace_id:
                    raise ValueError('Foreign group observation')
        except (ValueError, ValidationError):
            problems.append(('INVALID_SOCIAL_EVIDENCE', 'Use workspace-scoped, validated social observations'))
    if p.lead_summary:
        problems += artifact_problems(job, p.lead_summary)
        count = p.lead_summary.result.get("count")
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            problems.append(("INVALID_LEAD_AGGREGATE", "Use a nonnegative aggregate count, never raw contacts"))
        if set(p.lead_summary.result) - {"workspace_id", "version", "count", "synthetic", "metrics_artifact_id", "window_start", "window_end"}:
            problems.append(("PII_NOT_ALLOWED", "Learning accepts aggregate lead counts only"))
    return problems


async def run_learning(ctx):
    p = ctx.payload
    refs = [x for x in (p.performance, p.lead_summary) if x]
    missing = []
    if not p.performance or p.performance.result.get("status") != "draft" or p.performance.result.get("missing_facts"):
        missing.append("complete_performance_snapshot")
    if not p.lead_summary:
        missing.append("lead_aggregate")
    elif p.performance and not (p.lead_summary.result.get("synthetic") is True and p.performance.result.get("synthetic") is True):
        window = p.performance.result.get("window") or {}
        summary = p.lead_summary.result
        measurement_refs = p.performance.result.get("input_artifact_refs") or []
        def same_time(left, right):
            try:
                return datetime.fromisoformat(left.replace('Z', '+00:00')) == datetime.fromisoformat(right.replace('Z', '+00:00'))
            except (ValueError, AttributeError, TypeError):
                return False
        if (not same_time(summary.get("window_start"), window.get("start")) or not same_time(summary.get("window_end"), window.get("end"))
                or not summary.get("metrics_artifact_id")
                or str(summary["metrics_artifact_id"]) not in {str(ref.get("artifact_id")) for ref in measurement_refs}):
            missing.append("matching_lead_measurement_window")
        elif p.performance.result.get('metrics', {}).get('leads') not in (None, summary.get('count')):
            missing.append('matching_lead_measurement_count')
    learning = []
    tasks = []
    stopped = None
    lessons = article_lessons([])
    if missing:
        stopped = "insufficient_data"
    elif p.iteration >= p.max_iterations:
        stopped = "max_iterations"
    elif p.task_quota == 0:
        stopped = "task_quota"
    else:
        count = p.lead_summary.result["count"]
        measured = [value for value in (p.performance.result.get("metrics") or {}).values() if value]
        articles = p.performance.result.get("content_metrics") or []
        social = p.performance.result.get('social_posts') or []
        has_social_signal = any(value for post in social for value in post['counters'].values() if value is not None)
        if not count and not measured and not any(article["page_views"] for article in articles) and not has_social_signal:
            # Another round would rewrite the same article; the next scheduled cycle brings new data instead.
            result = LearningReport(**result_fields(ctx, refs), status="draft", missing_facts=[], iteration=p.iteration,
                max_iterations=p.max_iterations, next_tasks=[], stopped_reason="no_measured_signal",
                learning=["No visits, clicks or leads were measured in this window, so there is nothing to learn from yet."])
            return OperationOutcome(result=result.model_dump(mode="json"))
        learning = [f"The cited lead aggregate contains {count} leads; causal attribution is not established."]
        comparisons = p.performance.result.get("kpi_comparisons", [])
        learning += [f"Measured {c['metric_name']} changed by {c['absolute_change']} against its cited baseline; "
                     "this observation does not establish cause or ROI."
                     for c in comparisons if c.get("status") in {"compared", "zero_baseline"}]
        lessons = article_lessons(articles)
        social = p.performance.result.get('social_posts') or []
        channel_notes = [f"{post.get('provider', 'facebook_page')} post {post['external_post_id']} (content artifact {post['artifact_id']} v{post['artifact_version']}): "
                         + ", ".join(f"{key}={value}" for key, value in post['counters'].items() if value is not None)
                         + f"; lifetime observation at {post['captured_at']}, not a period lift or causal finding."
                         for post in social if any(value is not None for value in post['counters'].values())][:5]
        channel_notes += [f"Group {g['group_id']}, native period {g['period_from']} to {g['period_to']}: "
                          + ", ".join(f"{k}={v if v is not None else 'unavailable'}" for k, v in g['metrics'].items())
                          + "; separate provider period, not causal or attributed leads."
                          for g in (p.performance.result.get('group_metrics') or [])][:5]
        if channel_notes:
            lessons['channel_observations'] = channel_notes
            learning += channel_notes
        if lessons["promising_titles"]:
            learning.append(f"Readers clicked the CTA on: {'; '.join(lessons['promising_titles'])}. Next articles may try related angles; this is not proof of cause.")
        if lessons["weak_titles"]:
            learning.append(f"Readers came but did not click on: {'; '.join(lessons['weak_titles'])}.")
        key = hashlib.sha256(f"{ctx.job.workspace_id}:{p.performance.artifact.artifact_id}:{p.performance.artifact.version}:{p.lead_summary.artifact.artifact_id}:{p.lead_summary.artifact.version}:{p.iteration}".encode()).hexdigest()
        if key in p.prior_dedup_keys:
            stopped = "duplicate_proposal"
        else:
            tasks = [{"role": "research", "operation": "research.run", "dedup_key": key,
                      "iteration": p.iteration + 1, "reason": "Reassess one grounded topic using the cited aggregate window.",
                      "input_artifact_refs": [x.artifact.model_dump(mode="json") for x in refs],
                      "requires_human_approval": True}]
    result = LearningReport(**result_fields(ctx, refs), status="insufficient_data" if missing else "draft",
        missing_facts=missing, iteration=p.iteration, max_iterations=p.max_iterations,
        learning=learning, next_tasks=tasks, stopped_reason=stopped, lessons=lessons)
    return OperationOutcome(result=result.model_dump(mode="json"))
