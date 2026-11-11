import asyncio
from dataclasses import dataclass
from pathlib import Path
import re
from ...app.providers import ProviderError
from ...app.runtime import OperationError, OperationOutcome
from ...guardrails.support import source_entries, strip_unfaithful, strip_unsupported
from ...rag.retrieval import terms
from ..contracts import (artifact_problems, call_draft, call_grounded_draft, ensure_grounded, evidence_problems, profile_grounding,
                         result_fields, source_passages, stable_id, validate_context)
from ..copy_quality import canonical_locations, drop_broken_sentences, drop_truncated_lines, repeats_line, shorten, strip_listing_artifacts
from .image_client import ImageGenerationRequest, ImageProviderError
from .image_guardrail import GuardedImagePipeline
from .img_prompt_gen import generate_image_prompt
from .rule_guardrails import evaluate_social_pack_guardrails
from .schemas import (ContentDraft, ContentFacebookDraft, FacebookPost, GeneratedImage, ImageSuggestion, SocialPack, TikTokDraft,
                      TikTokScript)
from .tiktok_repurposer import count_script_words, validate_tiktok_word_count
from .traceability import cited_facts, sentence_fact_map

PROMPT_VERSION = "content-v4"
MAX_PASSAGE_CHARS = 2400
MAX_HOOK_CHARS = 150
MIN_SHARED_WITH_TITLE = 2
# Share of a line's words that must be in what the model read. Measured on a real script (04/11): details from nowhere it was
# given ("banh mi and spring rolls") scored 0.36-0.40 here but 0.60-0.64 against every cited source; lines restating
# the entry or the article scored 0.67 and up.
READ_SUPPORT_MIN = 0.5
# A share of a few words is noise, and it takes a longer sentence to carry invented detail.
READ_MIN_WORDS = 6
# Three attempts at a prediction Replicate may hold for a minute, then the upload; less than this risks the whole job.
IMAGE_SECONDS_NEEDED = 150
IMAGE_SECONDS_MARGIN = 20
IMAGE_SIZES = {"1:1": (1080, 1080), "9:16": (1080, 1920)}
PROMPTS = Path(__file__).resolve().parents[3] / "prompts"
SYSTEM_PROMPT = (PROMPTS / f"{PROMPT_VERSION}.md").read_text(encoding="utf-8")
FACEBOOK_PROMPT = (PROMPTS / f"{PROMPT_VERSION}-facebook.md").read_text(encoding="utf-8")
TIKTOK_PROMPT = (PROMPTS / "content-tiktok-v1.md").read_text(encoding="utf-8")
LINK = re.compile(r"https?://|www\.", re.IGNORECASE)


@dataclass(frozen=True)
class CopyCheck:
    """What copy is held to: the cited sources for its claims, and what the model read for its details."""
    passages: list[str]
    common: list[str]
    read: list[str]

    def clean(self, text):
        text, _ = strip_unfaithful(text, self.passages, self.common)
        return strip_unsupported(text, self.read, READ_SUPPORT_MIN, READ_MIN_WORDS)[0]

    def misleads(self, line):
        """For an opening line: it invites rather than informs, so only a false tie or unearned praise rules it out."""
        return bool(strip_unfaithful(line, self.passages, self.common)[1])


def facebook_post(draft, grounding, cta, locations, check):
    """Facebook Page variant: hook above "See more", short body, optional question, exact CTA."""
    hashtags = [tag for tag in (t.strip() for t in draft.hashtags) if re.fullmatch(r"#\w+", tag)]
    hook = shorten(strip_listing_artifacts(canonical_locations(draft.hook.strip(), locations)), MAX_HOOK_CHARS)
    question = canonical_locations((draft.discussion_question or "").strip(), locations)
    # Links fail closed on the model's own draft, before any sentence is removed.
    if LINK.search(" ".join([hook, draft.body, question])):
        raise OperationError("UNSUPPORTED_CONTENT_CLAIM", "Facebook draft must not contain links")
    # Sentences the cited sources do not support are removed before posting.
    body, _ = strip_unsupported(strip_listing_artifacts(canonical_locations(draft.body.strip(), locations)), grounding)
    body = check.clean(body)
    # The exact CTA is appended below; a cut-off or repeated copy of it from the model is dropped.
    body = "\n".join(line for line in body.split("\n") if not (line.strip() and cta.casefold().startswith(line.strip().casefold())))
    body, truncated = drop_truncated_lines(body)
    body, broken = drop_broken_sentences(body, grounding=grounding)
    truncated += broken
    # A line that only says the hook again goes too, unless it is all the post has to say.
    lines = body.split("\n")
    distinct = [line for line in lines if not repeats_line(line, hook)]
    body = "\n".join(distinct if any(line.strip() for line in distinct) else lines).strip()
    # A hook the sources do not bear out gives way to the first line they do.
    if check.misleads(hook):
        first, _, rest = body.partition("\n")
        hook, body = shorten(first.lstrip("•- ").strip(), MAX_HOOK_CHARS), rest.strip()
    if not body:
        raise OperationError("UNSUPPORTED_CONTENT_CLAIM", "No Facebook sentence is supported by the cited sources")
    if question and question.casefold() in body.casefold():
        # Models sometimes end the body with the same question; post it once.
        question = ""
    text = "\n\n".join(part for part in [hook, body, question, cta, " ".join(hashtags)] if part)
    ensure_grounded(text, grounding)
    # Promotions, testimonials and superlatives the cited sources do not state also fail closed (CM-13).
    report = evaluate_social_pack_guardrails(text, extracted_facts=grounding)
    if not report.is_valid:
        found = ", ".join(sorted({f"{v.code}:{v.matched_text}" for v in report.violations}))
        raise OperationError("UNSUPPORTED_CONTENT_CLAIM", f"Facebook draft makes claims the cited sources do not: {found}")
    post = FacebookPost(hook=hook, body=body, discussion_question=question or None, hashtags=hashtags, cta=cta, text=text)
    return post, len(truncated)


async def tiktok_script(ctx, p, data, grounding, demo_points, check):
    """A script for the reviewer, in its own call so that it can never cost the Facebook post; returns (script, warnings)."""
    blocker = ctx.optional_call_blocker()
    if blocker:
        return None, [f"TIKTOK_SCRIPT_SKIPPED:{blocker}"]
    fake = lambda: {"hook": data["title"][:150],
                    "scenes": [{"voiceover": point, "visual": "Local footage of the topic"} for point in demo_points or [data["title"]]]}
    try:
        draft = await call_draft(ctx, TIKTOK_PROMPT, data, TikTokDraft, fake, trim=("source_passage", "body"))
        places = p.business_profile.locations
        hook = shorten(strip_listing_artifacts(canonical_locations(draft.hook, places)), MAX_HOOK_CHARS)
        if check.misleads(hook):
            hook = shorten(data["title"], MAX_HOOK_CHARS)
        scenes = []
        for scene in draft.scenes:
            spoken, _ = strip_unsupported(strip_listing_artifacts(canonical_locations(scene.voiceover, places)), grounding)
            spoken = check.clean(spoken)
            spoken, _ = drop_broken_sentences(spoken, grounding=grounding)
            if spoken:
                scenes.append(scene.model_copy(update={"voiceover": spoken}))
        if not scenes:
            raise OperationError("UNSUPPORTED_CONTENT_CLAIM", "No TikTok line is supported by the cited sources")
        spoken_text = " ".join([hook, *(scene.voiceover for scene in scenes), p.cta])
        ensure_grounded(spoken_text, grounding)
    except (OperationError, ProviderError) as error:
        return None, [f"TIKTOK_SCRIPT_SKIPPED:{error.code}"]
    words = count_script_words(spoken_text)
    within = not validate_tiktok_word_count(spoken_text)
    return (TikTokScript(hook=hook, scenes=scenes, cta=p.cta, word_count=words, within_length=within),
            [] if within else [f"TIKTOK_SCRIPT_LENGTH:{words}"])


def image_suggestion(article, facts, channels, real_product=None):
    """What to shoot or generate for a post without an approved image; real premises need a real photo."""
    outcome = generate_image_prompt({**article, "is_real_product": real_product}, facts=facts, target_channel=channels[0])
    return ImageSuggestion(status=outcome.status, prompt=outcome.prompt, negative_prompt=outcome.negative_prompt,
                           aspect_ratio=outcome.aspect_ratio, reason=outcome.rejection_reason)


def entries_about(sources, title, locations):
    """The source entries about the article: a listing page also names its neighbours, and a post must not wander to them.

    Only what the model reads is narrowed; grounding still uses every source the article cites.
    """
    wanted = terms(title) - terms(" ".join(locations))
    scored = [(len(wanted & terms(entry)), entry) for source in sources for entry in source_entries(source)]
    best = max((score for score, _ in scored), default=0)
    if best < MIN_SHARED_WITH_TITLE:
        return "\n\n".join(sources)
    floor = max(MIN_SHARED_WITH_TITLE, best // 2)
    return "\n".join(entry for score, entry in scored if score >= floor)


def image_request(prompt, negative_prompt, aspect_ratio, alt_text, workspace_id):
    width, height = IMAGE_SIZES[aspect_ratio]
    return ImageGenerationRequest(prompt=prompt, negative_prompt=negative_prompt, aspect_ratio=aspect_ratio, width=width, height=height,
                                  workspace_id=workspace_id, alt_text_description=alt_text)


async def generated_image(ctx, p, suggestion, alt_text):
    """An illustration for the reviewer, generated and inspected outside the model budget; returns (image, warnings).

    It costs money, so it stays off unless the deployment turned it on, and it can never cost the post.
    """
    if not (ctx.settings.ai_image_generation and ctx.settings.provider_mode != "fake" and p.allow_ai_image
            and suggestion and suggestion.status == "draft" and suggestion.prompt):
        return None, []
    pipeline = GuardedImagePipeline()
    blocker = pipeline.not_ready()
    if not blocker and ctx.seconds_left() < IMAGE_SECONDS_NEEDED:
        blocker = "NOT_ENOUGH_TIME"
    if blocker:
        return None, [f"AI_IMAGE_SKIPPED:{blocker}"]
    request = image_request(suggestion.prompt, suggestion.negative_prompt, suggestion.aspect_ratio, alt_text, ctx.job.workspace_id)
    try:
        outcome = await asyncio.wait_for(asyncio.to_thread(pipeline.generate_guarded_image, request, ctx.job.workspace_id),
                                         timeout=ctx.seconds_left() - IMAGE_SECONDS_MARGIN)
    except ImageProviderError as error:
        return None, [f"AI_IMAGE_SKIPPED:{error.code}"]
    except asyncio.TimeoutError:
        return None, ["AI_IMAGE_SKIPPED:NOT_ENOUGH_TIME"]
    except Exception:
        # Whatever an outside service answers, the post is already written and must survive it.
        ctx.logger.exception("AI image pipeline failed")
        return None, ["AI_IMAGE_SKIPPED:IMAGE_PIPELINE_ERROR"]
    if outcome.status != "approved":
        return None, [f"AI_IMAGE_REJECTED:{outcome.attempts_made}"]
    stored, metadata = outcome.result, outcome.result.ai_metadata
    return (GeneratedImage(url=stored.storage_url, content_hash=stored.content_hash, aspect_ratio=stored.aspect_ratio,
                           width=request.width, height=request.height, alt_text=stored.asset.alt_text, prompt=suggestion.prompt,
                           model_name=metadata.model_name, seed=metadata.seed, cost_usd=stored.cost_usd, ocr_checked=metadata.ocr_checked), [])


def validate_content(job, p, settings):
    problems = validate_context(job, p) + artifact_problems(job, p.source_article, "seo")
    problems += evidence_problems(job, p.snapshot, p.source_article.evidence)
    if any(channel not in {"facebook", "tiktok"} for channel in p.target_channels):
        problems.append(("INVALID_CHANNELS", "Only facebook and tiktok are supported"))
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
    # Ground on the approved source chunks behind the article, not only on the model-written article,
    # so an embellishment that slipped into SEO cannot be repeated in social copy.
    sources = source_passages(p.snapshot, p.source_article.evidence)
    passage = "\n\n".join(sources)
    focused = entries_about(sources, article["title"], p.business_profile.locations)
    common = [*p.business_profile.locations, p.business_profile.company]
    grounding = [passage, article["title"], *article.get("headings", []), p.cta, profile_grounding(p.business_profile)]
    def text_of(d):
        social = [d.facebook.hook, d.facebook.body] if with_facebook else []
        return " ".join([d.caption, d.alt_text, *social])
    draft = await call_grounded_draft(ctx, SYSTEM_PROMPT + ("\n" + FACEBOOK_PROMPT if with_facebook else ""),
        {"title": article["title"], "body": article["body_markdown"], "source_passage": focused[:MAX_PASSAGE_CHARS], "cta": p.cta,
         "brand_voice": p.business_profile.voice}, ContentFacebookDraft if with_facebook else ContentDraft,
        lambda: demo, text_of, grounding + [article["body_markdown"]] if not passage else grounding,
        trim=("source_passage", "body"))
    caption, _ = strip_unsupported(draft.caption, grounding)
    check = CopyCheck(sources, common, [focused, article["body_markdown"], article["title"], p.cta, profile_grounding(p.business_profile)])
    caption = check.clean(caption)
    draft = draft.model_copy(update={"caption": caption or draft.caption})
    facebook, truncated = (facebook_post(draft.facebook, grounding, p.cta, p.business_profile.locations, check)
                           if with_facebook else (None, 0))
    facts = cited_facts(p.source_article.evidence, p.snapshot)
    sentence_map = sentence_fact_map(facebook, facts) if facebook else []
    suggestion = None if assets else image_suggestion(article, facts, channels, p.real_product)
    illustration, image_warnings = await generated_image(ctx, p, suggestion, draft.alt_text)
    tiktok, tiktok_warnings = (None, [])
    if "tiktok" in channels or p.draft_tiktok_script:
        tiktok, tiktok_warnings = await tiktok_script(ctx, p, {"title": article["title"], "body": article["body_markdown"],
            "source_passage": focused[:MAX_PASSAGE_CHARS], "brand_voice": p.business_profile.voice}, grounding, points, check)
    missing = list(article.get("missing_facts", []))
    # Facebook Page text posts do not require an image. TikTok still requires
    # an approved media asset, so keep the asset gate for any TikTok target.
    requires_media = "tiktok" in channels
    if not assets and requires_media:
        missing.append("approved_image_asset")
    fields = result_fields(ctx, [p.source_article])
    fields['strategy_alignment'] = article.get('strategy_alignment')
    fields["synthetic"] = fields["synthetic"] or any(a.synthetic for a in assets)
    result = SocialPack(**fields, status="needs_assets" if (not assets and requires_media) else "insufficient_data" if article.get("missing_facts") else "draft",
        missing_facts=sorted(set(missing)), pack_id=stable_id(ctx, "social"), parent_content_id=article["article_id"],
        parent_version=p.source_article.artifact.version, caption=draft.caption, cta=p.cta,
        channels=channels, facebook=facebook, image_assets=assets, alt_text=draft.alt_text, citations=p.source_article.evidence,
        hook=draft.caption.splitlines()[0],
        key_points=[line.lstrip("•- ").strip() for line in draft.caption.splitlines() if line.strip().startswith(("•", "- "))],
        hashtags=re.findall(r"(?<!\w)#[\w]+", draft.caption),
        video_asset_ref=None, tiktok_privacy_level="SELF_ONLY", extracted_facts=facts, sentence_fact_map=sentence_map,
        tiktok=tiktok, image_suggestion=suggestion, generated_image=illustration)
    return OperationOutcome(result=result.model_dump(mode="json"), evidence=p.source_article.evidence,
                            warnings=["MANUAL_PACK_REQUIRES_APPROVAL_AND_CHANNEL_CAPABILITY",
                                      *([f"TRUNCATED_SENTENCE_REMOVED:{truncated}"] if truncated else []), *tiktok_warnings, *image_warnings])
