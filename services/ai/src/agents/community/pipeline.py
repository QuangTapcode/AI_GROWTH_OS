from pathlib import Path
import re
from ...app.runtime import OperationOutcome
from ...app.schemas import EvidenceRef
from ...guardrails.facts import sensitive_keys_in
from ...rag.retrieval import eligible_sources, lexical_overlap, terms, _STOPWORDS
from ..contracts import aware_past, call_draft, ensure_grounded, result_fields, validate_context
from .schemas import CommunityReply, ReplyDraft

PROMPT_VERSION = "community-v2"
PROMPT_FILE = Path(__file__).resolve().parents[3] / "prompts/community-v2.md"
if not PROMPT_FILE.exists():
    PROMPT_FILE = Path(__file__).resolve().parents[3] / "prompts/community-v1.md"
SYSTEM_PROMPT = PROMPT_FILE.read_text(encoding="utf-8")

_UNICODE_WORD = re.compile(r"[\w\u00C0-\u1EF9]+", re.UNICODE)
_INTENT_WORDS = (
    "contact", "consult", "book", "request", "interested", "rent", "housing", "apartment",
    "liên hệ", "tư vấn", "thuê", "đặt phòng", "giá", "quan tâm", "inbox", "ib", "alo", "nhà", "căn hộ"
)


def unicode_terms(text: str) -> set[str]:
    return {w.casefold() for w in _UNICODE_WORD.findall(text) if len(w) > 1 and w.casefold() not in _STOPWORDS}


def extract_contact_info(text: str) -> dict[str, str] | None:
    contact: dict[str, str] = {}
    phone_match = re.search(r"(?:(?:\+84|0)[3|5|7|8|9])\d{8}\b", text)
    if phone_match:
        contact["phone"] = phone_match.group(0)
    email_match = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
    if email_match:
        contact["email"] = email_match.group(0)
    return contact if contact else None


def validate_community(job, p, settings):
    return validate_context(job, p)


async def run_community(ctx):
    p = ctx.payload
    sensitive = sensitive_keys_in(p.question)
    sources, _ = eligible_sources(ctx.job, p.snapshot)

    q_terms = terms(p.question)
    q_u_terms = unicode_terms(p.question)

    candidates = [
        (max(lexical_overlap(q_terms, c.text), lexical_overlap(q_u_terms, c.text)), s, c)
        for s in sources if s.provenance and s.provenance.source_url
        and s.provenance.retrieved_at and aware_past(s.provenance.retrieved_at)
        for c in s.chunks
    ]
    candidates.sort(key=lambda item: item[0], reverse=True)
    selected = [(s, c) for score, s, c in candidates[:3] if score > 0]
    missing = [f"verified_fact:{key}" for key in sensitive]
    evidence = []

    if sensitive or not selected:
        if not selected:
            missing.append("grounded_answer")
        reply = "The verified information needed for this question is unavailable. A human needs to review it."
    else:
        evidence = [
            EvidenceRef(
                source_id=s.source_id,
                source_version=s.version,
                chunk_id=c.chunk_id,
                quote=c.text[:400],
                locator=c.locator,
                source_url=s.provenance.source_url,
                license=s.provenance.license,
                attribution=s.provenance.attribution,
            )
            for s, c in selected
        ]
        draft = await call_draft(
            ctx,
            SYSTEM_PROMPT,
            {"question": p.question, "quotes": [e.quote for e in evidence]},
            ReplyDraft,
            lambda: {"reply": evidence[0].quote},
        )
        ensure_grounded(draft.reply, [e.quote for e in evidence])
        reply = draft.reply

    q_lower = p.question.casefold()
    intent = any(word in q_lower for word in _INTENT_WORDS)
    contact = extract_contact_info(p.question)

    proposal = None
    if intent or contact:
        proposal = {
            "intent": "request_information",
            "status": "proposed",
            "owner": None,
            "requires_consent": True,
            "persisted": False,
        }
        if contact:
            proposal["contact"] = contact
        missing.append("verified_lead_owner_and_consent")

    result = CommunityReply(
        **result_fields(ctx),
        status="insufficient_data" if missing else "draft",
        missing_facts=missing,
        reply=reply,
        citations=evidence,
        escalation_required=bool(missing),
        escalation_reason="missing_verified_context_or_lead_handoff" if missing else None,
        lead_proposal=proposal,
    )
    return OperationOutcome(result=result.model_dump(mode="json"), evidence=evidence)
