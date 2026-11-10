from pathlib import Path
import re
import unicodedata
from ...app.providers import ProviderError
from ...app.runtime import OperationError, OperationOutcome
from ...app.schemas import EvidenceRef
from ...guardrails.facts import sensitive_keys_in
from ...guardrails.support import strip_unsupported
from ...rag.ingest import document_embedding_input, query_embedding_input
from ...rag.retrieval import cosine, eligible_sources, lexical_overlap, terms, _STOPWORDS
from ..contracts import aware_past, call_draft, call_grounded_draft, ensure_grounded, result_fields, validate_context
from ..copy_quality import drop_broken_sentences, has_cjk
from .schemas import CommunityReply, ReplyDraft

PROMPT_VERSION = "community-v3"
PROMPT_FILE = Path(__file__).resolve().parents[3] / f"prompts/{PROMPT_VERSION}.md"
SYSTEM_PROMPT = PROMPT_FILE.read_text(encoding="utf-8")
HANDOFF_REPLY = "The verified information needed for this question is unavailable. A human needs to review it."
VIETNAMESE_HELPFUL_FALLBACK = (
    "Chào bạn! Cảm ơn bạn đã liên hệ TripC. Hiện tại cẩm nang của chúng tôi đang liên tục cập nhật thêm "
    "thông tin chi tiết về chủ đề này. Bạn có thể tham gia thảo luận cùng người dân địa phương và cộng đồng "
    "tại nhóm Facebook của chúng tôi: https://www.facebook.com/groups/1134282109069209 để nhận được gợi ý nhanh nhất nhé!"
)
# Words of asking, not subjects: a source need not contain them to answer.
QUESTION_WORDS = {"please", "help", "find", "good", "best", "recommend", "suggest", "explain", "tell", "know", "need", "want",
                  "looking", "look", "where", "what", "which", "when", "there", "can", "could", "would", "should", "like",
                  "nice", "great", "try", "get", "go", "hi", "hello", "thanks", "thank", "you", "tripc", "anyone", "any"}
# The model saying its sources have no answer, or talking about them, is not an answer for a customer.
MIN_CHUNKS_FOR_ABSENCE = 100
# Measured on the real corpus with embeddinggemma (17 questions, 430 chunks): questions the sources can answer
# peak at 0.53-0.77; unrelated or unstated ones at 0.18-0.47, with one listing match at 0.52.
MIN_SIMILARITY = 0.5
# Below every question the corpus relates to (the lowest was 0.37): a shared word here is a coincidence.
MIN_RELATED_SIMILARITY = 0.3
LEXICAL_WEIGHT = 0.25
MAX_LIVE_EMBEDDINGS = 64
NO_ANSWER = re.compile(
    r"NO_ANSWER|\b(?:no mention|(?:does|do) not (?:mention|say|state|include|specify)|no information"
    r"|\bmentioned\b|provided (?:information|quotes?|excerpts?|sources?)|the (?:quotes?|excerpts?)\b"
    # Guessing beyond the quotes.
    r"|there (?:may|might|could) be|(?:may|might) (?:also )?(?:be available|offer|have)"
    r"|is not (?:offered|provided|sold))\b"
    r"|không có thông tin|không được đề cập|thông tin được cung cấp|chúng tôi không (?:bán|cung cấp|có)",
    re.IGNORECASE,
)

_UNICODE_WORD = re.compile(r"[\w\u00C0-\u1EF9]+", re.UNICODE)
_GREETING_WORDS = {"hi", "hello", "hey", "chao", "morning", "afternoon", "evening", "alo"}
# Who is greeted, or the words around a greeting. Any other word makes the message a question.
_AROUND_A_GREETING = {"xin", "good", "there", "shop", "ad", "admin", "ban", "baj", "banj", "oi", "team", "tripc", "anh", "chi", "em", "minh"}
_VIETNAMESE_GREETING = {"chao", "xin", "ban", "baj", "banj", "oi", "anh", "chi", "em", "alo", "minh", "toi", "du", "lich"}
_VIETNAMESE_INQUIRY_WORDS = {"toi", "minh", "muon", "di", "du", "lich", "tu", "van", "ho", "tro", "cho", "hoi", "da", "nang", "phu", "quoc", "hoi", "an", "visa", "evisa"}
_CONVERSATIONAL_SIGNAL_WORDS = {
    "cam", "thank", "thanks", "bot", "ly", "giup", "help",
    "cong", "dong", "group", "nhom", "community", "facebook", "fb",
    "kenh", "telegram", "goi", "info", "information", "gioi", "thieu",
    "chao", "hi", "hello", "hey", "morning", "afternoon", "evening", "alo",
    "khoe", "ten", "tuvan",
}
_CONVERSATIONAL_FILLER_WORDS = {
    "xin", "ban", "baj", "banj", "oi", "ad", "admin", "shop", "team", "tripc",
    "minh", "toi", "tui", "t", "m", "em", "anh", "chi", "on", "nhieu", "lam",
    "nha", "nhe", "nhi", "a", "ne", "day", "luon", "roi",
    "la", "ai", "gi", "vay", "the", "nao", "sao", "duoc", "khong", "ko", "k",
    "co", "cho", "voi", "cung", "nhau", "chung", "ta", "ve", "di", "du", "lich",
    "muon", "tim", "hieu", "them", "hoi", "tham", "tu", "van", "ho", "tro",
    "noi", "tro", "chuyen", "moi", "nguoi", "can", "ke", "nghe",
    "you", "your", "are", "who", "what", "how", "me", "please", "chat", "talk",
    "about", "more", "join", "tell", "for", "good", "there", "very", "much",
    "so", "nice", "great", "ok", "okay", "vui", "long", "ten", "khoe",
}
_VIETNAMESE_LETTER = re.compile(r"[\u00C0-\u1EF9]")
# Whole words: "possible" is not "ib", "different" is not "rent", and a restaurant or a review asks for no home or price.
LEAD_INTENT = re.compile(
    r"\b(?:contact\w*|consult\w*|book(?:s|ed|ing|ings)?|request\w*|interested|rent(?:s|ed|al|als|ing)?|housing|apartments?"
    r"|liên hệ|tư vấn|thuê|đặt phòng|(?<!đánh )giá|quan tâm|inbox|ib|alo|nhà(?! (?:hàng|sách|thờ|hát|ga|thuốc))|căn hộ)\b",
    re.IGNORECASE,
)


def unicode_terms(text: str) -> set[str]:
    raw_words = {w.casefold() for w in _UNICODE_WORD.findall(text) if len(w) > 1}
    unaccented = {
        "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn")
        for w in raw_words
    }
    all_words = raw_words | unaccented
    return {w for w in all_words if len(w) > 1 and (w not in _STOPWORDS or w in {"an", "in", "to", "do", "me"})}


def plain_words(text: str) -> set[str]:
    plain = "".join(c for c in unicodedata.normalize("NFD", text.casefold()) if unicodedata.category(c) != "Mn").replace("đ", "d")
    return set(_UNICODE_WORD.findall(plain))


def is_greeting(text: str) -> bool:
    words = plain_words(text)
    if bool(words & _GREETING_WORDS) and words <= _GREETING_WORDS | _AROUND_A_GREETING:
        return True
    # Open-ended Vietnamese travel/greeting opener (e.g. "tôi muốn đi du lịch", "mình muốn đi du lịch")
    if {"du", "lich"} <= words and words <= _VIETNAMESE_INQUIRY_WORDS | _GREETING_WORDS | _AROUND_A_GREETING:
        return True
    return False


def is_conversational_opener(text: str) -> bool:
    """Conversational openers (thanks, bot identity, general help, community intro) with no ungrounded domain nouns."""
    words = plain_words(text)
    return bool(words) and bool(words & _CONVERSATIONAL_SIGNAL_WORDS) and words <= _CONVERSATIONAL_SIGNAL_WORDS | _CONVERSATIONAL_FILLER_WORDS


def is_vietnamese_question(text: str) -> bool:
    return bool(_VIETNAMESE_LETTER.search(text)) or bool(plain_words(text) & (_VIETNAMESE_GREETING | _VIETNAMESE_INQUIRY_WORDS))


def welcome(greeting: str) -> str:
    return "Xin chào! Mình có thể giúp gì cho bạn?" if plain_words(greeting) & _VIETNAMESE_GREETING else "Hello! How can I help you?"


def welcome_needed(reply: str, greeting: str) -> bool:
    """The model's welcome was refused, or followed Vietnamese quotes instead of an English greeting."""
    return not reply or (bool(_VIETNAMESE_LETTER.search(reply)) and not plain_words(greeting) & _VIETNAMESE_GREETING)


def extract_contact_info(text: str) -> dict[str, str] | None:
    contact: dict[str, str] = {}
    phone_match = re.search(r"(?:(?:\+84|0)[3|5|7|8|9])\d{8}\b", text)
    if phone_match:
        contact["phone"] = phone_match.group(0)
    email_match = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
    if email_match:
        contact["email"] = email_match.group(0)
    return contact if contact else None


def denies_for_the_business(reply: str, company: str) -> bool:
    """No quote says what the business will not do, and only the owner knows: a person answers that."""
    return bool(re.search(rf"\b(?:i|we|{re.escape(company)}) (?:do not|does not|don't|doesn't|cannot|can't|will not|won't)\b",
                          reply.replace("\u2019", "'"), re.IGNORECASE))


def finished_reply(reply: str, question: str, grounding: list[str], company: str = "") -> str:
    """The part of a drafted reply that may reach a customer; empty when the draft does not answer."""
    if NO_ANSWER.search(reply) or denies_for_the_business(reply, company or "we"):
        return ""
    clean, _ = drop_broken_sentences(reply, keep_cjk=has_cjk(question), grounding=grounding)
    # Lexical English stem overlap only applies when question and grounding share the same language;
    # stripping Vietnamese sentences against English grounding would erase valid Vietnamese translations.
    if not is_vietnamese_question(question):
        clean, _ = strip_unsupported(clean, grounding)
    return clean


async def similarity_by_chunk(ctx, question, chunks):
    """Cosine between the question and each chunk, reusing the vectors stored at ingest.

    An embedding outage must not stop a customer's answer: keywords still find a grounded source.
    """
    model = ctx.provider.embedding_model_version
    stored = {c.chunk_id: c.embedding for _, c in chunks
              if c.embedding and c.model == model and len(c.embedding) == ctx.settings.embedding_dim}
    missing = [(s, c) for s, c in chunks if c.chunk_id not in stored]
    # Too many to embed while the customer waits; those chunks can still match by keyword.
    warnings = [f"RETRIEVAL_KEYWORDS_ONLY_FOR_CHUNKS:{len(missing)}"] if len(missing) > MAX_LIVE_EMBEDDINGS else []
    if warnings:
        missing = []
    try:
        vectors = await ctx.embed([query_embedding_input(question), *(document_embedding_input(s.title, c.text) for s, c in missing)])
    except (ProviderError, OperationError) as error:
        return {}, [f"RETRIEVAL_KEYWORDS_ONLY:{error.code}"]
    stored.update((c.chunk_id, vector) for (_, c), vector in zip(missing, vectors[1:]))
    return {chunk_id: cosine(vectors[0], vector) for chunk_id, vector in stored.items()}, warnings


def validate_community(job, p, settings):
    return validate_context(job, p)


async def run_community(ctx):
    p = ctx.payload
    sensitive = sensitive_keys_in(p.question)
    sources, _ = eligible_sources(ctx.job, p.snapshot)

    q_terms = terms(p.question)
    q_u_terms = unicode_terms(p.question)
    # Earlier questions steer which source a follow-up reads. Whether a source answers at all is decided by this one.
    earlier = " ".join(turn.question for turn in p.history)
    earlier_terms = terms(earlier)
    earlier_u_terms = unicode_terms(earlier)

    chunks = [
        (s, c) for s in sources if s.provenance and s.provenance.source_url
        and s.provenance.retrieved_at and aware_past(s.provenance.retrieved_at)
        for c in s.chunks
    ]
    similarity, warnings = await similarity_by_chunk(ctx, p.question, chunks)
    # A follow-up ("which one...?") is searched together with the question it follows; whether a source answers it is judged on its own.
    in_context = similarity
    if p.history:
        in_context, _ = await similarity_by_chunk(ctx, f"{p.history[-1].question} {p.question}", chunks)
    scored = [(similarity.get(c.chunk_id, 0.0), max(lexical_overlap(q_terms, c.text), lexical_overlap(q_u_terms, c.text)), s, c)
              for s, c in chunks]
    follows_up = lambda text: max(lexical_overlap(earlier_terms, text), lexical_overlap(earlier_u_terms, text))
    scored.sort(key=lambda item: in_context.get(item[3].chunk_id, item[0]) + LEXICAL_WEIGHT * (item[1] + follows_up(item[3].text)), reverse=True)
    selected = [(s, c) for meaning, words, s, c in scored if words > 0 or meaning >= MIN_SIMILARITY][:3]
    known = terms(" ".join(c.text for _, c in chunks))
    # A subject no approved source mentions cannot be answered from them; a model would only guess.
    # Absence says something only in a corpus large enough to use ordinary words, and only
    # when no source is close in meaning: a paraphrase uses words the sources do not.
    if (len(chunks) >= MIN_CHUNKS_FOR_ABSENCE and q_terms - known - QUESTION_WORDS
            and not any(meaning >= MIN_SIMILARITY for meaning, *_ in scored)):
        selected = []
    # Fake-mode vectors only hash words, so they carry no meaning to judge by.
    if (ctx.settings.provider_mode != "fake" and len(similarity) == len(chunks)
            and all(meaning < MIN_RELATED_SIMILARITY for meaning, *_ in scored)):
        selected = []
    # A greeting or safe conversational opener (no ungrounded domain nouns) lets the model welcome and introduce topics.
    if not selected and (is_greeting(p.question) or (not sensitive and is_conversational_opener(p.question))):
        selected = [(s, c) for _, _, s, c in scored[:3]]
    missing = [f"verified_fact:{fact.key}" for fact in sensitive]
    evidence = []

    if sensitive or not selected:
        if not selected:
            missing.append("grounded_answer")
        reply = VIETNAMESE_HELPFUL_FALLBACK if is_vietnamese_question(p.question) else HANDOFF_REPLY
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
        grounding = [c.text for s, c in selected]
        draft_input = {"question": p.question, "quotes": [e.quote for e in evidence]}
        if p.history:
            draft_input["history"] = [turn.model_dump(exclude_none=True) for turn in p.history]
        draft = await call_grounded_draft(
            ctx,
            SYSTEM_PROMPT,
            draft_input,
            ReplyDraft,
            lambda: {"reply": evidence[0].quote},
            lambda d: d.reply,
            grounding,
        )
        # A welcome states no fact, so a greeting need not reach a person when the model's own one is refused.
        reply = finished_reply(draft.reply, p.question, grounding, p.business_profile.company)
        if is_greeting(p.question) and welcome_needed(reply, p.question):
            reply = welcome(p.question)
        if not reply:
            # Better a polite fallback or community handoff than the customer reading internal error.
            reply, evidence = (VIETNAMESE_HELPFUL_FALLBACK if is_vietnamese_question(p.question) else HANDOFF_REPLY), []
            missing.append("grounded_answer")

    intent = LEAD_INTENT.search(p.question)
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
    return OperationOutcome(result=result.model_dump(mode="json"), evidence=evidence, warnings=warnings)
