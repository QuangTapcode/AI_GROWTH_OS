from pathlib import Path
import re
from ...app.runtime import OperationError, OperationOutcome
from ..contracts import artifact_problems, call_draft, ensure_grounded, evidence_problems, result_fields, stable_id, validate_context
from .schemas import ContentDraft, ContentFacebookDraft, FacebookPost, SocialPack

PROMPT_VERSION = "content-v3"
PROMPTS = Path(__file__).resolve().parents[3] / "prompts"
SYSTEM_PROMPT = (PROMPTS / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")
FACEBOOK_PROMPT = (PROMPTS / f"{PROMPT_VERSION}-facebook.md").read_text(encoding="utf-8")
LINK = re.compile(r"https?://|www\.", re.IGNORECASE)


def facebook_post(draft, article, cta):
    """Facebook Page variant: hook above "See more", short body, optional question, exact CTA."""
    hashtags = [tag for tag in (t.strip() for t in draft.hashtags) if re.fullmatch(r"#\w+", tag)]
    hook, body, question = draft.hook.strip(), draft.body.strip(), (draft.discussion_question or "").strip()
    text = "\n\n".join(part for part in [hook, body, question, cta, " ".join(hashtags)] if part)
    if LINK.search(text):
        raise OperationError("UNSUPPORTED_CONTENT_CLAIM", "Facebook draft must not contain links")
    ensure_grounded(text, [article["body_markdown"], article["title"], cta])
    return FacebookPost(hook=hook, body=body, discussion_question=question or None, hashtags=hashtags, cta=cta, text=text)


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
    # Deterministic demo remains grounded in the supplied article, with the same
    # hook -> useful points -> CTA structure requested from a live model.
    title = article["title"].strip()
    # Headings, link/source lines and images are structure, not useful points.
    paragraphs = [re.sub(r"[#*>`_]", "", line).strip() for line in article["body_markdown"].splitlines()
                  if not line.lstrip().startswith(("#", "[", "!["))]
    points = [line for line in paragraphs if line and line.casefold() != title.casefold() and line != p.cta][:2]
    points = [line[:300] for line in points]
    brand = re.sub(r"[^\w]", "", p.business_profile.company)
    tags = [f"#{brand}"] if brand else []
    demo_caption = "\n\n".join([title, "\n".join(f"• {point}" for point in points), p.cta, " ".join(tags)]).strip()
    channels = [channel for channel in p.target_channels if channel in {"facebook", "tiktok"}]
    if not channels:
        channels = ["facebook", "tiktok"]
    with_facebook = "facebook" in channels
    demo = {"caption": demo_caption, "alt_text": "Supporting image for the cited local guide."}
    if with_facebook:
        demo["facebook"] = {"hook": title[:150], "body": "\n".join(f"• {point}" for point in points) or title,
                            "discussion_question": None, "hashtags": tags[:2]}
    draft = await call_draft(ctx, SYSTEM_PROMPT + ("\n" + FACEBOOK_PROMPT if with_facebook else ""),
        {"title": article["title"], "body": article["body_markdown"], "cta": p.cta,
         "brand_voice": p.business_profile.voice}, ContentFacebookDraft if with_facebook else ContentDraft,
        lambda: demo)
    ensure_grounded(draft.caption + " " + draft.alt_text, [article["body_markdown"], article["title"], p.cta])
    facebook = facebook_post(draft.facebook, article, p.cta) if with_facebook else None
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
        channels=channels, facebook=facebook, image_assets=assets, alt_text=draft.alt_text, citations=p.source_article.evidence,
        hook=draft.caption.splitlines()[0],
        key_points=[line.lstrip("•- ").strip() for line in draft.caption.splitlines() if line.strip().startswith(("•", "- "))],
        hashtags=re.findall(r"(?<!\w)#[\w]+", draft.caption),
        video_asset_ref=None, tiktok_privacy_level="SELF_ONLY")
    return OperationOutcome(result=result.model_dump(mode="json"), evidence=p.source_article.evidence,
                            warnings=["MANUAL_PACK_REQUIRES_APPROVAL_AND_CHANNEL_CAPABILITY"])
