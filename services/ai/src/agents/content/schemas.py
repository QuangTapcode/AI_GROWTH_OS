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
    caption: str = Field(min_length=1, max_length=800)
    alt_text: str = Field(min_length=1, max_length=160)


class SocialPack(DraftResult):
    pack_id: UUID
    parent_content_id: UUID
    parent_version: int
    caption: str
    cta: str
    channels: list[str]
    channel_mode: str = "manual_review_pack"
    image_assets: list[ImageAsset]
    alt_text: str
    citations: list[EvidenceRef]
    video_asset_ref: str | None = None
    tiktok_privacy_level: str = "SELF_ONLY"
