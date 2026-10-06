"""growth_map.suggest: audience/topic/channel/KPI and goal proposals for human review.

The LLM only drafts audiences and topics. Channels are limited to the pilot
allowlist, KPIs come from a fixed catalog, and numeric targets are never
proposed: the owner sets them after a baseline exists. Output is never applied.
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field

from ..app.config import Settings
from ..app.runtime import OperationOutcome, RunContext
from ..app.schemas import ApprovedFact, EvidenceRef, GrowthMapPayload, JobRequest
from ..guardrails.facts import unsupported_numbers


PROMPT_VERSION = "growth-map-v1"
SYSTEM_PROMPT = (Path(__file__).resolve().parents[2] / "prompts" / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")

CHANNELS = {
    "website_blog": "Pilot blog and landing page; the information-request form (persisted lead) lives here.",
    "seo": "Organic search to published English articles; measured with Google Search Console.",
    "facebook": "One reviewed Facebook variant per approved article; posted manually after approval.",
    "community": "Approved, manually posted replies in expat community threads; no automated posting.",
}

KPI_CATALOG = (
    ("persisted_leads", "Information-request form submissions persisted by the backend (pilot conversion).", "pilot_db"),
    ("qualified_sessions", "GA4 sessions on housing/living-area articles and the landing page.", "ga4"),
    ("form_conversion_rate", "persisted_leads / landing-page sessions, computed only when sessions > 0.", "computed"),
    ("organic_clicks", "Google Search Console clicks to published pilot URLs.", "gsc"),
)


class LLMAudience(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(min_length=1, max_length=120)
    rationale: str = Field(max_length=400)
    fact_keys: list[str] = Field(default_factory=list, max_length=10)


class LLMTopic(BaseModel):
    model_config = ConfigDict(extra="forbid")

    topic: str = Field(min_length=1, max_length=200)
    audience: str = Field(max_length=120)
    intent: str = Field(max_length=40)
    channel: str = Field(max_length=40)
    fact_keys: list[str] = Field(default_factory=list, max_length=10)


class LLMGrowthMap(BaseModel):
    model_config = ConfigDict(extra="forbid")

    audiences: list[LLMAudience] = Field(max_length=4)
    topics: list[LLMTopic] = Field(max_length=8)


def validate_growth_map(job: JobRequest, payload: GrowthMapPayload, settings: Settings) -> list[tuple[str, str]]:
    if payload.workspace_id != job.workspace_id:
        return [("TENANT_SCOPE_VIOLATION", "Payload workspace does not match the job workspace")]
    return []


def _fake_map(payload: GrowthMapPayload, fact_keys: list[str]) -> dict:
    profile = payload.business_profile
    location = profile.locations[0] if profile.locations else "the service area"
    audiences = profile.audiences[:4] or [f"English-speaking residents of {location}"]
    channel_cycle = list(CHANNELS)
    topics = [
        {
            "topic": f"{topic.replace('_', ' ').capitalize()} guide for {audiences[0]} in {location}",
            "audience": audiences[0],
            "intent": "informational",
            "channel": channel_cycle[index % len(channel_cycle)],
            "fact_keys": fact_keys if index == 0 else [],
        }
        for index, topic in enumerate((profile.topic_priority or ["services"])[:6])
    ]
    return {
        "audiences": [
            {"label": label, "rationale": "Listed in the approved business profile.", "fact_keys": []}
            for label in audiences
        ],
        "topics": topics,
    }


def _evidence(fact: ApprovedFact) -> EvidenceRef:
    unit = f" {fact.unit}" if fact.unit else ""
    return EvidenceRef(
        source_id=fact.source_id,
        source_version=fact.source_version,
        locator=fact.locator,
        quote=f"{fact.key}: {fact.value}{unit}"[:500],
    )


async def run_growth_map(ctx: RunContext) -> OperationOutcome:
    payload: GrowthMapPayload = ctx.payload
    job = ctx.job
    warnings: list[str] = []

    approved = {(item.source_id, item.version) for item in job.approved_source_versions}
    in_scope = [fact for fact in payload.approved_facts if (fact.source_id, fact.source_version) in approved]
    if len(in_scope) < len(payload.approved_facts):
        warnings.append(f"EXCLUDED_UNAPPROVED_FACTS:{len(payload.approved_facts) - len(in_scope)}")
    usable = {fact.key: fact for fact in in_scope if fact.value is not None and fact.value != ""}
    missing_facts = sorted({fact.key for fact in in_scope if fact.key not in usable})

    user = json.dumps(
        {
            "business_profile": payload.business_profile.model_dump(mode="json"),
            "approved_facts": [
                {"fact_key": fact.key, "value": fact.value, "unit": fact.unit} for fact in usable.values()
            ],
            "allowed_channels": list(CHANNELS),
            "goal_context": payload.goal_context.model_dump(mode="json") if payload.goal_context else None,
        },
        ensure_ascii=False,
    )
    draft = await ctx.call_json(
        system=SYSTEM_PROMPT,
        user=user,
        model=LLMGrowthMap,
        fake=lambda: _fake_map(payload, list(usable)),
    )

    # Numbers are only allowed when they already appear in the profile or approved facts.
    grounding = [user]
    evidence_by_key: dict[str, EvidenceRef] = {}

    def refs(keys: list[str]) -> list[dict]:
        out = []
        for key in dict.fromkeys(keys):
            fact = usable.get(key)
            if fact is None:
                if "UNKNOWN_FACT_KEY_DROPPED" not in warnings:
                    warnings.append("UNKNOWN_FACT_KEY_DROPPED")
                continue
            ref = evidence_by_key.setdefault(key, _evidence(fact))
            out.append(ref.model_dump(mode="json"))
        return out

    audiences = []
    for audience in draft.audiences:
        if unsupported_numbers(f"{audience.label} {audience.rationale}", grounding):
            warnings.append("UNSUPPORTED_NUMERIC_CLAIM_DROPPED")
            continue
        audiences.append({"label": audience.label, "rationale": audience.rationale, "evidence": refs(audience.fact_keys)})
    labels = {audience["label"] for audience in audiences}

    topics = []
    for topic in draft.topics:
        if topic.channel not in CHANNELS:
            warnings.append("CHANNEL_NOT_ALLOWED_DROPPED")
            continue
        if topic.audience not in labels:
            warnings.append("TOPIC_AUDIENCE_UNKNOWN_DROPPED")
            continue
        if unsupported_numbers(topic.topic, grounding):
            warnings.append("UNSUPPORTED_NUMERIC_CLAIM_DROPPED")
            continue
        topics.append(
            {
                "topic": topic.topic,
                "audience": topic.audience,
                "intent": topic.intent,
                "channel": topic.channel,
                "evidence": refs(topic.fact_keys),
            }
        )
    if not topics:
        warnings.append("NO_VALID_TOPICS")

    used_channels = ["website_blog", *sorted({topic["channel"] for topic in topics} - {"website_blog"})]
    goal = payload.goal_context
    primary_metric = (goal.primary_metric if goal and goal.primary_metric else None) or "persisted_leads"
    baseline = goal.baseline if goal else None

    kpis = []
    for metric, definition, data_source in KPI_CATALOG:
        kpi_baseline = baseline if metric == primary_metric else None
        kpis.append(
            {
                "metric": metric,
                "definition": definition,
                "data_source": data_source,
                "baseline": kpi_baseline,
                "target": None,
                "target_requires_owner_input": True,
            }
        )

    if baseline is None:
        goal_warning = "MISSING_BASELINE"
        rationale = "Measure a baseline during the first period before setting a numeric target."
    elif baseline == 0:
        goal_warning = "ZERO_BASELINE"
        rationale = "A relative target cannot be computed from a zero baseline; the owner sets an absolute target."
    else:
        goal_warning = None
        rationale = "The owner sets the numeric target; the AI does not propose growth percentages."
    if goal_warning:
        warnings.append(goal_warning)

    result = {
        "proposal_status": "pending_human_review",
        "applied": False,
        "requires_human_approval": True,
        "language": "en",
        "audiences": audiences,
        "topics": topics,
        "channels": [{"channel": channel, "rationale": CHANNELS[channel]} for channel in used_channels],
        "kpis": kpis,
        "goal_suggestions": [
            {
                "objective": (goal.objective if goal and goal.objective else None)
                or "Incremental qualified traffic that converts to information requests",
                "primary_metric": primary_metric,
                "baseline": baseline,
                "target": None,
                "target_kind": None,
                "period_days": (goal.period_days if goal and goal.period_days else None) or 30,
                "rationale": rationale,
            }
        ],
        "missing_facts": missing_facts,
        "synthetic": job.synthetic,
    }
    return OperationOutcome(result=result, evidence=list(evidence_by_key.values()), warnings=warnings)
