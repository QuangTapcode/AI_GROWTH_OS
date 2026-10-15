"""research.run: grounded opportunities over worker-fetched approved sources."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from pydantic import TypeAdapter, HttpUrl, ValidationError

from ...app.config import Settings
from ...app.runtime import OperationError, OperationOutcome, RunContext
from ...app.schemas import EvidenceRef, JobRequest
from ...guardrails.facts import has_price_claim, sensitive_keys_in, unsupported_numbers
from ...rag.chunking import estimate_tokens
from ...rag.retrieval import eligible_sources, lexical_overlap, terms
from ..context import context_problems
from .schemas import ResearchBrief, ResearchDraft, ResearchFinding, ResearchPayload

PROMPT_VERSION = "research-v1"
SYSTEM_PROMPT = (Path(__file__).resolve().parents[3] / "prompts" / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")


def validate_research(job: JobRequest, payload: ResearchPayload, settings: Settings) -> list[tuple[str, str]]:
    problems = context_problems(job, payload.business_profile, payload.goal_context, payload.snapshot)
    if payload.workspace_id != job.workspace_id or any(x.workspace_id != job.workspace_id for x in payload.content_inventory):
        problems.append(("TENANT_SCOPE_VIOLATION", "Research payload/inventory belongs to another workspace"))
    if not job.constraints.human_approval_required:
        problems.append(("APPROVAL_REQUIRED", "Pilot research cannot disable human approval"))
    return problems


async def run_research(ctx: RunContext) -> OperationOutcome:
    payload: ResearchPayload = ctx.payload
    sources, excluded = eligible_sources(ctx.job, payload.snapshot)
    warnings = [f"EXCLUDED_SOURCES:{excluded}"] if excluded else []
    candidates = {}
    now = datetime.now(timezone.utc)
    missing = []
    for source in sources:
        provenance = source.provenance
        fetched = provenance.retrieved_at if provenance else None
        url = provenance.source_url if provenance else None
        url = url or (source.url_or_blob if source.kind == "url" else None)
        try:
            valid_url = str(TypeAdapter(HttpUrl).validate_python(url))
        except ValidationError:
            missing.append(f"source:{source.source_id}:url")
            continue
        if fetched is None or fetched.tzinfo is None or fetched > now:
            missing.append(f"source:{source.source_id}:fetched_at")
            continue
        for chunk in source.chunks:
            if chunk.chunk_id in candidates:
                raise OperationError("DUPLICATE_CHUNK_ID", "Research chunk IDs must be unique")
            # Sensitive facts belong to verified structured facts, not research excerpts.
            if has_price_claim(chunk.text) or sensitive_keys_in(chunk.text):
                warnings.append("SENSITIVE_EXCERPT_EXCLUDED")
                continue
            candidates[chunk.chunk_id] = (source, chunk, valid_url, fetched)

    profile = payload.business_profile.model_dump(mode="json", exclude_none=True)
    base = {"profile": profile,
            "goal": payload.goal_context.model_dump(mode="json", exclude_none=True) if payload.goal_context else None,
            "inventory": [x.title for x in payload.content_inventory], "excerpts": []}
    overhead = estimate_tokens(SYSTEM_PROMPT + json.dumps(ResearchDraft.model_json_schema()) + json.dumps(base))
    if overhead > ctx.settings.max_input_tokens:
        raise OperationError("CONTEXT_BUDGET_EXCEEDED", "Profile/goal/inventory exceeds the research input budget")
    selected = {}
    used = overhead
    for key, (_, chunk, _, _) in candidates.items():
        excerpt = {"chunk_id": key, "text": chunk.text}
        cost = estimate_tokens(json.dumps(excerpt)) + 10
        if used + cost > ctx.settings.max_input_tokens or len(selected) >= ctx.settings.max_retrieved_chunks:
            warnings.append("EXCERPT_BUDGET_EXCLUDED")
            continue
        base["excerpts"].append(excerpt)
        selected[key] = candidates[key]
        used += cost

    if not profile.get("products") and not profile.get("services"):
        missing.append("confirmed_offer")
    if not profile.get("audiences"):
        missing.append("target_audience")
    if not selected:
        missing.append("approved_research_excerpts")
        draft = ResearchDraft(ideas=[])
    else:
        def fake() -> dict:
            key, (_, chunk, _, _) = next(iter(selected.items()))
            topic = (payload.business_profile.topic_priority or ["Local living guide"])[0]
            return {"ideas": [{"topic": topic,
                "audience_fit": "Explore this topic for the supplied target audience.",
                "offer_fit": "Confirm the offer before preparing a campaign.",
                "rationale": "The cited excerpt supports a content hypothesis; demand is not measured.",
                "chunk_id": key, "quote": chunk.text[:400]}]}
        draft = await ctx.call_json(system=SYSTEM_PROMPT, user=json.dumps(base, ensure_ascii=False),
                                    model=ResearchDraft, fake=fake)

    findings = []
    seen = set()
    for idea in draft.ideas:
        ref = selected.get(idea.chunk_id)
        if ref is None or idea.quote not in ref[1].text:
            warnings.append("UNGROUNDED_IDEA_DROPPED")
            continue
        narrative = " ".join((idea.topic, idea.audience_fit, idea.offer_fit, idea.rationale))
        grounding = [json.dumps(profile, ensure_ascii=False), ref[1].text]
        if unsupported_numbers(narrative, grounding) or has_price_claim(narrative) or sensitive_keys_in(narrative):
            warnings.append("UNSUPPORTED_CLAIM_DROPPED")
            continue
        topic_key = " ".join(sorted(terms(idea.topic))) or idea.topic.casefold()
        if topic_key in seen or any(lexical_overlap(terms(idea.topic), x.title) >= 0.8 for x in payload.content_inventory):
            warnings.append("DUPLICATE_TOPIC_DROPPED")
            continue
        seen.add(topic_key)
        source, chunk, url, fetched = ref
        evidence = EvidenceRef(source_id=source.source_id, source_version=source.version,
                               chunk_id=chunk.chunk_id, locator=chunk.locator, quote=idea.quote,
                               source_url=url, license=source.provenance.license,
                               attribution=source.provenance.attribution)
        findings.append(ResearchFinding(topic=idea.topic, audience_fit=idea.audience_fit,
                         offer_fit=idea.offer_fit, rationale=idea.rationale,
                         evidence=evidence, url=url, fetched_at=fetched))
    if not findings:
        missing.append("grounded_opportunities")
    brief = ResearchBrief(brief_id=uuid5(NAMESPACE_URL, f"research:{ctx.job.job_id}:{ctx.job.input_version}"),
                          workspace_id=ctx.job.workspace_id, profile_version=payload.business_profile.version,
                          context_snapshot_id=payload.snapshot.snapshot_id,
                          status="ready_for_handoff" if findings else "insufficient_data",
                          findings=findings, missing_facts=sorted(set(missing)),
                          synthetic=ctx.settings.provider_mode == "fake" or ctx.job.synthetic)
    return OperationOutcome(result=brief.model_dump(mode="json"),
                            evidence=[x.evidence for x in findings], warnings=sorted(set(warnings)))
