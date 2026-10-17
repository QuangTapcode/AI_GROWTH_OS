import hashlib
from pydantic import Field
from ...app.runtime import OperationOutcome
from ..contracts import ArtifactInput, DraftResult, MarketingContext, artifact_problems, result_fields, validate_context

PROMPT_VERSION = "learning-v1"


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


def validate_learning(job, p, settings):
    problems = validate_context(job, p)
    if p.performance:
        problems += artifact_problems(job, p.performance, "performance")
    if p.lead_summary:
        problems += artifact_problems(job, p.lead_summary)
        count = p.lead_summary.result.get("count")
        if isinstance(count, bool) or not isinstance(count, int) or count < 0:
            problems.append(("INVALID_LEAD_AGGREGATE", "Use a nonnegative aggregate count, never raw contacts"))
        if set(p.lead_summary.result) - {"workspace_id", "version", "count", "synthetic"}:
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
    learning = []
    tasks = []
    stopped = None
    if missing:
        stopped = "insufficient_data"
    elif p.iteration >= p.max_iterations:
        stopped = "max_iterations"
    elif p.task_quota == 0:
        stopped = "task_quota"
    else:
        count = p.lead_summary.result["count"]
        learning = [f"The cited lead aggregate contains {count} leads; causal attribution is not established."]
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
        learning=learning, next_tasks=tasks, stopped_reason=stopped)
    return OperationOutcome(result=result.model_dump(mode="json"))
