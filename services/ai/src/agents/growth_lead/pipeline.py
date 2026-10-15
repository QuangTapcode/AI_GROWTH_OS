"""Select an existing research opportunity and assemble bounded draft tasks."""
import json
import hashlib
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from ...app.runtime import OperationError, OperationOutcome, RunContext
from ...app.schemas import JobRequest
from ...app.config import Settings
from ...rag.chunking import estimate_tokens
from ...rag.retrieval import eligible_sources
from ..context import context_problems
from .schemas import CampaignPlan, CampaignTask, GrowthLeadPayload, OpportunitySelection, TaskBrief

PROMPT_VERSION = "growth-lead-v1"
SYSTEM_PROMPT = (Path(__file__).resolve().parents[3] / "prompts" / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")


def validate_growth_lead(job: JobRequest, payload: GrowthLeadPayload, settings: Settings) -> list[tuple[str, str]]:
    problems = context_problems(job, payload.business_profile, payload.goal_context, payload.snapshot)
    research, artifact = payload.research, payload.research_artifact
    if any(x != job.workspace_id for x in (payload.workspace_id, research.workspace_id, artifact.workspace_id)):
        problems.append(("TENANT_SCOPE_VIOLATION", "Research/artifact belongs to another workspace"))
    if not job.context_snapshot_id or any(x != job.context_snapshot_id for x in (
            payload.snapshot.snapshot_id, research.context_snapshot_id, artifact.context_snapshot_id)):
        problems.append(("SNAPSHOT_MISMATCH", "Growth Lead requires the same pinned snapshot throughout"))
    if research.profile_version != payload.business_profile.version or artifact.role != "research":
        problems.append(("RESEARCH_VERSION_MISMATCH", "Research profile version/role differs from context"))
    canonical = json.dumps({"result": research.model_dump(mode="json"),
                            "evidence": [x.evidence.model_dump(mode="json") for x in research.findings]},
                           sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    if hashlib.sha256(canonical.encode()).hexdigest() != artifact.content_hash:
        problems.append(("ARTIFACT_HASH_MISMATCH", "Research content differs from its artifact hash"))
    if len(research.findings) > 3:
        problems.append(("INVALID_RESEARCH", "At most three opportunities are supported"))
    if not job.constraints.human_approval_required:
        problems.append(("APPROVAL_REQUIRED", "Campaign drafts require human approval before publication"))
    sources, _ = eligible_sources(job, payload.snapshot)
    for finding in research.findings:
        evidence = finding.evidence
        matches = [s for s in sources if s.source_id == evidence.source_id and s.version == evidence.source_version]
        if not any(c.chunk_id == evidence.chunk_id and evidence.quote and evidence.quote in c.text
                   for s in matches for c in s.chunks):
            problems.append(("UNGROUNDED_RESEARCH", "Research evidence is absent, stale or revoked"))
    return problems


async def run_growth_lead(ctx: RunContext) -> OperationOutcome:
    p: GrowthLeadPayload = ctx.payload
    research = p.research
    missing = set(research.missing_facts)
    if not p.business_profile.audiences:
        missing.add("target_audience")
    if not p.business_profile.products and not p.business_profile.services:
        missing.add("confirmed_offer")
    if not p.cta:
        missing.add("confirmed_cta")
    if p.business_profile.version is None:
        missing.add("profile_version")
    selected = None
    tasks = []
    if research.status == "ready_for_handoff" and research.findings:
        user = json.dumps({"profile": p.business_profile.model_dump(mode="json"),
                           "goal": p.goal_context.model_dump(mode="json") if p.goal_context else None,
                           "findings": [x.model_dump(mode="json") for x in research.findings]}, ensure_ascii=False)
        if estimate_tokens(SYSTEM_PROMPT + user + json.dumps(OpportunitySelection.model_json_schema())) > ctx.settings.max_input_tokens:
            raise OperationError("CONTEXT_BUDGET_EXCEEDED", "Growth Lead context exceeds input budget")
        choice = await ctx.call_json(system=SYSTEM_PROMPT, user=user, model=OpportunitySelection,
                                     fake=lambda: {"finding_index": 0})
        if choice.finding_index >= len(research.findings):
            raise OperationError("INVALID_OPPORTUNITY", "Selected opportunity is not in research")
        selected = research.findings[choice.finding_index]
        for role, operation, deliverable in (("seo", "seo.local_draft", "seo_article_draft"),
                                              ("content", "content.repurpose", "social_pack_draft")):
            task_id = uuid5(NAMESPACE_URL, f"{ctx.job.job_id}:{ctx.job.input_version}:{role}")
            dependencies = [tasks[0].task_id] if tasks else []
            brief = TaskBrief(topic=selected.topic, audience=p.business_profile.audiences,
                              offer=p.business_profile.products + p.business_profile.services,
                              audience_fit=selected.audience_fit, offer_fit=selected.offer_fit,
                              deliverable=deliverable, cta=p.cta,
                              acceptance=["Use cited research and verified snapshot facts only.",
                                          "Report missing facts; do not invent demand, price or availability.",
                                          "Return a draft for human review before publication."] +
                                         (["Adapt the approved SEO draft; identify real image assets or report missing assets."] if tasks else []))
            tasks.append(CampaignTask(task_id=task_id, role=role, operation=operation,
                                      tools=["knowledge.read", "content.draft"], depends_on=dependencies,
                                      input_artifact_refs=[p.research_artifact],
                                      dependency_artifact_from=dependencies, brief=brief))
    else:
        missing.add("grounded_opportunities")
    plan = CampaignPlan(plan_id=uuid5(NAMESPACE_URL, f"plan:{ctx.job.job_id}:{ctx.job.input_version}"),
                        workspace_id=ctx.job.workspace_id, input_version=ctx.job.input_version,
                        profile_version=p.business_profile.version, context_snapshot_id=ctx.job.context_snapshot_id,
                        status="blocked" if missing else "proposed",
                        objective=(p.goal_context.objective if p.goal_context else None) or "Prepare grounded SEO and social drafts",
                        selected_opportunity=selected, research_artifact=p.research_artifact,
                        tasks=tasks, missing_facts=sorted(missing),
                        synthetic=ctx.job.synthetic or research.synthetic or ctx.settings.provider_mode == "fake")
    return OperationOutcome(result=plan.model_dump(mode="json"),
                            evidence=[selected.evidence] if selected else [],
                            warnings=["MOCK_DATA_NOT_FOR_PUBLICATION"] if plan.synthetic else [])
