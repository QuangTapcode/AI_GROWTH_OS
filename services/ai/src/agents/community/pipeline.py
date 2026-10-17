from pathlib import Path
from ...app.runtime import OperationOutcome
from ...app.schemas import EvidenceRef
from ...guardrails.facts import sensitive_keys_in
from ...rag.retrieval import eligible_sources, lexical_overlap, terms
from ..contracts import aware_past, call_draft, ensure_grounded, result_fields, validate_context
from .schemas import CommunityReply, ReplyDraft

PROMPT_VERSION = "community-v1"
SYSTEM_PROMPT = (Path(__file__).resolve().parents[3] / "prompts/community-v1.md").read_text(encoding="utf-8")


def validate_community(job, p, settings):
    return validate_context(job, p)


async def run_community(ctx):
    p = ctx.payload
    sensitive = sensitive_keys_in(p.question)
    sources, _ = eligible_sources(ctx.job, p.snapshot)
    candidates = [(lexical_overlap(terms(p.question), c.text), s, c)
                  for s in sources if s.provenance and s.provenance.source_url
                  and s.provenance.retrieved_at and aware_past(s.provenance.retrieved_at)
                  for c in s.chunks]
    candidates.sort(key=lambda item: item[0], reverse=True)
    selected = [(s, c) for score, s, c in candidates[:3] if score > 0]
    missing = [f"verified_fact:{key}" for key in sensitive]
    evidence = []
    if sensitive or not selected:
        if not selected:
            missing.append("grounded_answer")
        reply = "The verified information needed for this question is unavailable. A human needs to review it."
    else:
        evidence = [EvidenceRef(source_id=s.source_id, source_version=s.version, chunk_id=c.chunk_id,
            quote=c.text[:400], locator=c.locator, source_url=s.provenance.source_url,
            license=s.provenance.license, attribution=s.provenance.attribution) for s, c in selected]
        draft = await call_draft(ctx, SYSTEM_PROMPT,
            {"question": p.question, "quotes": [e.quote for e in evidence]}, ReplyDraft,
            lambda: {"reply": evidence[0].quote})
        ensure_grounded(draft.reply, [e.quote for e in evidence])
        reply = draft.reply
    intent = any(word in p.question.casefold() for word in ("contact", "consult", "book", "request", "interested"))
    proposal = {"intent": "request_information", "status": "proposed", "owner": None,
                "requires_consent": True, "persisted": False} if intent else None
    if intent:
        missing.append("verified_lead_owner_and_consent")
    result = CommunityReply(**result_fields(ctx), status="insufficient_data" if missing else "draft",
        missing_facts=missing, reply=reply, citations=evidence, escalation_required=bool(missing),
        escalation_reason="missing_verified_context_or_lead_handoff" if missing else None, lead_proposal=proposal)
    return OperationOutcome(result=result.model_dump(mode="json"), evidence=evidence)
