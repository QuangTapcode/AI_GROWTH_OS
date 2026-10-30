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
    brand_voice: str | None = Field(default=None, max_length=500)
    allow_ai_image: bool = Field(default=True)
    real_product: bool | None = Field(default=None)


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


# Re-export v2 models for CM-01
from .social_pack_v2 import (
    AIImageMetadata,
    AssetSourceType,
    AssetV2,
    CTAObject,
    ChannelType,
    CitationItem,
    ContentGenerateRequest,
    ContentGenerateResponse,
    ContentQualityCheckRequest,
    ContentQualityCheckResponse,
    ContentRepurposeRequest,
    ContentRepurposeResponse,
    EntailmentStatusType,
    FactItem,
    SentenceMap,
    SentenceType,
    SocialPack as SocialPackV2,
    SocialPackStatusType,
    compute_content_hash,
)

# Re-export CM-05 (Dual-Asset Management) and CM-06 (Tenant Guard)
from .asset_manager import (
    AI_IMAGE_ALT_PREFIX,
    REAL_PRODUCT_KEYWORDS,
    AssetDecision,
    DualAssetManager,
    decide_asset_status,
    is_real_product_description,
)
from .tenant_guard import (
    TenantAccessForbiddenError,
    TenantGuard,
    extract_resource_workspace_id,
    normalize_workspace_id,
)

# Re-export CM-07 (Fact Extractor)
from .fact_extractor import (
    FactExtractionResponse,
    FactExtractor,
    RawFactItem,
    extract_facts,
    filter_and_validate_facts,
    verify_source_quote,
)

# Re-export CM-08 (Sentence-Fact Mapper & NLI)
from .fact_mapper import (
    auto_associate_facts,
    check_factual_entailment,
    check_zero_claim,
    classify_sentence_type,
    map_caption_to_sentence_fact_map,
    split_vietnamese_sentences,
)

# Re-export CM-09 (Content Generate Service)
from .generate_service import (
    PROMPT_VERSION as CONTENT_GENERATE_PROMPT_VERSION,
    MIN_FACTS_THRESHOLD,
    GeneratedContentDraft,
    generate_deterministic_social_draft,
    normalize_cta_object,
    run_content_generate,
    validate_content_generate,
)

# Re-export CM-13 (Deterministic Guardrails Engine)
from .rule_guardrails import (
    DEFAULT_ALLOWED_DOMAINS,
    SYSTEM_SUPPORTED_CHANNELS,
    GuardrailReport,
    GuardrailViolation,
    check_channels,
    check_factual_sentence_fact_ids,
    check_price_claims,
    check_tenant_forbidden_terms,
    check_unsupported_claims,
    check_unsupported_numbers,
    check_urls,
    evaluate_social_pack_guardrails,
    extract_urls,
    has_price_claim,
)

# Re-export CM-10 (Image Prompt Generator)
from .img_prompt_gen import (
    ASPECT_RATIO_DIMENSIONS,
    MANDATORY_NEGATIVE_PROMPT,
    ImagePromptResult,
    extract_abstract_concepts,
    generate_image_prompt,
)

# Re-export CM-11 (AI Image Client & Storage)
from .image_client import (
    BaseImageProvider,
    BaseStorageClient,
    FakeImageProvider,
    FakeStorageClient,
    FluxImageProvider,
    ImageClient,
    ImageGenerationRequest,
    ImageGenerationResult,
    ImagenImageProvider,
    ProviderImageOutput,
    R2StorageClient,
)

# Re-export CM-12 (Image Guardrail: OCR & Safety)
from .image_guardrail import (
    BaseOcrEngine,
    GuardedImageOutcome,
    GuardedImagePipeline,
    ImageGuardrail,
    ImageGuardrailReport,
    MockOcrEngine,
    TesseractOcrEngine,
)

# Re-export CM-14 (Independent Calibrated LLM Judge)
from .llm_judge import (
    DEFAULT_JUDGE_MODEL,
    PINNED_JUDGE_MODELS,
    RUBRIC_PASS_THRESHOLD,
    BaseJudgeProvider,
    ContentLLMJudge,
    CriterionScore,
    JudgeEvaluationResult,
    JudgeViolationItem,
    MockJudgeProvider,
)

# Re-export CM-15 (Reflection Self-Correction Loop & Quality Check Service)
from .reflection_loop import (
    MAX_REFLECTION_ROUNDS,
    AuditResult,
    ContentQualityAuditor,
    QualityReport,
    ReflectionCorrectionLoop,
    RoundTelemetry,
    StructuredReflectionFeedback,
)
from .quality_check_service import (
    PROMPT_VERSION as CONTENT_QUALITY_CHECK_PROMPT_VERSION,
    ContentQualityCheckPayload,
    check_social_pack_quality,
    run_content_quality_check,
    validate_content_quality_check,
)

# Re-export CM-16 (Facebook Pack Repurposer)
from .fb_repurposer import (
    PROMPT_VERSION as FB_REPURPOSE_PROMPT_VERSION,
    FacebookRepurposer,
    generate_deterministic_facebook_post,
    validate_facebook_hashtags,
)

# Re-export CM-17 (TikTok Script Repurposer)
from .tiktok_repurposer import (
    PROMPT_VERSION as TIKTOK_REPURPOSE_PROMPT_VERSION,
    StoryboardScene,
    TikTokRepurposer,
    count_script_words,
    generate_deterministic_tiktok_script,
    validate_tiktok_word_count,
)

# Re-export CM-18 (Content Repurpose Router)
from .repurpose_router import (
    PROMPT_VERSION as CONTENT_REPURPOSE_PROMPT_VERSION,
    ContentRepurposePayload,
    inherit_citations_from_evidence,
    normalize_repurpose_cta,
    route_repurpose,
    run_content_repurpose,
    validate_content_repurpose,
)

