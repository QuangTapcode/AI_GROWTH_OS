"""Select an existing research opportunity and assemble bounded draft tasks."""
import json
import hashlib
import math
from datetime import datetime, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from pydantic import ValidationError

from ...app.runtime import OperationError, OperationOutcome, RunContext
from ...app.schemas import JobRequest
from ...app.config import Settings
from ...rag.chunking import estimate_tokens
from ...rag.retrieval import eligible_sources
from ..context import context_problems
from ..contracts import artifact_problems, blocking_facts
from ..performance.baseline import metric_value
from ..performance.schemas import MetricsData
from ..research.pipeline import STALE_AFTER_YEARS, names_focus
from ..research.strategy import topic_alignment, priority_order
from .scoring import SOURCE as SCORE_SOURCE, derive_factors
from .schemas import (
    CampaignPlan,
    CampaignTask,
    CommunityContextInput,
    CommunityGrowthPlan,
    GrowthLeadPayload,
    OpportunitySelection,
    TaskBrief,
    WeeklyCommunityTarget,
)

PROMPT_VERSION = "growth-lead-v1"
SYSTEM_PROMPT = (Path(__file__).resolve().parents[3] / "prompts" / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")


TRAFFIC_METRICS = ("qualified_visits", "clicks")
# The factors a priority looks at first; the full score still ranks within them.
PRIORITY_FACTORS = {"reach": ("demand", "content_gap"), "conversion": ("conversion_potential", "business_relevance"), "maintain": ()}
PRIORITY_REASONS = {"reach": "No traffic is measured yet, so this plan goes for the topic people can find.",
                    "conversion": "Traffic is measured but the target is not reached, so this plan goes for the topic closest to the offer.",
                    "maintain": "The measured targets are reached, so this plan keeps the usual ranking."}


def measured_progress(p: GrowthLeadPayload) -> tuple[list[dict], dict | None]:
    """KPI status in the latest snapshot and the priority it calls for; only measured values count."""
    if not p.latest_metrics:
        return [], None
    data = MetricsData.model_validate(p.latest_metrics.result)
    progress = []
    for kpi in (p.goal_context.kpis if p.goal_context else []):
        value = metric_value(data, kpi.metric_name)
        status = "not_measured" if value is None else "reached" if value >= kpi.target_value else "behind"
        progress.append({"metric_name": kpi.metric_name, "target_value": kpi.target_value, "current_value": value, "status": status})
    if progress and all(item["status"] == "reached" for item in progress):
        mode = "maintain"
    else:
        mode = "conversion" if any(metric_value(data, metric) for metric in TRAFFIC_METRICS) else "reach"
    return progress, {"mode": mode, "reason": PRIORITY_REASONS[mode]}


def compute_community_growth_plan(p: GrowthLeadPayload, selected_topic: str | None) -> CommunityGrowthPlan | None:
    """Compute realistic 4-week Group member targets & safe daily invite quota from observed metrics."""
    ctx = p.community_context
    if ctx is None and p.latest_metrics and isinstance(p.latest_metrics.result, dict):
        raw_cm = p.latest_metrics.result.get("community_metrics")
        if isinstance(raw_cm, dict):
            ctx = CommunityContextInput(
                group_name=str(raw_cm.get("group_name") or "")[:200] or None,
                current_members=max(0, int(raw_cm.get("group_member_count") or 0)),
                week1_baseline_members=(
                    int(raw_cm["week1_baseline_members"])
                    if raw_cm.get("week1_baseline_members") is not None
                    else None
                ),
                page_followers=(
                    int(raw_cm["page_followers_count"])
                    if raw_cm.get("page_followers_count") is not None
                    else None
                ),
                identified_prospects=max(0, int(raw_cm.get("identified_prospects") or 0)),
                invites_sent_7d=max(0, int(raw_cm.get("invites_sent_7d") or 0)),
                comments_replied_7d=max(0, int(raw_cm.get("comments_replied_7d") or 0)),
                pending_questions=max(0, int(raw_cm.get("pending_questions") or 0)),
                current_campaign_week=max(1, min(52, int(raw_cm.get("campaign_week") or 1))),
                daily_invite_cap=max(1, min(20, int(raw_cm.get("daily_invite_limit") or 12))),
                auto_reply_comments=bool(raw_cm.get("auto_reply_comments", True)),
                auto_invite_enabled=bool(raw_cm.get("auto_invite_enabled", True)),
            )
    if ctx is None:
        return None

    current = max(0, ctx.current_members)
    prospects = max(0, ctx.identified_prospects)
    replies_7d = max(0, ctx.comments_replied_7d)
    invites_7d = max(0, ctx.invites_sent_7d)
    week = max(1, min(4, ctx.current_campaign_week))

    daily_limit = 12
    if prospects >= 15 or replies_7d >= 5:
        daily_limit = 14
    elif prospects >= 8 or replies_7d >= 2:
        daily_limit = 13
    elif current < 5 and prospects == 0 and invites_7d == 0:
        daily_limit = 10
    daily_limit = max(10, min(15, daily_limit))

    leads_kpi = next(
        (k.target_value for k in (p.goal_context.kpis if p.goal_context else []) if k.metric_name == "leads"),
        0,
    )
    base_gain = max(5, round(daily_limit * 7 * 0.08))
    signal_bonus = 2 if (prospects >= 12 or replies_7d >= 5) else (1 if (prospects >= 4 or replies_7d >= 1) else 0)
    goal_bonus = min(5, max(0, int(leads_kpi // 4))) if leads_kpi else 0
    weekly_step = base_gain + signal_bonus + goal_bonus

    baseline = ctx.week1_baseline_members if ctx.week1_baseline_members is not None else current
    if week == 1:
        w1 = max(5, current + 3) if current < 10 else current + max(5, round(weekly_step * 0.8))
        w2 = max(w1 + 5, w1 + weekly_step)
        w3 = max(w2 + 7, w2 + round(weekly_step * 1.25))
        w4 = max(w3 + 9, w3 + round(weekly_step * 1.5))
    elif week == 2:
        w1 = max(5, min(current, baseline))
        w2 = max(w1 + 5, 10, current + max(5, round(weekly_step * 0.75)))
        w3 = max(w2 + 6, w2 + weekly_step)
        w4 = max(w3 + 8, w3 + round(weekly_step * 1.35))
    elif week == 3:
        w1 = max(5, min(current, baseline))
        w2 = max(w1 + 5, min(current, w1 + weekly_step))
        w3 = max(w2 + 6, current + weekly_step)
        w4 = max(w3 + 8, w3 + round(weekly_step * 1.35))
    else:
        w1 = max(5, min(current, baseline))
        w2 = max(w1 + 5, min(current, w1 + weekly_step))
        w3 = max(w2 + 6, min(current, w2 + weekly_step))
        w4 = max(w3 + 8, current + round(weekly_step * 1.25))

    targets_list = [w1, w2, w3, w4]
    active_target = targets_list[week - 1]
    if current >= active_target:
        pacing_status = "ahead"
    elif current >= round(active_target * 0.65):
        pacing_status = "on_track"
    elif current == 0 and invites_7d == 0:
        pacing_status = "baseline"
    else:
        pacing_status = "behind"

    topic_label = selected_topic or "Kinh nghiệm Du lịch & Sống tại Việt Nam"
    weekly_targets = [
        WeeklyCommunityTarget(
            week=1,
            label="Tuần 1 — Khởi tạo thành viên nền (Seed Core)",
            member_target=w1,
            weekly_new_target=max(5, w1),
            focus="Định hình nội dung hỏi-đáp thực tế & mời bạn bè/Fanpage cùng quan tâm",
            channel_tactic=f"Mời tối đa {daily_limit} người/ngày qua nút Mời FB & ghim bài chào mừng Group",
        ),
        WeeklyCommunityTarget(
            week=2,
            label="Tuần 2 — Kéo thành viên từ Bình luận & Inbox",
            member_target=w2,
            weekly_new_target=max(5, w2 - w1),
            focus=f"Tập trung chủ đề '{topic_label[:75]}' và tự động trả lời comment dẫn link Group",
            channel_tactic="Tự động phản hồi comment Page/Group + gửi lời mời Group qua Private Reply",
        ),
        WeeklyCommunityTarget(
            week=3,
            label="Tuần 3 — Mở rộng tự nhiên từ SEO Website & Thảo luận",
            member_target=w3,
            weekly_new_target=max(6, w3 - w2),
            focus="Chuyển đổi độc giả TripC Pilot & người hỏi thông tin thuê nhà/lưu trú",
            channel_tactic="CTA mời tham gia Group trên mọi bài SEO + quét nhu cầu mới từ SearXNG",
        ),
        WeeklyCommunityTarget(
            week=4,
            label="Tuần 4 — Tối ưu giữ chân & Tăng tốc theo tín hiệu thực",
            member_target=w4,
            weekly_new_target=max(8, w4 - w3),
            focus="Nhân rộng chủ đề có tương tác cao & duy trì thảo luận đều đặn mỗi ngày",
            channel_tactic="Tự động cân đối hạn mức mời an toàn (10-15/ngày) và tổng hợp hỏi đáp nổi bật",
        ),
    ]

    focus_channels = [
        "Facebook Group Native Invite (10-15 lời mời/ngày)",
        "Auto-Reply Comment Fanpage + Private Reply Mời Nhóm",
        "Auto-Reply Comment trong Group & Bài viết Website TripC Pilot",
    ]
    rationale = (
        f"Growth Lead Agent phân tích dữ liệu thực tế ({current} thành viên Group hiện tại, "
        f"{prospects} người quan tâm từ bình luận/tin nhắn, {replies_7d} phản hồi và {invites_7d} lời mời trong 7 ngày qua). "
        f"Thay vì đặt mốc cứng quá cao, mục tiêu tăng trưởng được đề xuất theo lộ trình {w1} -> {w2} -> {w3} -> {w4} thành viên "
        f"với giới hạn mời an toàn {daily_limit} người/ngày để tránh spam và tối ưu tỷ lệ chấp nhận lời mời."
    )[:1000]

    return CommunityGrowthPlan(
        source="growth_lead_agent",
        auto_apply=True,
        current_members=current,
        pacing_status=pacing_status,
        recommended_daily_invite_limit=daily_limit,
        recommended_auto_reply_comments=True,
        recommended_auto_invite_enabled=True,
        week1_target=w1,
        week2_target=w2,
        week3_target=w3,
        week4_target=w4,
        weekly_targets=weekly_targets,
        rationale=rationale,
        focus_channels=focus_channels,
    )


def validate_growth_lead(job: JobRequest, payload: GrowthLeadPayload, settings: Settings) -> list[tuple[str, str]]:
    problems = context_problems(job, payload.business_profile, payload.goal_context, payload.snapshot)
    if payload.latest_metrics:
        problems += artifact_problems(job, payload.latest_metrics)
        try:
            MetricsData.model_validate(payload.latest_metrics.result)
        except ValidationError:
            problems.append(("INVALID_METRICS", "Latest metrics snapshot is invalid"))
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
    kpi_progress, priority = measured_progress(p)
    if research.status == "ready_for_handoff" and research.findings and not p.score_factors:
        # No operator estimate: rank every finding by the same transparent derived score and
        # pick the best; the model is not asked to choose blindly between hypotheses.
        scored = []
        for index, finding in enumerate(research.findings):
            factors_i, basis_i = derive_factors(finding, research.trend_coverage, p.business_profile, p.cta)
            scored.append((math.prod(factors_i.values()), index, factors_i, basis_i))
        def alignment_of(finding):
            return topic_alignment(' '.join([finding.topic, *finding.keywords, finding.user_need or '']), p.business_profile)
        focus = [offer.replace("_", " ") for offer in (p.goal_context.focus_offers if p.goal_context else [])]
        def off_goal(finding):
            return bool(focus) and not names_focus(" ".join([finding.topic, *finding.keywords, finding.user_need or ""]), focus)
        def stale(finding):
            # Stale evidence blocks the plan, so it only wins when every finding is stale.
            return finding.evidence_updated is not None and finding.evidence_updated < datetime.now(timezone.utc).year - STALE_AFTER_YEARS
        # What the owner asked for comes first, then usable evidence, then what the measurements call for;
        # the score ranks within them.
        first_factors = PRIORITY_FACTORS[priority["mode"]] if priority else ()
        scored.sort(key=lambda row: (off_goal(research.findings[row[1]]), stale(research.findings[row[1]]),
                                     priority_order(alignment_of(research.findings[row[1]])),
                                     *(-row[2][name] for name in first_factors), -row[0], row[1]))
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
                        kpi_progress=kpi_progress, priority=priority,
                        strategy_alignment=topic_alignment(' '.join([selected.topic, *selected.keywords, selected.user_need or '']), p.business_profile) if selected else None,
                        community_growth_plan=compute_community_growth_plan(p, selected.topic if selected else None),
                        synthetic=ctx.job.synthetic or research.synthetic or ctx.settings.provider_mode == "fake",
                        opportunity_score={"factors": factors, "score": score, "estimated": True,
                            "label": "estimated" if score is not None else "insufficient_data",
                            "formula": "demand * business_relevance * growth_potential * content_gap * freshness * conversion_potential",
                            "source": source, **({"basis": basis} if basis else {})})
    return OperationOutcome(result=plan.model_dump(mode="json"),
                            evidence=[selected.evidence] if selected else [],
                            warnings=["MOCK_DATA_NOT_FOR_PUBLICATION"] if plan.synthetic else [])
