"""Select an existing research opportunity and assemble bounded draft tasks."""
import json
import hashlib
import math
from datetime import datetime, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from ...app.runtime import OperationError, OperationOutcome, RunContext
from ...app.schemas import JobRequest
from ...app.config import Settings
from ...rag.chunking import estimate_tokens
from ...rag.retrieval import eligible_sources
from ..context import context_problems
from ..contracts import blocking_facts
from ..research.pipeline import STALE_AFTER_YEARS
from ..research.strategy import topic_alignment, priority_order
from .scoring import SOURCE as SCORE_SOURCE, derive_factors
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
    # Hash original serialized content, including old artifacts without v2 fields.
    raw_research = job.payload["research"]
    canonical = json.dumps({"result": raw_research,
                            "evidence": [x["evidence"] for x in raw_research["findings"]]},
                           sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    if hashlib.sha256(canonical.encode()).hexdigest() != artifact.content_hash:
        problems.append(("ARTIFACT_HASH_MISMATCH", "Research content differs from its artifact hash"))
    if len(research.findings) > 3:
        problems.append(("INVALID_RESEARCH", "At most three opportunities are supported"))
    if not job.constraints.human_approval_required:
        problems.append(("APPROVAL_REQUIRED", "Campaign drafts require human approval before publication"))
    if payload.deadline and (payload.deadline.tzinfo is None or payload.deadline <= datetime.now(timezone.utc)):
        problems.append(("INVALID_DEADLINE", "Campaign deadline must be timezone-aware and in the future"))
    if any(value is not None and (not math.isfinite(value) or not 0 <= value <= 5) for value in payload.score_factors.values()):
        problems.append(("INVALID_SCORE", "Operator estimates must be finite scores between zero and five"))
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
    # Research coverage notes (gaps on other topics, dated excerpts of other findings, a dropped
    # model draft replaced by a grounded finding) are shown but do not block; only facts about
    # the selected opportunity do.
    advisory = missing - set(blocking_facts(missing))
    if not p.business_profile.audiences:
        missing.add("target_audience")
    if not p.business_profile.products and not p.business_profile.services:
        missing.add("confirmed_offer")
    if not p.cta:
        missing.add("confirmed_cta")
    if not p.deadline:
        missing.add("campaign_deadline")
    if p.business_profile.version is None:
        missing.add("profile_version")
    selected = None
    tasks = []
    selection_method, ranking, derived = "model_selection_from_grounded_research", [], None
    if research.status == "ready_for_handoff" and research.findings and not p.score_factors:
        # No operator estimate: rank every finding by the same transparent derived score and
        # pick the best; the model is not asked to choose blindly between hypotheses.
        scored = []
        for index, finding in enumerate(research.findings):
            factors_i, basis_i = derive_factors(finding, research.trend_coverage, p.business_profile, p.cta)
            scored.append((math.prod(factors_i.values()), index, factors_i, basis_i))
        def alignment_of(finding):
            return topic_alignment(' '.join([finding.topic, *finding.keywords, finding.user_need or '']), p.business_profile)
        scored.sort(key=lambda row: (priority_order(alignment_of(research.findings[row[1]])), -row[0], row[1]))
        ranking = [{"finding_index": index, "topic": research.findings[index].topic, "score": score,
                    "strategy_alignment": alignment_of(research.findings[index])}
                   for score, index, _, _ in scored]
        best = scored[0]
        selected, derived = research.findings[best[1]], (best[2], best[3])
        selection_method = "derived_score_ranking"
    elif research.status == "ready_for_handoff" and research.findings:
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
    if selected is not None:
        alignment = topic_alignment(' '.join([selected.topic, *selected.keywords, selected.user_need or '']), p.business_profile)
        missing.update(code for code in selected.missing_data if code in {
            'official_source_required', 'current_event_details_require_review', 'confirmed_service_capability_required'})
        if selected.evidence_updated is not None and selected.evidence_updated < datetime.now(timezone.utc).year - STALE_AFTER_YEARS:
            advisory.discard(f"stale_evidence:{selected.evidence_updated}")
            missing.add(f"stale_evidence:{selected.evidence_updated}")
        for role, operation, deliverable in (("seo", "seo.local_draft", "seo_article_draft"),
                                              ("content", "content.repurpose", "social_pack_draft")):
            task_id = uuid5(NAMESPACE_URL, f"{ctx.job.job_id}:{ctx.job.input_version}:{role}")
            dependencies = [tasks[0].task_id] if tasks else []
            brief = TaskBrief(topic=selected.topic, audience=p.business_profile.audiences,
                              offer=p.business_profile.products + p.business_profile.services,
                              audience_fit=selected.audience_fit, offer_fit=selected.offer_fit,
                              deliverable=deliverable, cta=p.cta,
                              strategy_alignment=alignment,
                              acceptance=["Use cited research and verified snapshot facts only.",
                                          "Report missing facts; do not invent demand, price or availability.",
                                          "Return a draft for human review before publication."] +
                                         (["Adapt the approved SEO draft; identify real image assets or report missing assets."] if tasks else []) +
                                         (["Verify official sources for sensitive claims, event details and actual service capability before promotion.",
                                           "Measure the configured topic objectives; do not invent targets, conversions, bookings or market demand."] if alignment else []))
            tasks.append(CampaignTask(task_id=task_id, role=role, operation=operation,
                                      tools=["knowledge.read", "content.draft"], depends_on=dependencies,
                                      input_artifact_refs=[p.research_artifact],
                                      dependency_artifact_from=dependencies, brief=brief, deadline=p.deadline))
    if selected is None:
        missing.add("grounded_opportunities")
    factor_names = ("demand", "business_relevance", "growth_potential", "content_gap", "freshness", "conversion_potential")
    factors = {name: p.score_factors.get(name) for name in factor_names}
    source, basis = "operator_estimate_not_search_volume", None
    if derived is not None:
        # No operator estimate: transparent heuristics from the cited research signals.
        factors, basis = derived
        source = SCORE_SOURCE
    # JSON consumers such as PostgreSQL/JavaScript parse 3.0 as 3. Keep the
    # artifact's canonical hash stable across that serialization boundary.
    factors = {key: int(value) if value is not None and float(value).is_integer() else value for key, value in factors.items()}
    score = math.prod(factors.values()) if all(value is not None for value in factors.values()) else None
    if isinstance(score, float) and score.is_integer():
        score = int(score)
    plan = CampaignPlan(plan_id=uuid5(NAMESPACE_URL, f"plan:{ctx.job.job_id}:{ctx.job.input_version}"),
                        workspace_id=ctx.job.workspace_id, input_version=ctx.job.input_version,
                        profile_version=p.business_profile.version, context_snapshot_id=ctx.job.context_snapshot_id,
                        status="blocked" if missing - advisory else "proposed",
                        objective=(p.goal_context.objective if p.goal_context else None) or "Prepare grounded SEO and social drafts",
                        selection_method=selection_method, ranked_opportunities=ranking,
                        selected_opportunity=selected, research_artifact=p.research_artifact,
                        tasks=tasks, missing_facts=sorted(missing),
                        kpis=[k.model_dump(mode="json") for k in p.goal_context.kpis] if p.goal_context else [],
                        strategy_alignment=topic_alignment(' '.join([selected.topic, *selected.keywords, selected.user_need or '']), p.business_profile) if selected else None,
                        synthetic=ctx.job.synthetic or research.synthetic or ctx.settings.provider_mode == "fake",
                        opportunity_score={"factors": factors, "score": score, "estimated": True,
                            "label": "estimated" if score is not None else "insufficient_data",
                            "formula": "demand * business_relevance * growth_potential * content_gap * freshness * conversion_potential",
                            "source": source, **({"basis": basis} if basis else {})})
    return OperationOutcome(result=plan.model_dump(mode="json"),
                            evidence=[selected.evidence] if selected else [],
                            warnings=["MOCK_DATA_NOT_FOR_PUBLICATION"] if plan.synthetic else [])
