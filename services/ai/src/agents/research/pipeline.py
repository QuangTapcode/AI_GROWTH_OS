"""research.run: grounded opportunities over worker-fetched approved sources."""
from __future__ import annotations

import json
import re
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
from .schemas import ResearchBrief, ResearchDraft, ResearchFinding, ResearchPayload, TrendCoverage, TrendSignal

PROMPT_VERSION = "research-v6"
SYSTEM_PROMPT = (Path(__file__).resolve().parents[3] / "prompts" / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")
# Search landscape rows shown to the model; the rest stay available for deterministic matching.
MAX_LANDSCAPE_IN_PROMPT = 12
MIN_QUOTE_WORDS = 6
DEMAND_CLAIM = re.compile(
    # Any mention of demand is a claim the brief cannot support, except stating it is not measured.
    r"\bdemand\b(?!\s+(?:is\s+)?not\s+measured)|\bsearch volume\b|\bmost[- ]searched\b",
    re.IGNORECASE,
)
LANDSCAPE_TALK = re.compile(r"\b(search(?:es|ed|ing)?|rank(?:s|ed|ing)?|landscape|serp|search results?|top results?)\b", re.IGNORECASE)


def profile_terms(payload: ResearchPayload) -> set[str]:
    profile = payload.business_profile
    goal = payload.goal_context
    parts = [*profile.products, *profile.services, *profile.audiences, *profile.locations, *profile.topic_priority,
             profile.industry or "", (goal.objective or "") if goal else ""]
    return terms(" ".join(part.replace("_", " ") for part in parts))


def movement(signal: TrendSignal) -> str:
    if signal.is_new:
        return "new"
    if signal.previous_rank is None:
        return "first_observation"
    change = signal.previous_rank - signal.rank
    return f"up {change}" if change > 0 else f"down {-change}" if change < 0 else "same"


def relevance(text: str, focus: set[str], trend: set[str]) -> float:
    # Profile fit dominates; overlap with ranking search titles breaks ties toward what people look for.
    return lexical_overlap(focus, text) + 0.5 * lexical_overlap(trend, text)


TITLE_FILLER = {"guide", "best", "top", "complete", "ultimate", "honest", "expat", "expats", "vietnam"}


def matching_signals(signals: list[TrendSignal], topic: str, keywords: list[str], locations: list[str],
                     quote: str = "") -> list[TrendSignal]:
    # Location and listicle words ("Da Nang", "best guide") appear in every result, so they never count.
    noise = terms(" ".join(locations)) | TITLE_FILLER
    wanted = terms(" ".join([topic, *keywords])) - noise
    cited = terms(quote) - noise - wanted
    scored = []
    for signal in signals:
        title = terms(signal.title) - noise
        named, quoted = len(wanted & title), len(cited & title)
        # One shared topic word (e.g. "coworking"), or two words shared with the quote ("long-term rentals").
        if named >= 1 or quoted >= 2:
            scored.append((named * 2 + quoted, signal))
    matched, seen = [], set()
    for _, signal in sorted(scored, key=lambda x: (-x[0], x[1].rank)):
        if str(signal.url) not in seen:
            seen.add(str(signal.url)); matched.append(signal)
    return matched[:5]


# Listing pages (e.g. Wikivoyage) date entries: "(updated Jan 2018)".
UPDATED_STAMP = re.compile(r"\(updated\s+(?:[A-Za-z]{3,9}\s+)?(\d{4})\)", re.IGNORECASE)
STALE_AFTER_YEARS = 3


def evidence_year(text: str) -> int | None:
    years = [int(year) for year in UPDATED_STAMP.findall(text)]
    return max(years) if years else None


# Hint words the discovery step appends to queries; they name the audience, not the topic.
QUERY_HINTS = {"expat", "expats"}


def has_term(word: str, words: set[str]) -> bool:
    return word in words or f"{word}s" in words or (word.endswith("s") and word[:-1] in words)


def trend_topics(signals: list[TrendSignal], locations: list[str]) -> list[tuple[str, str, list[str], int]]:
    """(query, topic, topic words, result count) per discovery query, e.g. "Da Nang coworking expats" -> coworking."""
    noise = terms(" ".join(locations)) | QUERY_HINTS
    topics = {}
    for signal in signals:
        if signal.query not in topics:
            words = [w for w in signal.query.lower().split() if w in terms(w) and w not in noise]
            topics[signal.query] = [words, 0]
        topics[signal.query][1] += 1
    return [(query, " ".join(words), words, count) for query, (words, count) in topics.items() if words]


def exact_quote(quote: str, text: str) -> str | None:
    """Locate a model quote in the chunk ignoring case/whitespace and return the exact source span.

    Downstream SEO/Content re-verify evidence with an exact substring check, so the
    stored quote must be the chunk's own text, not the model's re-typed version.
    """
    folded, origin = [], []
    for index, char in enumerate(text):
        if char.isspace():
            if folded and folded[-1] != " ":
                folded.append(" "); origin.append(index)
            continue
        folded.append(char.lower()); origin.append(index)
    needle = " ".join(quote.split()).lower()
    if not needle:
        return None
    start = "".join(folded).find(needle)
    if start < 0:
        return None
    return text[origin[start]:origin[start + len(needle) - 1] + 1]


def validate_research(job: JobRequest, payload: ResearchPayload, settings: Settings) -> list[tuple[str, str]]:
    problems = context_problems(job, payload.business_profile, payload.goal_context, payload.snapshot)
    if not job.context_snapshot_id or not payload.snapshot.snapshot_id:
        problems.append(("SNAPSHOT_REQUIRED", "Research requires a pinned context_snapshot_id and snapshot_id"))
    if payload.business_profile.version is None:
        problems.append(("PROFILE_VERSION_REQUIRED", "Research requires a versioned business profile"))
    if payload.workspace_id != job.workspace_id or any(x.workspace_id != job.workspace_id for x in payload.content_inventory):
        problems.append(("TENANT_SCOPE_VIOLATION", "Research payload/inventory belongs to another workspace"))
    if not job.constraints.human_approval_required:
        problems.append(("APPROVAL_REQUIRED", "Pilot research cannot disable human approval"))
    now = datetime.now(timezone.utc)
    if any(s.observed_at.tzinfo is None or s.observed_at > now for s in payload.trend_signals):
        problems.append(("INVALID_TREND_SIGNAL", "Trend signals need a past, timezone-aware observed_at"))
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
        # --- THÊM MÃ MỚI: check source đã thu hồi ---
        prov = source.provenance
        if getattr(prov, "revoked", False):
            missing.append("revoked_source")
            continue
        # -----------------
        for chunk in source.chunks:
            if chunk.chunk_id in candidates:
                raise OperationError("DUPLICATE_CHUNK_ID", "Research chunk IDs must be unique")
            # Sensitive facts belong to verified structured facts, not research excerpts.
            if has_price_claim(chunk.text) or sensitive_keys_in(chunk.text):
                # A filtered excerpt is a warning, not a missing business fact.
                warnings.append("SENSITIVE_EXCERPT_EXCLUDED")
                continue
            candidates[chunk.chunk_id] = (source, chunk, valid_url, fetched)

    profile = payload.business_profile.model_dump(mode="json", exclude_none=True)
    base = {"profile": profile,
            "goal": payload.goal_context.model_dump(mode="json", exclude_none=True) if payload.goal_context else None,
            "inventory": [x.title for x in payload.content_inventory],
            "search_landscape": [{"query": s.query, "rank": s.rank, "title": s.title, "domain": s.domain,
                                  "movement": movement(s)}
                                 for s in sorted(payload.trend_signals, key=lambda s: s.rank)[:MAX_LANDSCAPE_IN_PROMPT]],
            "excerpts": []}
    overhead = estimate_tokens(SYSTEM_PROMPT + json.dumps(ResearchDraft.model_json_schema()) + json.dumps(base))
    if overhead > ctx.settings.max_input_tokens:
        raise OperationError("CONTEXT_BUDGET_EXCEEDED", "Profile/goal/inventory exceeds the research input budget")
    selected = {}
    used = overhead
    # Long open sources (e.g. a whole city guide) exceed the budget; spend it on the most relevant excerpts.
    place = terms(" ".join(payload.business_profile.locations))
    focus = profile_terms(payload) - place
    trend = terms(" ".join(s.title for s in payload.trend_signals)) - place
    order = {key: index for index, key in enumerate(candidates)}
    by_relevance = sorted(candidates, key=lambda key: (-relevance(candidates[key][1].text, focus, trend), order[key]))
    # Each trend topic first gets its best covering excerpt, so budget follows what people search for.
    coverage, priority = [], []
    for query, topic, words, count in trend_topics(payload.trend_signals, payload.business_profile.locations):
        covering = [key for key in by_relevance if all(has_term(w, terms(candidates[key][1].text)) for w in words)]
        domains = {s.domain for s in payload.trend_signals if s.query == query}
        coverage.append(TrendCoverage(query=query, topic=topic, signal_count=count, covered_chunks=len(covering),
                                      distinct_domains=len(domains)))
        if covering:
            priority.append(covering[0])
        else:
            missing.append(f"source_gap:{topic}")
    ranked = list(dict.fromkeys(priority + by_relevance))
    base["topics"] = [c.topic for c in coverage if c.covered_chunks]
    used += estimate_tokens(json.dumps(base["topics"]))
    for key in ranked:
        chunk = candidates[key][1]
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
                "chunk_id": key, "quote": chunk.text[:400], "keywords": [topic],
                "user_need": "Understand local living options before making a decision."}]}
        draft = await ctx.call_json(system=SYSTEM_PROMPT, user=json.dumps(base, ensure_ascii=False),
                                    model=ResearchDraft, fake=fake)

    findings = []
    seen = set()
    for idea in draft.ideas:
        ref = selected.get(idea.chunk_id)
        quote = exact_quote(idea.quote, ref[1].text) if ref is not None else None
        if quote is None:
            warnings.append("UNGROUNDED_IDEA_DROPPED")
            continue
        if len(quote.split()) < MIN_QUOTE_WORDS:
            # A heading such as "Relax on My Khe Beach" cannot support an opportunity.
            warnings.append("WEAK_QUOTE_DROPPED")
            continue
        explanations = (idea.audience_fit, idea.offer_fit, idea.rationale, idea.user_need)
        if any(not text.strip().endswith((".", "!", "?")) for text in explanations):
            warnings.append("INCOMPLETE_BRIEF_DROPPED")
            missing.append("complete_research_explanation")
            continue
        narrative = " ".join((idea.topic, *explanations, *idea.keywords))
        grounding = [json.dumps(profile, ensure_ascii=False), ref[1].text]
        if unsupported_numbers(narrative, grounding) or has_price_claim(narrative) or sensitive_keys_in(narrative):
            warnings.append("UNSUPPORTED_CLAIM_DROPPED")
            continue
        if LANDSCAPE_TALK.search(" ".join((idea.audience_fit, idea.offer_fit, idea.rationale))):
            # Search context is attached by code (trend_signals); model claims about it are unverifiable.
            warnings.append("LANDSCAPE_CLAIM_DROPPED")
            continue
        if DEMAND_CLAIM.search(narrative):
            # Ranking titles show visibility, never measured demand.
            warnings.append("DEMAND_CLAIM_DROPPED")
            continue
        topic_key = " ".join(sorted(terms(idea.topic))) or idea.topic.casefold()
        if topic_key in seen or any(lexical_overlap(terms(idea.topic), x.title) >= 0.8 for x in payload.content_inventory):
            warnings.append("DUPLICATE_TOPIC_DROPPED")
            continue
        seen.add(topic_key)
        source, chunk, url, fetched = ref
        updated = evidence_year(chunk.text)
        if updated is not None and updated < datetime.now(timezone.utc).year - STALE_AFTER_YEARS:
            # Kept as a hypothesis, but reviewers must re-verify listing details before use.
            missing.append(f"stale_evidence:{updated}")
            warnings.append("STALE_EVIDENCE")
        evidence = EvidenceRef(source_id=source.source_id, source_version=source.version,
                               chunk_id=chunk.chunk_id, locator=chunk.locator, quote=quote,
                               source_url=url, license=source.provenance.license,
                               attribution=source.provenance.attribution)
        findings.append(ResearchFinding(topic=idea.topic, audience_fit=idea.audience_fit,
                         offer_fit=idea.offer_fit, rationale=idea.rationale,
                         evidence=evidence, url=url, fetched_at=fetched,
                         keywords=idea.keywords, user_need=idea.user_need, evidence_updated=updated,
                         trend_signals=matching_signals(payload.trend_signals, idea.topic, idea.keywords,
                                                       payload.business_profile.locations, quote)))
    if not findings:
        missing.append("grounded_opportunities")
        if "SENSITIVE_EXCERPT_EXCLUDED" in warnings:
            missing.append("no_eligible_chunks_after_guardrails")
    brief = ResearchBrief(brief_id=uuid5(NAMESPACE_URL, f"research:{ctx.job.job_id}:{ctx.job.input_version}"),
                          workspace_id=ctx.job.workspace_id, profile_version=payload.business_profile.version,
                          context_snapshot_id=payload.snapshot.snapshot_id,
                          status="ready_for_handoff" if findings else "insufficient_data",
                          findings=findings, missing_facts=sorted(set(missing)), trend_coverage=coverage,
                          synthetic=ctx.settings.provider_mode == "fake" or ctx.job.synthetic)
    return OperationOutcome(result=brief.model_dump(mode="json"),
                            evidence=[x.evidence for x in findings], warnings=sorted(set(warnings)))
