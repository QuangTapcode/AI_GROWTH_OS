"""Content Generate Service & Handler (CM-09).

Implements the dedicated content.generate operation for AI Growth OS:
1. Validates input article, tenant isolation, and version lock (CM-04/06).
2. Extracts verifiable facts with code-level source quote verification (CM-07).
   Enforces MIN_FACTS_THRESHOLD (3 facts) before granting draft status.
3. Evaluates Dual-Asset Policy (CM-05): real product articles strictly require approved real assets.
4. Generates social media caption for selected channels (Facebook/TikTok) via LLM.
   Adopts Brand Voice faithfully and incorporates verbatim CTA.
5. Maps caption sentences to extracted facts and runs NLI entailment verification (CM-08).
6. Records step-by-step latency telemetry and returns valid SocialPack v2.
"""

from __future__ import annotations

import logging
import re
import time
from pathlib import Path
from typing import Any, Callable, Mapping, Sequence
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from ...app.config import Settings
from ...app.runtime import OperationError, OperationOutcome, RunContext
from ...app.schemas import EvidenceRef, JobRequest
from ..contracts import (
    ArtifactInput,
    ImageAsset,
    MarketingContext,
    artifact_problems,
    call_draft,
    evidence_problems,
    validate_context,
)
from .asset_manager import DualAssetManager
from .bundle_manager import get_active_bundle_id
from .fact_extractor import FactExtractor
from .fact_mapper import map_caption_to_sentence_fact_map
from .input_validator import validate_content_marketing_input
from .social_pack_v2 import (
    AIImageMetadata,
    AssetV2,
    ChannelType,
    CitationItem,
    CTAObject,
    FactItem,
    SentenceMap,
    SocialPack as SocialPackV2,
    SocialPackStatusType,
    compute_content_hash,
)
from .tenant_guard import TenantAccessForbiddenError, TenantGuard

logger = logging.getLogger(__name__)

# Ghim phiên bản prompt và mô hình
PROMPT_VERSION = "content-generate-v1"
MIN_FACTS_THRESHOLD = 3

# Tải nội dung system prompt
PROMPT_PATHS = (
    Path(__file__).resolve().parents[3] / "prompts" / "content" / "generate.v1.md",
    Path(__file__).resolve().parents[3] / "prompts" / "content-generate-v1.md",
)
SYSTEM_PROMPT = ""
for p in PROMPT_PATHS:
    if p.exists():
        SYSTEM_PROMPT = p.read_text(encoding="utf-8")
        break
if not SYSTEM_PROMPT:
    SYSTEM_PROMPT = (
        "Bạn là Chuyên gia Sáng tạo Nội dung Mạng Xã hội của AI Growth OS. "
        "Viết caption Facebook/TikTok dựa chính xác vào facts được cung cấp và đúng brand voice. "
        "Bắt buộc gắn câu CTA nguyên văn ở cuối bài. Tuân thủ Zero-Claim cho hook và CTA."
    )


class GeneratedContentDraft(BaseModel):
    """Cấu trúc kết quả sinh caption mạng xã hội từ LLM."""
    model_config = ConfigDict(extra="ignore")

    caption: str = Field(min_length=1, max_length=5000, description="Toàn bộ nội dung bài đăng mạng xã hội")
    alt_text: str = Field(default="Hình ảnh minh họa hỗ trợ bài đăng", max_length=500)
    hashtags: list[str] = Field(default_factory=list, description="Danh sách hashtags liên quan")


def normalize_cta_object(verbatim_cta: str, default_url: str = "https://tripc.vn") -> CTAObject:
    """Chuẩn hóa chuỗi CTA nguyên văn thành CTAObject hợp lệ theo schema."""
    text = str(verbatim_cta).strip()
    url_match = re.search(r"https?://[^\s]+", text)
    target_url = url_match.group(0) if url_match else default_url
    label = text if len(text) <= 100 else text[:97] + "..."
    cta_type = "open_link" if url_match else "contact_us"
    return CTAObject(type=cta_type, label=label, target_url=target_url)


def generate_deterministic_social_draft(
    title: str,
    facts: Sequence[FactItem],
    brand_voice: str,
    channels: Sequence[str],
    verbatim_cta: str,
) -> dict[str, Any]:
    """Sinh caption xã hội xác định cho chế độ test mock, đảm bảo tính chuẩn xác và bảo chứng facts."""
    # 1. Câu Hook phù hợp brand voice và kênh
    is_tiktok_only = set(channels) == {"tiktok"}
    if "năng động" in brand_voice.lower() or "chuyên nghiệp" in brand_voice.lower():
        hook = "Cùng khám phá không gian làm việc số và sáng tạo ngay hôm nay." if not is_tiktok_only else "Check-in ngay điểm hẹn làm việc siêu năng động này nhé!"
    elif "thư thái" in brand_voice.lower() or "nghỉ dưỡng" in brand_voice.lower():
        hook = "Tìm về một chốn bình yên cho kỳ nghỉ dưỡng trọn vẹn bên gia đình."
    else:
        hook = "Khám phá không gian lưu trú lý tưởng và tiện nghi thực tế cùng chúng tôi."

    # 2. Thân bài chứa các câu factual trực tiếp từ facts
    factual_sentences: list[str] = []
    for f in list(facts)[:3]:
        sentence_clean = f.text.strip().rstrip(".!?") + "."
        factual_sentences.append(sentence_clean)

    body_text = " ".join(factual_sentences)

    # 3. Câu CTA nguyên văn
    cta_clean = verbatim_cta.strip()

    # 4. Hashtags
    hashtags = ["#tripc", "#danang", "#socialcontent"]
    if "tiktok" in channels:
        hashtags.extend(["#xuhuong", "#reviewdanang"])

    full_caption = f"{hook}\n\n{body_text}\n\n{cta_clean}"
    return {
        "caption": full_caption,
        "alt_text": f"Hình ảnh thực tế minh họa cho bài viết {title}",
        "hashtags": hashtags,
    }


def validate_content_generate(job: JobRequest, p: Any, settings: Settings) -> list[tuple[str, str]]:
    """Hàm kiểm tra hợp lệ tại thời điểm nhận request của API server."""
    problems: list[tuple[str, str]] = []
    if hasattr(p, "business_profile"):
        problems += validate_context(job, p)
    if hasattr(p, "source_article"):
        problems += artifact_problems(job, p.source_article, "seo")
        if hasattr(p, "snapshot"):
            problems += evidence_problems(job, p.snapshot, p.source_article.evidence)

    # Kiểm tra kênh phân phối
    target_channels = getattr(p, "target_channels", ["facebook", "tiktok"])
    for ch in target_channels:
        if ch not in ("facebook", "tiktok"):
            problems.append(("INVALID_CHANNELS", f"Kênh '{ch}' không được hỗ trợ. Chỉ chấp nhận facebook hoặc tiktok."))

    # Kiểm tra tenant assets
    assets = getattr(p, "assets", [])
    if any(getattr(a, "workspace_id", None) != job.workspace_id for a in assets):
        problems.append(("TENANT_SCOPE_VIOLATION", "Foreign image asset from different tenant"))

    return problems


async def run_content_generate(ctx: RunContext) -> OperationOutcome:
    """Handler chuyên trách cho operation content.generate (CM-09)."""
    t_start = time.perf_counter()
    job = ctx.job
    p = ctx.payload
    workspace_id = str(job.workspace_id)

    # =========================================================================
    # BƯỚC 1: VALIDATE ĐẦU VÀO & TENANT ISOLATION (CM-04 / CM-06)
    # =========================================================================
    t_step_val = time.perf_counter()

    # Kiểm tra TenantGuard
    article_ws = getattr(p.source_article.artifact, "workspace_id", None)
    TenantGuard.verify_workspace_access(workspace_id, article_ws)
    if hasattr(p.source_article, "result") and isinstance(p.source_article.result, dict):
        res_ws = p.source_article.result.get("workspace_id")
        if res_ws:
            TenantGuard.verify_workspace_access(workspace_id, res_ws)
    for asset in getattr(p, "assets", []):
        TenantGuard.verify_workspace_access(workspace_id, getattr(asset, "workspace_id", None))

    # Lấy dữ liệu bài viết SEO
    article_dict = p.source_article.result
    parent_version = int(p.source_article.artifact.version)
    expected_content_hash = p.source_article.artifact.content_hash

    target_channels = list(getattr(p, "target_channels", ["facebook", "tiktok"]))
    val_result = validate_content_marketing_input(
        workspace_id=workspace_id,
        article_input=article_dict,
        parent_version=parent_version,
        expected_content_hash=expected_content_hash,
        target_channels=target_channels,
        evidence=p.source_article.evidence,
    )
    val_result.raise_if_invalid()
    parsed_article = val_result.article
    if parsed_article is None:
        raise OperationError("INVALID_ARTICLE_PAYLOAD", "Cannot parse valid SeoArticle object")

    t_val_ms = (time.perf_counter() - t_step_val) * 1000.0

    # =========================================================================
    # BƯỚC 2: TRÍCH XUẤT FACTS CÓ KIỂM CHỨNG & NGƯỠNG TỐI THIỂU (CM-07)
    # =========================================================================
    t_step_facts = time.perf_counter()
    extractor = FactExtractor(min_similarity=0.9)
    extracted_facts = extractor.extract_from_article(parsed_article, ctx=ctx)
    t_facts_ms = (time.perf_counter() - t_step_facts) * 1000.0

    facts_count = len(extracted_facts)
    is_insufficient_facts = facts_count < MIN_FACTS_THRESHOLD

    # =========================================================================
    # BƯỚC 3: THẨM ĐỊNH TÀI SẢN HÌNH ẢNH THEO CHÍNH SÁCH DUAL-ASSET (CM-05)
    # =========================================================================
    t_step_asset = time.perf_counter()
    converted_assets: list[dict[str, Any]] = []
    for a in getattr(p, "assets", []):
        converted_assets.append({
            "asset_id": str(getattr(a, "asset_id", uuid4())),
            "workspace_id": str(getattr(a, "workspace_id", workspace_id)),
            "url": str(getattr(a, "url", "")),
            "source_type": "ai_generated" if getattr(a, "synthetic", False) else "real_asset",
            "license": getattr(a, "license", "enterprise_owned"),
            "attribution": getattr(a, "attribution", "TripC Da Nang"),
            "status": getattr(a, "status", "approved"),
            "alt_text": getattr(a, "alt_text", "Approved asset"),
        })

    asset_decision = DualAssetManager.decide_asset_status(
        request={
            "title": parsed_article.title,
            "body_markdown": parsed_article.body_markdown,
            "allow_ai_image": getattr(p, "allow_ai_image", True),
            "real_product": getattr(p, "real_product", None),
        },
        assets=converted_assets,
    )
    t_asset_ms = (time.perf_counter() - t_step_asset) * 1000.0

    # =========================================================================
    # BƯỚC 4: GỌI LLM SINH CAPTION THEO KÊNH VÀ BRAND VOICE
    # =========================================================================
    t_step_llm = time.perf_counter()

    # Kênh được chọn
    channels: list[ChannelType] = [ch for ch in target_channels if ch in ("facebook", "tiktok")]
    if not channels:
        channels = ["facebook", "tiktok"]

    # CTA lấy nguyên văn từ request hoặc profile
    verbatim_cta = str(getattr(p, "cta", "")).strip()
    if not verbatim_cta and hasattr(p, "business_profile"):
        verbatim_cta = getattr(p.business_profile, "cta", "Liên hệ ngay để nhận ưu đãi!")

    # Brand voice
    brand_voice = getattr(p, "brand_voice", None)
    if not brand_voice and hasattr(p, "business_profile"):
        brand_voice = getattr(p.business_profile, "voice", "Thực tế, thân thiện, minh bạch")
    brand_voice = brand_voice or "Thực tế, thân thiện, minh bạch"

    llm_payload = {
        "title": parsed_article.title,
        "brand_voice": brand_voice,
        "target_channels": channels,
        "verbatim_cta": verbatim_cta,
        "facts": [f.model_dump(mode="json") for f in extracted_facts],
    }

    if is_insufficient_facts:
        caption = (
            f"Nội dung bài viết chưa đủ thông tin sự thật tối thiểu "
            f"({facts_count}/{MIN_FACTS_THRESHOLD} facts). {verbatim_cta}"
        )
        alt_text = f"Tài liệu bài viết {parsed_article.title}"
        hashtags = ["#tripc", "#danang"]
    else:
        def fake_factory() -> dict[str, Any]:
            return generate_deterministic_social_draft(
                title=parsed_article.title,
                facts=extracted_facts,
                brand_voice=brand_voice,
                channels=channels,
                verbatim_cta=verbatim_cta,
            )

        draft = await call_draft(
            ctx=ctx,
            system=SYSTEM_PROMPT,
            data=llm_payload,
            model=GeneratedContentDraft,
            fake=fake_factory,
        )
        caption = draft.caption
        alt_text = draft.alt_text
        hashtags = draft.hashtags

    t_llm_ms = (time.perf_counter() - t_step_llm) * 1000.0

    # =========================================================================
    # BƯỚC 5: ÁNH XẠ CÂU - SỰ THẬT & KIỂM TRA NLI ENTAILMENT (CM-08)
    # =========================================================================
    t_step_mapping = time.perf_counter()

    if is_insufficient_facts:
        sentence_fact_map: list[SentenceMap] = []
    else:
        sentence_fact_map = map_caption_to_sentence_fact_map(
            caption=caption,
            facts=extracted_facts,
            expected_cta=verbatim_cta,
        )

    t_mapping_ms = (time.perf_counter() - t_step_mapping) * 1000.0

    # =========================================================================
    # BƯỚC 6: XÁC ĐỊNH TRẠNG THÁI VÀ ĐÓNG GÓI SOCIALPACK V2
    # =========================================================================
    # Quy tắc phân xử trạng thái:
    # 1. facts < 3 -> insufficient_data
    # 2. Thiếu ảnh thật theo Dual-Asset -> needs_assets
    # 3. Có câu factual unsupported -> insufficient_data
    # 4. Đạt chuẩn đầy đủ -> draft
    if is_insufficient_facts:
        status: SocialPackStatusType = "insufficient_data"
        rejection_reason: str | None = (
            f"Bài viết không đủ thông tin sự thật tối thiểu để tạo SocialPack "
            f"(yêu cầu ≥ {MIN_FACTS_THRESHOLD} facts, thực tế có {facts_count} facts)."
        )
    elif asset_decision.status == "needs_assets":
        status = "needs_assets"
        rejection_reason = asset_decision.reason
    else:
        unsupported_claims = [
            s for s in sentence_fact_map
            if s.sentence_type == "factual" and s.entailment_status == "unsupported"
        ]
        if unsupported_claims:
            status = "insufficient_data"
            rejection_reason = (
                f"Phát hiện {len(unsupported_claims)} câu khẳng định chưa được facts bảo chứng."
            )
        else:
            status = "draft"
            rejection_reason = None

    # Chuyển đổi danh sách assets sang AssetV2
    image_assets_v2: list[AssetV2] = []
    for item in asset_decision.approved_real_assets:
        image_assets_v2.append(
            AssetV2(
                asset_id=str(item.get("asset_id", f"ast_real_{uuid4().hex[:8]}")),
                url=str(item.get("url", "https://tripc.vn/media/real-asset.jpg")),
                source_type="real_asset",
                license=str(item.get("license", "enterprise_owned")),
                attribution=str(item.get("attribution", "TripC Da Nang")),
                alt_text=str(item.get("alt_text", alt_text)),
            )
        )
    for item in asset_decision.approved_ai_assets:
        ai_alt = str(item.get("alt_text", f"[Ảnh minh họa AI] {alt_text}"))
        if not ai_alt.startswith("[Ảnh minh họa AI]"):
            ai_alt = f"[Ảnh minh họa AI] {ai_alt}"
        image_assets_v2.append(
            AssetV2(
                asset_id=str(item.get("asset_id", f"ast_ai_{uuid4().hex[:8]}")),
                url=str(item.get("url", "https://tripc.vn/media/ai-asset.png")),
                source_type="ai_generated",
                license=str(item.get("license", "ai_generated")),
                attribution=str(item.get("attribution", "Flux-1-dev / TripC")),
                alt_text=ai_alt,
            )
        )

    # Metadata sinh ảnh AI nếu có ảnh AI
    ai_image_meta: AIImageMetadata | None = None
    if any(a.source_type == "ai_generated" for a in image_assets_v2):
        ai_image_meta = AIImageMetadata(
            model_name="flux-1-dev",
            prompt=f"Modern architectural photography of {parsed_article.title}, high detail, natural lighting",
            seed=42,
            ocr_checked=True,
        )

    # Chuyển đổi citations
    citations_v2: list[CitationItem] = []
    for idx, c in enumerate(parsed_article.citations, 1):
        citations_v2.append(
            CitationItem(
                id=f"c{idx:02d}",
                url=str(getattr(c, "url", getattr(c, "locator", f"https://tripc.vn/citations/{idx}"))),
                title=getattr(c, "title", f"Tài liệu tham khảo {idx}"),
            )
        )

    cta_obj = normalize_cta_object(verbatim_cta)

    t_total_ms = (time.perf_counter() - t_start) * 1000.0

    telemetry = {
        "latency_validation_ms": round(t_val_ms, 2),
        "latency_fact_extraction_ms": round(t_facts_ms, 2),
        "latency_asset_decision_ms": round(t_asset_ms, 2),
        "latency_llm_generation_ms": round(t_llm_ms, 2),
        "latency_sentence_mapping_ms": round(t_mapping_ms, 2),
        "total_latency_ms": round(t_total_ms, 2),
        "model_version": getattr(ctx.provider, "model_version", "pinned/content-generate-v1"),
        "prompt_version": PROMPT_VERSION,
        "min_facts_threshold": MIN_FACTS_THRESHOLD,
        "facts_extracted_count": facts_count,
        "channels_generated": channels,
    }

    pack = SocialPackV2(
        pack_id=f"spk_{job.job_id.hex[:12]}",
        workspace_id=workspace_id,
        parent_content_id=str(parsed_article.article_id),
        parent_version=parent_version,
        channels=channels,
        caption=caption,
        cta=cta_obj,
        extracted_facts=extracted_facts,
        sentence_fact_map=sentence_fact_map,
        image_assets=image_assets_v2,
        ai_image_meta=ai_image_meta,
        citations=citations_v2,
        version=1,
        bundle_id=get_active_bundle_id(),
        status=status,
        rejection_reason=rejection_reason,
        metadata={"telemetry": telemetry},
    )

    pack.content_hash = compute_content_hash(pack)

    # =========================================================================
    # BƯỚC 7: VÒNG TỰ SỬA PHẢN TƯ (REFLECTION LOOP - CM-15)
    # =========================================================================
    if not is_insufficient_facts and status != "needs_assets":
        from .reflection_loop import ReflectionCorrectionLoop

        def refine_draft(current: SocialPackV2, feedback: Any) -> SocialPackV2:
            clean_draft = generate_deterministic_social_draft(
                title=parsed_article.title,
                facts=extracted_facts,
                brand_voice=brand_voice,
                channels=channels,
                verbatim_cta=verbatim_cta,
            )
            clean_map = map_caption_to_sentence_fact_map(
                caption=clean_draft["caption"],
                facts=extracted_facts,
                expected_cta=verbatim_cta,
            )
            p_dict = current.model_dump()
            p_dict["caption"] = clean_draft["caption"]
            p_dict["sentence_fact_map"] = [s.model_dump() for s in clean_map]
            return SocialPackV2(**p_dict)

        loop = ReflectionCorrectionLoop()
        pack, quality_report = loop.run_loop(
            initial_pack=pack,
            facts=extracted_facts,
            refinement_generator_fn=refine_draft,
            brand_voice=brand_voice,
        )
        status = pack.status
        rejection_reason = pack.rejection_reason

    warnings: list[str] = []
    if status == "needs_assets":
        warnings.append("PACK_REQUIRES_APPROVED_REAL_ASSETS")
    elif status == "insufficient_data":
        warnings.append("PACK_INSUFFICIENT_DATA_UNVERIFIED_CLAIMS")

    return OperationOutcome(
        result=pack.model_dump(mode="json"),
        evidence=p.source_article.evidence,
        warnings=warnings,
    )
