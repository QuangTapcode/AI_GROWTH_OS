from pathlib import Path
from ...app.runtime import OperationError, OperationOutcome
from ..contracts import artifact_problems, call_draft, ensure_grounded, evidence_problems, result_fields, stable_id, validate_context
from .schemas import SeoArticle, SeoDraft

PROMPT_VERSION = "seo-v1"
SYSTEM_PROMPT = (Path(__file__).resolve().parents[3] / "prompts/seo-v1.md").read_text(encoding="utf-8")


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
    draft = await call_draft(ctx, SYSTEM_PROMPT,
        {"topic": topic, "keyword": keyword, "user_need": finding.get("user_need"),
         "research_quote": finding["evidence"]["quote"], "cta": p.cta}, SeoDraft,
        lambda: {"title": topic[:70], "meta_description": f"Explore {topic.lower()} using cited research."[:160],
                 "headings": ["Overview", "Next steps"],
                 "body_markdown": f"## Overview\n\n{finding['evidence']['quote']}\n\n## Next steps\n\n{p.cta}"})
    ensure_grounded(" ".join([draft.title, draft.meta_description, draft.body_markdown, *draft.headings]),
                    [finding["evidence"]["quote"], topic, p.cta])
    # Citation identifiers and internal CTA are assembled in code, never invented by a model.
    body = draft.body_markdown + "\n\n" + "\n".join(f"[source:{e.chunk_id}]({e.source_url})" for e in p.research.evidence)
    body += f"\n\n[Request information](/contact) — {p.cta}"
    checks = {"title": bool(draft.title), "meta": bool(draft.meta_description),
              "headings": all(f"## {h}" in body for h in draft.headings), "internal_link": "](/contact)" in body,
              "citations": bool(p.research.evidence)}
    if not all(checks.values()):
        raise OperationError("SEO_CHECK_FAILED", "Draft does not satisfy required headings/metadata/citations")
    missing = list(p.research.result.get("missing_facts", []))
    output = SeoArticle(**result_fields(ctx, [p.research]), article_id=stable_id(ctx, "article"),
        status="draft" if not missing else "insufficient_data", missing_facts=missing,
        title=draft.title, meta_description=draft.meta_description, primary_keyword=keyword,
        headings=draft.headings, body_markdown=body, cta=p.cta, citations=p.research.evidence, seo_checks=checks)
    return OperationOutcome(result=output.model_dump(mode="json"), evidence=p.research.evidence)
