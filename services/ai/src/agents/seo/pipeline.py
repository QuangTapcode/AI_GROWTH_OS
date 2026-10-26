from pathlib import Path
import re
from ...app.runtime import OperationError, OperationOutcome
from ..contracts import artifact_problems, call_grounded_draft, evidence_problems, result_fields, stable_id, validate_context
from .schemas import SeoArticle, SeoDraft

PROMPT_VERSION = "seo-v2"
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
    grounding = [finding["evidence"]["quote"], topic, p.cta]
    draft = await call_grounded_draft(ctx, SYSTEM_PROMPT,
        {"topic": topic, "keyword": keyword, "user_need": finding.get("user_need"),
         "research_quote": finding["evidence"]["quote"], "cta": p.cta}, SeoDraft,
        lambda: {"title": topic[:70], "meta_description": f"Explore {topic.lower()} using cited research."[:160],
                 "sections": [{"heading": "Overview", "body": finding["evidence"]["quote"]},
                              {"heading": "Next steps", "body": p.cta}]},
        lambda d: " ".join([d.title, d.meta_description, render(d.sections)[1]]), grounding)
    headings, article = render(draft.sections)
    # Citation identifiers and internal CTA are assembled in code, never invented by a model.
    body = article + "\n\n" + "\n".join(f"[source:{e.chunk_id}]({e.source_url})" for e in p.research.evidence)
    body += f"\n\n[Request information](/contact) — {p.cta}"
    checks = {"title": bool(draft.title.strip()), "meta": bool(draft.meta_description.strip()),
              "headings": len(headings) >= 2 and all(f"## {h}" in body for h in headings), "internal_link": "](/contact)" in body,
              "citations": bool(p.research.evidence)}
    if not all(checks.values()):
        failed = ", ".join(name for name, ok in checks.items() if not ok)
        raise OperationError("SEO_CHECK_FAILED", f"Draft does not satisfy required headings/metadata/citations (failed: {failed})")
    missing = list(p.research.result.get("missing_facts", []))
    output = SeoArticle(**result_fields(ctx, [p.research]), article_id=stable_id(ctx, "article"),
        status="draft" if not missing else "insufficient_data", missing_facts=missing,
        title=draft.title, meta_description=draft.meta_description, primary_keyword=keyword,
        headings=headings, body_markdown=body, cta=p.cta, citations=p.research.evidence, seo_checks=checks)
    return OperationOutcome(result=output.model_dump(mode="json"), evidence=p.research.evidence)
