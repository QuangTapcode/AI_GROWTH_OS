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
from ..contracts import artifact_problems
from .quality import GENERIC, concepts, quality_checks
from .strategy import topic_alignment, priority_order, strategy_missing_data
from .schemas import ResearchBrief, ResearchDraft, ResearchFinding, ResearchIdea, ResearchPayload, SearchMetricsSnapshot, TrendCoverage, TrendSignal

PROMPT_VERSION = "research-v8"
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
KEYWORD_LIST = re.compile(r"\bKeywords:\s*(?:[^,.:]{1,60},\s*){3,}", re.IGNORECASE)
GROWTH_CLAIM = re.compile(r"\b(?:growing|surging|booming|trending|rising demand|increasing demand|fastest.growing)\b|đang tăng trưởng|nhu cầu (?:đang )?tăng|xu hướng tăng", re.IGNORECASE)


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


def cited_by_inventory(quote: str, inventory) -> bool:
    """Existing content was already built on this exact excerpt."""
    needle = " ".join(quote.split()).casefold()
    return any(" ".join(q.split()).casefold() == needle for item in inventory for q in item.evidence_quotes)


def chunk_has_content(chunk_id: str, inventory) -> bool:
    """Existing content cites this source chunk; another sentence of it would repeat that content."""
    return any(chunk_id in item.evidence_chunk_ids for item in inventory)


def topic_has_content(topic: str, inventory) -> bool:
    """An existing article title already covers this topic (same rule for model and fallback ideas)."""
    return any(lexical_overlap(terms(topic), item.title) >= 0.8 for item in inventory)


def offer_for_topic(topic: str, profile) -> str | None:
    """Confirmed product/service named by the topic itself; an unrelated first offer is never assumed."""
    wanted = concepts(topic) - terms(" ".join(profile.locations)) - GENERIC
    for offer in [*profile.products, *profile.services]:
        name = offer.replace("_", " ")
        if any(has_term(word, wanted) for word in terms(name) - GENERIC):
            return name
    return None


def complete_sentence(value: str) -> str:
    """Normalize model prose without changing its claim or adding facts.

    Small local models frequently omit terminal punctuation even when the
    explanation is otherwise complete. Dropping the entire grounded idea for
    that formatting defect made a valid excerpt look like insufficient data.
    """

    text = " ".join(value.split()).strip()
    if not text:
        return text
    return text if text.endswith((".", "!", "?")) else f"{text}."


FALLBACK_QUOTE_CHARS = 400  # ResearchIdea.quote max_length
SENTENCE_BREAK = re.compile(r"(?<=[.!?])\s+")


def fallback_quote(text: str, topic_words: list[str], locations: list[str] = ()) -> str:
    """Return whole source sentences naming the topic, else a short exact window around it."""

    # Reviewers read the quote as evidence; a window cut mid-sentence ("too, with ...")
    # hides what the source actually says.
    specific = set(topic_words) - GENERIC
    places = [terms(location) for location in locations if terms(location)]
    sentences = SENTENCE_BREAK.split(" ".join(text.split()))
    # Prefer a sentence about the profile's location: a comparison article may name
    # the topic first for another city ("Ho Chi Minh City has the largest coworking scene").
    scored = [(sum(has_term(w, terms(s)) for w in specific), any(p <= terms(s) for p in places), -i)
              for i, s in enumerate(sentences)]
    hits, _, index = max(scored, default=(0, False, 0))
    if hits:
        quote = sentences[-index]
        for following in sentences[-index + 1:]:
            # A lone short sentence may be a heading; extend it while the brief limit allows.
            if len(quote.split()) >= 12 or len(quote) + 1 + len(following) > FALLBACK_QUOTE_CHARS:
                break
            quote = f"{quote} {following}"
        if len(quote) <= FALLBACK_QUOTE_CHARS:
            return quote

    words = text.split()
    wanted = set(topic_words)
    positions = [index for index, word in enumerate(words) if wanted.intersection(terms(word))]
    # Anchor on the last matching term: broad words such as "local" are
    # intentionally ignored by the quality rubric, so the quote must retain
    # the more specific term (for example, "experiences").
    start = max(0, max(positions) - 20) if positions else 0
    end = min(len(words), start + 55)
    quote = " ".join(words[start:end])
    return quote[:FALLBACK_QUOTE_CHARS].rsplit(" ", 1)[0] if len(quote) > FALLBACK_QUOTE_CHARS else quote


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
    if payload.search_metrics:
        problems += artifact_problems(job, payload.search_metrics, "research")
        try:
            metrics = SearchMetricsSnapshot.model_validate(payload.search_metrics.result)
            if (metrics.window_end < metrics.window_start or metrics.window_end >= now.date()
                    or metrics.observed_at.tzinfo is None or metrics.observed_at > now
                    or metrics.observed_at.date() <= metrics.window_end):
                problems.append(("INVALID_SEARCH_METRICS_WINDOW", "Use a completed past GSC window and a subsequent observation timestamp"))
        except ValidationError:
            problems.append(("INVALID_SEARCH_METRICS", "Invalid scoped GSC snapshot"))
    return problems


async def run_research(ctx: RunContext) -> OperationOutcome:
    payload: ResearchPayload = ctx.payload
    sources, excluded = eligible_sources(ctx.job, payload.snapshot)
    warnings = [f"EXCLUDED_SOURCES:{excluded}"] if excluded else []
    candidates = {}
    now = datetime.now(timezone.utc)
    missing = []
    search_metrics = SearchMetricsSnapshot.model_validate(payload.search_metrics.result) if payload.search_metrics else None
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
                # A filtered excerpt is a warning, not a missing business fact.
                warnings.append("SENSITIVE_EXCERPT_EXCLUDED")
                continue
            if KEYWORD_LIST.search(chunk.text):
                # Page metadata lists every SEO keyword, so it out-ranks real articles
                # while saying nothing about any topic.
                warnings.append("METADATA_EXCERPT_EXCLUDED")
                continue
            candidates[chunk.chunk_id] = (source, chunk, valid_url, fetched)

    profile = payload.business_profile.model_dump(mode="json", exclude_none=True, exclude={'research_strategy', 'competitors'})
    base = {"profile": profile,
            "goal": payload.goal_context.model_dump(mode="json", exclude_none=True) if payload.goal_context else None,
            # Model avoidance is a hint; deterministic dedup below still checks all 100 items.
            "inventory": [x.title for x in payload.content_inventory[:12]],
            "search_landscape": [{"query": s.query, "rank": s.rank, "title": s.title, "domain": s.domain,
                                  "movement": movement(s)}
                                 for s in sorted(payload.trend_signals, key=lambda s: s.rank)[:MAX_LANDSCAPE_IN_PROMPT]],
            "excerpts": []}
    if payload.business_profile.research_strategy:
        strategy = payload.business_profile.research_strategy
        base['editorial_strategy'] = {
            'status': strategy.status,
            'topics': [{'id': t.id, 'title': t.title, 'priority': t.priority, 'query_terms': t.query_terms} for t in strategy.topics],
            'competitor_lessons': [c.get('lesson', '') for c in strategy.competitor_references],
        }
    # Query text helps select excerpts; measurements are attached in code, never invented by the model.
    if search_metrics:
        base["website_queries"] = [r.query for r in search_metrics.rows[:10]]
    def prompt_overhead():
        return estimate_tokens(SYSTEM_PROMPT + json.dumps(ResearchDraft.model_json_schema()) + json.dumps(base))
    # Keep room for source evidence. Search metadata and title hints are optional;
    # the complete inventory/signals remain available to the deterministic checks.
    while prompt_overhead() > ctx.settings.max_input_tokens - 400 and (base['inventory'] or base['search_landscape']):
        if base['inventory']:
            base['inventory'].pop()
        elif base['search_landscape']:
            base['search_landscape'].pop()
    overhead = prompt_overhead()
    if overhead > ctx.settings.max_input_tokens:
        raise OperationError("CONTEXT_BUDGET_EXCEEDED", "Profile/goal/inventory exceeds the research input budget")
    selected = {}
    used = overhead
    # Long open sources (e.g. a whole city guide) exceed the budget; spend it on the most relevant excerpts.
    place = terms(" ".join(payload.business_profile.locations))
    focus = profile_terms(payload) - place
    trend = terms(" ".join(s.title for s in payload.trend_signals)) - place
    if search_metrics:
        trend |= terms(" ".join(r.query for r in search_metrics.rows[:10])) - place
    order = {key: index for index, key in enumerate(candidates)}
    by_relevance = sorted(candidates, key=lambda key: (
        priority_order(topic_alignment(candidates[key][1].text, payload.business_profile)),
        -relevance(candidates[key][1].text, focus, trend), order[key]))
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
                "audience_fit": f"Explore {topic.lower()} for {(payload.business_profile.audiences or ['the target audience'])[0]}.",
                "offer_fit": f"Relates to {', '.join(payload.business_profile.products + payload.business_profile.services) or 'an offer needing confirmation'}.",
                "rationale": "The cited excerpt supports a content hypothesis; demand is not measured.",
                "chunk_id": key, "quote": chunk.text[:400], "keywords": [topic],
                "user_need": f"Understand {topic.lower()} before making a decision."}]}
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
        audience_fit, offer_fit, rationale, user_need = explanations
        narrative = " ".join((idea.topic, *explanations, *idea.keywords))
        grounding = [json.dumps(profile, ensure_ascii=False), ref[1].text]
        if unsupported_numbers(narrative, grounding) or has_price_claim(narrative) or sensitive_keys_in(narrative):
            warnings.append("UNSUPPORTED_CLAIM_DROPPED")
            continue
        if LANDSCAPE_TALK.search(" ".join((idea.audience_fit, idea.offer_fit, idea.rationale))):
            # Search context is attached by code (trend_signals); model claims about it are unverifiable.
            warnings.append("LANDSCAPE_CLAIM_DROPPED")
            continue
        if DEMAND_CLAIM.search(narrative) or GROWTH_CLAIM.search(narrative):
            # Ranking titles show visibility, never measured demand.
            warnings.append("DEMAND_CLAIM_DROPPED")
            continue
        topic_key = " ".join(sorted(terms(idea.topic))) or idea.topic.casefold()
        if (topic_key in seen or topic_has_content(idea.topic, payload.content_inventory)
                or cited_by_inventory(quote, payload.content_inventory)
                or chunk_has_content(idea.chunk_id, payload.content_inventory)):
            warnings.append("DUPLICATE_TOPIC_DROPPED")
            continue
        checks = quality_checks(idea, quote, payload.business_profile)
        if not checks["topic_supported_by_quote"]:
            warnings.append("OFF_TOPIC_EVIDENCE_DROPPED")
            continue
        if (payload.business_profile.products or payload.business_profile.services) and not checks["offer_matches_profile"]:
            warnings.append("OFF_PROFILE_OFFER_DROPPED")
            continue
        if not checks["specific_user_need"]:
            warnings.append("VAGUE_USER_NEED_DROPPED")
            continue
        if payload.business_profile.audiences and not checks["audience_matches_profile"]:
            warnings.append("AUDIENCE_MISMATCH_DROPPED")
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
        wanted = terms(" ".join([idea.topic, *idea.keywords, quote])) - place - TITLE_FILLER
        query_metrics = [row for row in search_metrics.rows if wanted & (terms(row.query) - place - TITLE_FILLER)][:5] if search_metrics else []
        missing_data = ["market_search_volume_not_measured", "semantic_review_required"]
        missing_data += strategy_missing_data(idea, payload.business_profile, url)
        if not query_metrics:
            missing_data.append("website_query_metrics_not_available_for_topic")
        if (now - fetched).days > 90 or (updated is not None and updated < now.year - STALE_AFTER_YEARS):
            missing_data.append("source_freshness_requires_reverification")
        findings.append(ResearchFinding(topic=idea.topic, audience_fit=audience_fit,
                         offer_fit=offer_fit, rationale=rationale,
                         evidence=evidence, url=url, fetched_at=fetched,
                         keywords=idea.keywords, user_need=user_need, evidence_updated=updated,
                         source_facts=[quote], hypotheses=list(explanations), missing_data=missing_data,
                         strategy_alignment=topic_alignment(' '.join([idea.topic, *idea.keywords, idea.user_need]), payload.business_profile),
                         quality_checks={**checks, "traceable_source": True, "not_duplicate": True},
                         website_search_metrics=query_metrics,
                         trend_signals=matching_signals(payload.trend_signals, idea.topic, idea.keywords,
                                                       payload.business_profile.locations, quote)))
    # Search discovery can identify a supported topic while a small local model
    # returns an incomplete or off-topic draft. In that case, recover one
    # conservative hypothesis directly from the approved excerpt. This keeps
    # the citation chain intact and never turns ranking metadata into evidence.
    if (not findings and payload.trend_signals and candidates and
            not any(warning in warnings for warning in
                    ("DEMAND_CLAIM_DROPPED", "UNSUPPORTED_CLAIM_DROPPED", "DUPLICATE_TOPIC_DROPPED"))):
        fallback = None
        # Topics about what the owner asked for (e.g. food) come before other search topics.
        focus = {o.replace("_", " ") for o in (payload.goal_context.focus_offers if payload.goal_context else [])}
        topics = sorted(trend_topics(payload.trend_signals, payload.business_profile.locations),
                        key=lambda t: offer_for_topic(t[1], payload.business_profile) not in focus)
        for _, topic, words, _ in topics:
            offer = offer_for_topic(topic, payload.business_profile)
            if offer is None:
                # e.g. "transport": covered by sources, but TripC has no confirmed offer to relate it to.
                warnings.append("FALLBACK_NO_MATCHING_OFFER")
                continue
            if topic_has_content(topic, payload.content_inventory):
                warnings.append("DUPLICATE_TOPIC_DROPPED")
                continue
            for key in ranked:
                if key not in candidates:
                    continue
                # The model prompt is budgeted, but a deterministic recovery
                # may cite any approved, guardrail-clean chunk. It does not
                # rely on a claim produced by the model.
                source, chunk, url, fetched = candidates[key]
                if all(has_term(word, terms(chunk.text)) for word in words):
                    if chunk_has_content(key, payload.content_inventory) or cited_by_inventory(
                            fallback_quote(chunk.text, words, payload.business_profile.locations), payload.content_inventory):
                        # Learning rounds reuse the same search topics; never rebuild an article on the same excerpt.
                        warnings.append("DUPLICATE_TOPIC_DROPPED")
                        continue
                    fallback = (topic, words, offer, key, source, chunk, url, fetched)
                    break
            if fallback:
                break
        if fallback:
            topic, words, offer, key, source, chunk, url, fetched = fallback
            quote = fallback_quote(chunk.text, words, payload.business_profile.locations)
            audience = payload.business_profile.audiences[0] if payload.business_profile.audiences else "the target audience"
            location = payload.business_profile.locations[0] if payload.business_profile.locations else "the target market"
            try:
                idea = ResearchIdea(
                    topic=topic,
                    audience_fit=complete_sentence(f"{audience} may use a practical guide to {topic} in {location}"),
                    offer_fit=complete_sentence(f"TripC can relate this topic to its {offer} offering"),
                    rationale=complete_sentence("The approved excerpt supports this content hypothesis; demand is not measured"),
                    chunk_id=key,
                    quote=quote,
                    keywords=words[:5] or [topic],
                    user_need=complete_sentence(f"{audience} need a practical way to evaluate {topic} before deciding what to do"),
                )
            except ValidationError:
                # A long profile audience or topic can exceed the brief limits; the recovery
                # path must report that, not fail the whole run.
                warnings.append("FALLBACK_INVALID_DRAFT")
                idea = None
            quote = exact_quote(idea.quote, chunk.text) if idea else None
            if quote and len(quote.split()) >= MIN_QUOTE_WORDS:
                checks = quality_checks(idea, quote, payload.business_profile)
                if checks["topic_supported_by_quote"] and checks["offer_matches_profile"] and checks["specific_user_need"] and checks["audience_matches_profile"]:
                    updated = evidence_year(chunk.text)
                    evidence = EvidenceRef(source_id=source.source_id, source_version=source.version,
                                           chunk_id=chunk.chunk_id, locator=chunk.locator, quote=quote,
                                           source_url=url, license=source.provenance.license,
                                           attribution=source.provenance.attribution)
                    missing_data = ["market_search_volume_not_measured", "semantic_review_required"]
                    missing_data += strategy_missing_data(idea, payload.business_profile, url)
                    missing_data.append("website_query_metrics_not_available_for_topic")
                    if (now - fetched).days > 90 or (updated is not None and updated < now.year - STALE_AFTER_YEARS):
                        missing_data.append("source_freshness_requires_reverification")
                    findings.append(ResearchFinding(
                        topic=idea.topic, audience_fit=idea.audience_fit, offer_fit=idea.offer_fit,
                        rationale=idea.rationale, evidence=evidence, url=url, fetched_at=fetched,
                        keywords=idea.keywords, user_need=idea.user_need, evidence_updated=updated,
                        source_facts=[quote], hypotheses=[idea.audience_fit, idea.offer_fit, idea.rationale, idea.user_need],
                        missing_data=missing_data, strategy_alignment=topic_alignment(
                            " ".join([idea.topic, *idea.keywords, idea.user_need]), payload.business_profile),
                        quality_checks={**checks, "traceable_source": True, "not_duplicate": True},
                        website_search_metrics=[], trend_signals=matching_signals(
                            payload.trend_signals, idea.topic, idea.keywords,
                            payload.business_profile.locations, quote),
                    ))
                    warnings.append("GROUNDED_FALLBACK_USED")

    if not findings:
        missing.append("grounded_opportunities")
        if not candidates and "SENSITIVE_EXCERPT_EXCLUDED" in warnings:
            missing.append("no_eligible_chunks_after_guardrails")
    brief = ResearchBrief(brief_id=uuid5(NAMESPACE_URL, f"research:{ctx.job.job_id}:{ctx.job.input_version}"),
                          workspace_id=ctx.job.workspace_id, profile_version=payload.business_profile.version,
                          context_snapshot_id=payload.snapshot.snapshot_id,
                          status="ready_for_handoff" if findings else "insufficient_data",
                          findings=findings, missing_facts=sorted(set(missing)), trend_coverage=coverage,
                          kpis=[k.model_dump(mode="json") for k in payload.goal_context.kpis] if payload.goal_context else [],
                          search_metrics_ref=payload.search_metrics.artifact if payload.search_metrics else None,
                          measurement_status=("available" if any(f.website_search_metrics for f in findings) else "no_matching_queries") if search_metrics else "unavailable",
                          measurement_missing_facts=[] if search_metrics and search_metrics.rows else [payload.search_metrics_missing_reason if not search_metrics else "gsc_no_query_rows"],
                          synthetic=ctx.settings.provider_mode == "fake" or ctx.job.synthetic or bool(search_metrics and search_metrics.synthetic))
    return OperationOutcome(result=brief.model_dump(mode="json"),
                            evidence=[x.evidence for x in findings], warnings=sorted(set(warnings)))
