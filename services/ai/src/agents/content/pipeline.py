from pathlib import Path
from ...app.runtime import OperationError, OperationOutcome
from ..contracts import artifact_problems, call_draft, ensure_grounded, evidence_problems, result_fields, stable_id, validate_context
from .schemas import ContentDraft, SocialPack

PROMPT_VERSION = "content-v1"
SYSTEM_PROMPT = (Path(__file__).resolve().parents[3] / "prompts/content-v1.md").read_text(encoding="utf-8")


def validate_content(job, p, settings):
    problems = validate_context(job, p) + artifact_problems(job, p.source_article, "seo")
    problems += evidence_problems(job, p.snapshot, p.source_article.evidence)
    if any(a.workspace_id != job.workspace_id for a in p.assets):
        problems.append(("TENANT_SCOPE_VIOLATION", "Foreign image asset"))
    return problems


async def run_content(ctx):
    p = ctx.payload
    article = p.source_article.result
    if not article.get("article_id") or not article.get("body_markdown") or not p.source_article.evidence:
        raise OperationError("MISSING_PARENT_CONTENT", "Content requires a cited SEO artifact")
    assets = [a for a in p.assets if a.status == "approved" and a.license.strip() and a.attribution.strip()]
    draft = await call_draft(ctx, SYSTEM_PROMPT,
        {"title": article["title"], "body": article["body_markdown"], "cta": p.cta,
         "brand_voice": p.business_profile.voice}, ContentDraft,
        lambda: {"caption": f"Explore {article['title'].lower()}. {p.cta}", "alt_text": "Supporting image for the cited local guide."})
    ensure_grounded(draft.caption + " " + draft.alt_text, [article["body_markdown"], article["title"], p.cta])
    channels = [channel for channel in p.target_channels if channel in {"facebook", "tiktok"}]
    if not channels:
        channels = ["facebook", "tiktok"]
    missing = list(article.get("missing_facts", []))
    # Facebook Page text posts do not require an image. TikTok still requires
    # an approved media asset, so keep the asset gate for any TikTok target.
    requires_media = "tiktok" in channels
    if not assets and requires_media:
        missing.append("approved_image_asset")
    fields = result_fields(ctx, [p.source_article])
    fields["synthetic"] = fields["synthetic"] or any(a.synthetic for a in assets)
    result = SocialPack(**fields, status="needs_assets" if (not assets and requires_media) else "insufficient_data" if article.get("missing_facts") else "draft",
        missing_facts=sorted(set(missing)), pack_id=stable_id(ctx, "social"), parent_content_id=article["article_id"],
        parent_version=p.source_article.artifact.version, caption=draft.caption, cta=p.cta,
        channels=channels, image_assets=assets, alt_text=draft.alt_text, citations=p.source_article.evidence,
        video_asset_ref=None, tiktok_privacy_level="SELF_ONLY")
    return OperationOutcome(result=result.model_dump(mode="json"), evidence=p.source_article.evidence,
                            warnings=["MANUAL_PACK_REQUIRES_APPROVAL_AND_CHANNEL_CAPABILITY"])
