from pathlib import Path
import re
from ...app.providers import ProviderError
from ...app.runtime import OperationError, OperationOutcome
from ...app.schemas import EvidenceRef
from ...guardrails.facts import has_price_claim, sensitive_keys_in
from ...guardrails.support import strip_unfaithful, strip_unsupported
from ...rag.retrieval import eligible_sources, terms
from ..contracts import (artifact_problems, blocking_facts, call_draft, call_grounded_draft, ensure_grounded, evidence_problems,
                         profile_grounding, result_fields, source_passages, stable_id, validate_context)
from ..copy_quality import canonical_locations, drop_broken_sentences, shorten, strip_listing_artifacts
from ..research.pipeline import KEYWORD_LIST
from .schemas import SeoArticle, SeoDraft, SeoSection

PROMPT_VERSION = "seo-v4"
MAX_PASSAGE_CHARS = 6000
MAX_RELATED_EXCERPTS = 3
MIN_SHARED_TERMS = 2
MAX_QUOTE_CHARS = 400
MAX_TITLE_CHARS = 70
MAX_META_CHARS = 160
# The public site refuses shorter articles (apps/api site/publish.ts MIN_PUBLIC_WORDS); caught here while a reviewer can act on it.
MIN_ARTICLE_WORDS = 150
WANTED_ARTICLE_WORDS = 250
SYSTEM_PROMPT = (Path(__file__).resolve().parents[3] / "prompts" / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")
LEADING_HASHES = re.compile(r"^[#\s]+")


def render(sections) -> tuple[list[str], str]:
    """Render model sections as Markdown in code, so every heading exists in the body."""
    rendered, headings = [], []
    for section in sections:
        heading = LEADING_HASHES.sub("", section.heading).strip()
        if not heading:
            continue
        headings.append(heading)
        rendered.append(f"## {heading}\n\n{section.body.strip()}")
    return headings, "\n\n".join(rendered)


def excerpt_quote(text: str) -> str:
    """Whole sentences from the start of an excerpt: an exact span of it, as evidence checks require."""
    head = text[:MAX_QUOTE_CHARS]
    if len(text) <= MAX_QUOTE_CHARS:
        return head
    end = max(head.rfind(mark) for mark in (". ", "! ", "? "))
    return head[:end + 1] if end > 0 else head


def related_evidence(job, snapshot, finding, locations) -> list[EvidenceRef]:
    """Other approved excerpts about the topic, closest and same-page first.

    Excerpts with prices or other sensitive facts stay out, as they do in Research.
    """
    cited = EvidenceRef.model_validate(finding["evidence"])
    wanted = terms(" ".join([finding["topic"], *(finding.get("keywords") or []), finding.get("user_need") or ""])) - terms(" ".join(locations))
    scored = []
    for source in eligible_sources(job, snapshot)[0]:
        provenance = source.provenance
        if not provenance or not provenance.source_url:
            continue
        for chunk in source.chunks:
            shared = len(wanted & terms(chunk.text))
            if (chunk.chunk_id == cited.chunk_id or shared < MIN_SHARED_TERMS or has_price_claim(chunk.text)
                    or sensitive_keys_in(chunk.text) or KEYWORD_LIST.search(chunk.text)):
                continue
            scored.append((-shared, source.source_id != cited.source_id, len(scored), source, chunk))
    scored.sort(key=lambda row: row[:3])
    return [EvidenceRef(source_id=source.source_id, source_version=source.version, chunk_id=chunk.chunk_id,
                        locator=chunk.locator, quote=excerpt_quote(chunk.text), source_url=source.provenance.source_url,
                        license=source.provenance.license, attribution=source.provenance.attribution)
            for *_, source, chunk in scored[:MAX_RELATED_EXCERPTS]]


def clean_sections(draft, places, grounding, passages, common) -> tuple[list[SeoSection], list[str]]:
    """Sections as they would be published; sentences still unsupported after a rewrite are removed, never published."""
    sections, removed = [], []
    for section in draft.sections:
        body, dropped = strip_unsupported(strip_listing_artifacts(canonical_locations(section.body, places)), grounding)
        body, unfaithful = strip_unfaithful(body, passages, common)
        body, broken = drop_broken_sentences(body, grounding=grounding)
        removed += dropped + unfaithful + broken
        if body:
            sections.append(SeoSection(heading=section.heading, body=body))
    return sections, removed


def article_words(sections) -> int:
    return sum(len(section.body.split()) for section in sections)


def validate_seo(job, p, settings):
    return (validate_context(job, p) + artifact_problems(job, p.research, "research")
            + evidence_problems(job, p.snapshot, p.research.evidence))


async def run_seo(ctx):
    p = ctx.payload
    findings = p.research.result.get("findings", [])
    if p.finding_index >= len(findings) or not p.research.evidence:
        raise OperationError("MISSING_RESEARCH", "Choose a grounded research finding")
    finding = findings[p.finding_index]
    topic = finding["topic"]
    keyword = (finding.get("keywords") or [topic])[0]
    # Write from the whole approved chunk behind the quote; the quote alone left the model inventing detail.
    # Cite only the selected finding, so social copy downstream is grounded on the same topic.
    cited = [EvidenceRef.model_validate(finding["evidence"]), *related_evidence(ctx.job, p.snapshot, finding, p.business_profile.locations)]
    # Primary excerpt first, so the budget can never cut the one Research chose.
    passages = [text for ref in cited for text in source_passages(p.snapshot, [ref])]
    full_passage = "\n\n".join(passages) or finding["evidence"]["quote"]
    # The model reads the entries without their list numbers and date stamps; the original text still grounds the draft.
    passage = strip_listing_artifacts(full_passage)[:MAX_PASSAGE_CHARS]
    grounding = [full_passage, finding["evidence"]["quote"], topic, keyword, finding.get("user_need") or "", p.cta,
                 profile_grounding(p.business_profile)]
    data = {"topic": topic, "keyword": keyword, "user_need": finding.get("user_need"),
            "research_quote": finding["evidence"]["quote"], "source_passage": passage, "cta": p.cta}
    fake = lambda: {"title": topic[:70], "meta_description": f"Explore {topic.lower()} using cited research."[:160],
                    "sections": [{"heading": "Overview", "body": finding["evidence"]["quote"]},
                                 {"heading": "Next steps", "body": p.cta}]}
    text_of = lambda d: " ".join([d.title, d.meta_description, render(d.sections)[1]])
    draft = await call_grounded_draft(ctx, SYSTEM_PROMPT, data, SeoDraft, fake, text_of, grounding, trim=("source_passage",))
    places = p.business_profile.locations
    common = [*places, p.business_profile.company]
    sections, removed = clean_sections(draft, places, grounding, passages, common)
    words = article_words(sections)
    warnings, measured = [], ctx.settings.provider_mode != "fake"
    if measured and words < WANTED_ARTICLE_WORDS and not ctx.optional_call_blocker():
        note = (f"\nRevision required: the previous draft came to {words} words. Write at least {WANTED_ARTICLE_WORDS} words by using "
                "more of the details in source_passage: names, places, what each is like and who it suits. Add nothing it does not state.")
        try:
            longer = await call_draft(ctx, SYSTEM_PROMPT + note, data, SeoDraft, fake, ("source_passage",))
            ensure_grounded(text_of(longer), grounding)
            longer_sections, longer_removed = clean_sections(longer, places, grounding, passages, common)
            if len(longer_sections) >= 2 and article_words(longer_sections) > words:
                draft, sections, removed, words = longer, longer_sections, longer_removed, article_words(longer_sections)
        except (OperationError, ProviderError) as error:
            # The extra call can only improve the article the job already has.
            warnings.append(f"SEO_EXPANSION_SKIPPED:{error.code}")
    draft = draft.model_copy(update={"title": shorten(strip_listing_artifacts(canonical_locations(draft.title, places)), MAX_TITLE_CHARS),
                                     "meta_description": shorten(canonical_locations(draft.meta_description, places), MAX_META_CHARS)})
    headings, article = render(sections)
    # Citation identifiers and internal CTA are assembled in code, never invented by a model.
    # Two excerpts of one page are one source for the reader.
    pages = {e.source_url: e.chunk_id for e in reversed(cited)}
    body = article + "\n\n" + "\n".join(f"[source:{chunk_id}]({url})" for url, chunk_id in reversed(pages.items()))
    body +=f"\n\n[Request information](/contact) — {p.cta}"
    checks = {"title": bool(draft.title.strip()), "meta": bool(draft.meta_description.strip()),
              "headings": len(headings) >= 2 and all(f"## {h}" in body for h in headings), "internal_link": "](/contact)" in body,
              "citations": bool(cited)}
    if not all(checks.values()):
        failed = ", ".join(name for name, ok in checks.items() if not ok)
        raise OperationError("SEO_CHECK_FAILED", f"Draft does not satisfy required headings/metadata/citations (failed: {failed})")
    missing = blocking_facts(p.research.result.get("missing_facts", []))
    if measured and words < MIN_ARTICLE_WORDS:
        missing.append("article_too_short")
        warnings.append(f"ARTICLE_TOO_SHORT:{words}")
    output = SeoArticle(**result_fields(ctx, [p.research]), article_id=stable_id(ctx, "article"),
        strategy_alignment=finding.get('strategy_alignment'),
        status="draft" if not missing else "insufficient_data", missing_facts=missing,
        title=draft.title, meta_description=draft.meta_description, primary_keyword=keyword,
        headings=headings, body_markdown=body, cta=p.cta, citations=cited, seo_checks=checks)
    return OperationOutcome(result=output.model_dump(mode="json"), evidence=cited,
                            warnings=[*([f"UNSUPPORTED_SENTENCES_REMOVED:{len(removed)}"] if removed else []), *warnings])
