from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from ...app.schemas import EvidenceRef
from ..contracts import ArtifactInput, DraftResult, ImageAsset, MarketingContext


class ContentPayload(MarketingContext):
    source_article: ArtifactInput
    cta: str = Field(min_length=1, max_length=200)
    assets: list[ImageAsset] = Field(default_factory=list, max_length=10)
    # Distribution target is explicit so Content can produce a Facebook/TikTok
    # pack without silently assuming Instagram or a live connector.
    target_channels: list[str] = Field(default_factory=lambda: ["facebook", "tiktok"], max_length=4)


class ContentDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    caption: str = Field(min_length=1, max_length=1800)
    alt_text: str = Field(min_length=1, max_length=160)


class FacebookDraft(BaseModel):
    """Model-written parts of a Facebook Page post; the CTA is appended by code."""
    model_config = ConfigDict(extra="forbid")
    hook: str = Field(min_length=1, max_length=150)
    body: str = Field(min_length=1, max_length=1500)
    discussion_question: str | None = Field(default=None, max_length=200)
    hashtags: list[str] = Field(default_factory=list, max_length=2)


class ContentFacebookDraft(ContentDraft):
    # Same structured call as the caption so a Facebook target does not spend
    # a second provider call (the per-job cap would leave no repair attempt).
    facebook: FacebookDraft


class FacebookPost(FacebookDraft):
    # Exact text the owner reviews and the Page publisher sends.
    cta: str
    text: str = Field(min_length=1, max_length=2200)


class SocialPack(DraftResult):
    pack_id: UUID
    parent_content_id: UUID
    parent_version: int
    caption: str
    hook: str = ""
    key_points: list[str] = Field(default_factory=list)
    hashtags: list[str] = Field(default_factory=list)
    cta: str
    channels: list[str]
    facebook: FacebookPost | None = None
    channel_mode: str = "manual_review_pack"
    image_assets: list[ImageAsset]
    alt_text: str
    citations: list[EvidenceRef]
    video_asset_ref: str | None = None
    tiktok_privacy_level: str = "SELF_ONLY"
