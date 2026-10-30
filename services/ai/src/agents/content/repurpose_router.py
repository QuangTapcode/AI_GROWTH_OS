"""Content Repurpose Router & Service (CM-18).

Implements the dedicated content.repurpose router for AI Growth OS:
1. Receives source article and target channel (Facebook or TikTok).
2. Performs 100% accurate routing:
   - "facebook" -> FacebookRepurposer (CM-16: 3-part layout, 3-5 Zero-Claim hashtags).
   - "tiktok"   -> TikTokRepurposer (CM-17: 120-180 word script, storyboard visual cues).
3. Preserves parent_content_id and parent_version, increments social pack version,
   and inherits citations from the SEO source article.
4. Ensures all output sentences pass through the Reflection Loop (Guardrails CM-13,
   Mapper/NLI CM-08, Judge CM-14), falling back to insufficient_data if hard errors persist.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Sequence
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
    evidence_problems,
    result_fields,
    validate_context,
)
from .asset_manager import DualAssetManager, is_real_product_description

from .fact_extractor import FactExtractor
from .fb_repurposer import FacebookRepurposer
from .input_validator import validate_content_marketing_input
from .social_pack_v2 import (
    AssetSourceType,
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
from .tiktok_repurposer import TikTokRepurposer

logger = logging.getLogger(__name__)

PROMPT_VERSION = "content-repurpose-v1"


class ContentRepurposePayload(MarketingContext):
    """Payload đầu vào cho operation content.repurpose."""
    source_article: ArtifactInput
    cta: str = Field(min_length=1, max_length=200)
    assets: list[ImageAsset] = Field(default_factory=list, max_length=10)
    target_channel: str | None = Field(default=None, description="Kênh mục tiêu: facebook hoặc tiktok")
    target_channels: list[str] = Field(default_factory=lambda: ["facebook"], max_length=4)
    format_style: str = Field(default="standard_post", max_length=50)
    brand_voice: str | None = Field(default=None, max_length=500)
    allow_ai_image: bool = Field(default=True)
    real_product: bool | None = Field(default=None)


def normalize_repurpose_cta(verbatim_cta: str, default_url: str = "https://tripc.vn") -> CTAObject:
    """Chuẩn hóa chuỗi CTA thành CTAObject hợp lệ."""
    import re
    text = str(verbatim_cta).strip()
    url_match = re.search(r"https?://[^\s]+", text)
    target_url = url_match.group(0) if url_match else default_url
    label = text if len(text) <= 100 else text[:97] + "..."
    cta_type = "open_link" if url_match else "contact_us"
    return CTAObject(type=cta_type, label=label, target_url=target_url)


def inherit_citations_from_evidence(evidence: Sequence[Any]) -> list[CitationItem]:
    """Kế thừa danh sách tài liệu trích dẫn từ bài SEO nguồn."""
    citations: list[CitationItem] = []
    for idx, ev in enumerate(evidence):
        cid = f"c{idx + 1:02d}"
        if isinstance(ev, EvidenceRef):
            url = ev.source_url or (ev.locator if ev.locator and ev.locator.startswith("http") else f"https://tripc.vn/citations/{cid}")
            title = ev.attribution or f"Tài liệu tham khảo {idx + 1}"
        elif isinstance(ev, dict):
            raw_url = ev.get("url") or ev.get("locator")
            url = str(raw_url) if raw_url and str(raw_url).startswith("http") else f"https://tripc.vn/ref/{cid}"
            title = ev.get("title") or None
        else:
            raw_url = getattr(ev, "url", getattr(ev, "locator", None))
            url = str(raw_url) if raw_url and str(raw_url).startswith("http") else f"https://tripc.vn/ref/{cid}"
            title = getattr(ev, "title", None)

        citations.append(CitationItem(id=cid, url=url, title=title))

    if not citations:
        citations.append(CitationItem(id="c01", url="https://tripc.vn/blog/article"))

    return citations



def route_repurpose(
    workspace_id: str,
    parent_content_id: str,
    parent_version: int,
    target_channel: str,
    source_article: dict[str, Any],
    verbatim_cta: str,
    facts: list[FactItem] | None = None,
    brand_voice: str | None = None,
    image_assets: list[AssetV2] | None = None,
    citations: list[CitationItem] | None = None,
    is_real_product: bool = False,
    current_version: int = 1,
) -> SocialPackV2:
    """Hàm định tuyến độc lập cốt lõi cho content.repurpose."""
    normalized_channel = str(target_channel).strip().lower()
    if normalized_channel not in ("facebook", "tiktok"):
        raise OperationError(
            "UNSUPPORTED_TARGET_CHANNEL",
            f"Kênh '{target_channel}' không được hỗ trợ. Chỉ hỗ trợ 'facebook' hoặc 'tiktok'."
        )

    # Trích xuất facts từ bài SEO nếu chưa có sẵn
    article_title = source_article.get("title", "Bài viết SEO")
    body_markdown = source_article.get("body_markdown", "")

    if facts is None:
        facts = FactExtractor().extract_from_text(body_markdown)


    cta_obj = normalize_repurpose_cta(verbatim_cta)
    image_assets = image_assets or []
    citations = citations or []

    # Định tuyến đúng 100% đến repurposer tương ứng
    if normalized_channel == "facebook":
        fb_repurposer = FacebookRepurposer()
        return fb_repurposer.repurpose(
            workspace_id=workspace_id,
            parent_content_id=parent_content_id,
            parent_version=parent_version,
            title=article_title,
            facts=facts,
            verbatim_cta=verbatim_cta,
            cta_object=cta_obj,
            brand_voice=brand_voice,
            image_assets=image_assets,
            citations=citations,
            is_real_product=is_real_product,
            version=current_version,
        )
    elif normalized_channel == "tiktok":
        tt_repurposer = TikTokRepurposer()
        return tt_repurposer.repurpose(
            workspace_id=workspace_id,
            parent_content_id=parent_content_id,
            parent_version=parent_version,
            title=article_title,
            facts=facts,
            verbatim_cta=verbatim_cta,
            cta_object=cta_obj,
            brand_voice=brand_voice,
            image_assets=image_assets,
            citations=citations,
            is_real_product=is_real_product,
            version=current_version,
        )
    else:
        raise OperationError("UNSUPPORTED_TARGET_CHANNEL", f"Kênh '{target_channel}' không hợp lệ.")


def validate_content_repurpose(job: JobRequest, p: Any, settings: Settings) -> list[tuple[str, str]]:
    """Hàm xác thực tính hợp lệ của request tại API Gateway."""
    problems: list[tuple[str, str]] = []
    if hasattr(p, "business_profile"):
        problems += validate_context(job, p)
    if hasattr(p, "source_article"):
        problems += artifact_problems(job, p.source_article, "seo")
        if hasattr(p, "snapshot"):
            problems += evidence_problems(job, p.snapshot, p.source_article.evidence)

    # Xác thực kênh mục tiêu
    channel = getattr(p, "target_channel", None)
    if channel and channel not in ("facebook", "tiktok"):
        problems.append(("UNSUPPORTED_TARGET_CHANNEL", f"Kênh '{channel}' không được hỗ trợ."))

    # Xác thực cách ly tài sản tenant
    assets = getattr(p, "assets", [])
    if any(getattr(a, "workspace_id", None) != job.workspace_id for a in assets):
        problems.append(("TENANT_SCOPE_VIOLATION", "Foreign image asset from different tenant"))

    return problems


async def run_content_repurpose(ctx: RunContext) -> OperationOutcome:
    """Handler chuyên trách cho operation content.repurpose (CM-18)."""
    t_start = time.perf_counter()
    job = ctx.job
    p = ctx.payload
    workspace_id = str(job.workspace_id)

    # 1. Xác thực TenantGuard & trích xuất dữ liệu bài viết SEO
    article_ws = getattr(p.source_article.artifact, "workspace_id", None)
    TenantGuard.verify_workspace_access(workspace_id, article_ws)
    if hasattr(p.source_article, "result") and isinstance(p.source_article.result, dict):
        res_ws = p.source_article.result.get("workspace_id")
        if res_ws:
            TenantGuard.verify_workspace_access(workspace_id, res_ws)

    for asset in getattr(p, "assets", []):
        TenantGuard.verify_workspace_access(workspace_id, getattr(asset, "workspace_id", None))

    article_dict = p.source_article.result
    parent_version = int(p.source_article.artifact.version)
    expected_content_hash = p.source_article.artifact.content_hash

    # Xác định kênh đích: ưu tiên target_channel, nếu không thì lấy từ target_channels[0]
    target_channel = getattr(p, "target_channel", None)
    if not target_channel:
        channels_list = getattr(p, "target_channels", ["facebook"])
        target_channel = channels_list[0] if channels_list else "facebook"

    if target_channel not in ("facebook", "tiktok"):
        raise OperationError(
            "UNSUPPORTED_TARGET_CHANNEL",
            f"Kênh '{target_channel}' không được hỗ trợ. Chỉ hỗ trợ 'facebook' hoặc 'tiktok'."
        )

    # Validate cấu trúc đầu vào theo tiêu chuẩn SEO consumer
    val_result = validate_content_marketing_input(
        workspace_id=workspace_id,
        article_input=article_dict,
        parent_version=parent_version,
        expected_content_hash=expected_content_hash,
        target_channels=[target_channel],
        evidence=p.source_article.evidence,
    )
    val_result.raise_if_invalid()
    parsed_article = val_result.article

    # 2. Chuẩn bị tài sản hình ảnh: chỉ nhận ảnh approved có license và attribution
    image_assets_v2: list[AssetV2] = []
    for a in getattr(p, "assets", []):
        if getattr(a, "status", None) != "approved":
            continue
        license_str = str(getattr(a, "license", "") or "").strip()
        attr_str = str(getattr(a, "attribution", "") or "").strip()
        if not license_str or not attr_str:
            continue

        source_type: AssetSourceType = "ai_generated" if getattr(a, "synthetic", False) else "real_asset"
        alt_text = getattr(a, "alt_text", "")
        if source_type == "ai_generated" and not str(alt_text).startswith("[Ảnh minh họa AI]"):
            alt_text = f"[Ảnh minh họa AI] {alt_text}".strip()
        elif source_type == "real_asset" and not alt_text:
            alt_text = f"Ảnh thực tế mô tả {parsed_article.title}"

        try:
            image_assets_v2.append(
                AssetV2(
                    asset_id=f"ast_{getattr(a, 'asset_id', uuid4())}",
                    url=str(getattr(a, "url", "https://cdn.tripc.vn/default.jpg")),
                    source_type=source_type,
                    license=license_str or "enterprise_owned",
                    attribution=attr_str or "TripC Co., Ltd",
                    alt_text=alt_text,
                )
            )
        except Exception as e:
            logger.warning("Không thể parse asset: %s", e)

    citations_v2 = inherit_citations_from_evidence(p.source_article.evidence)

    # 3. Trích xuất facts từ bài SEO
    extracted_facts = FactExtractor().extract_from_text(parsed_article.body_markdown)

    # 4. Xác định sản phẩm thực tế hoặc yêu cầu bắt buộc có media
    is_real, _, _ = is_real_product_description(parsed_article.title + " " + parsed_article.body_markdown)
    is_real_product = bool(getattr(p, "real_product", False) or is_real)

    # Nếu không có assets đã duyệt mà target_channels chứa tiktok hoặc là real product thì chuyển needs_assets
    all_target_channels = getattr(p, "target_channels", ["facebook"])
    if not image_assets_v2 and ("tiktok" in all_target_channels or is_real_product):
        is_real_product = True

    # 5. Gọi router độc lập
    parent_content_id_str = str(parsed_article.article_id)
    brand_voice = getattr(p, "brand_voice", None) or getattr(p.business_profile, "voice", "Chuyên nghiệp")
    verbatim_cta = str(p.cta).strip()

    repurposed_pack = route_repurpose(
        workspace_id=workspace_id,
        parent_content_id=parent_content_id_str,
        parent_version=parent_version,
        target_channel=target_channel,
        source_article=article_dict,
        verbatim_cta=verbatim_cta,
        facts=extracted_facts,
        brand_voice=brand_voice,
        image_assets=image_assets_v2,
        citations=citations_v2,
        is_real_product=is_real_product,
        current_version=1,
    )

    # 6. Đóng gói kết quả với tương thích DraftResult cho platform tests
    fields = result_fields(ctx, [p.source_article])
    pack_dict = repurposed_pack.model_dump(mode="json")

    # Giữ tương thích platform & test_six_roles
    pack_dict["synthetic"] = fields.get("synthetic", True) or any(getattr(a, "synthetic", False) for a in getattr(p, "assets", []))
    pack_dict["requires_human_approval"] = True
    pack_dict["applied"] = False
    raw_refs = fields.get("input_artifact_refs", [])
    pack_dict["input_artifact_refs"] = [
        ref.model_dump(mode="json") if hasattr(ref, "model_dump") else ref
        for ref in raw_refs
    ]
    if hasattr(p, "snapshot") and hasattr(p.snapshot, "snapshot_id"):
        pack_dict["context_snapshot_id"] = str(p.snapshot.snapshot_id)
    pack_dict["profile_version"] = getattr(p, "profile_version", 1)


    warnings: list[str] = []
    if repurposed_pack.status == "needs_assets":
        warnings.append("PACK_REQUIRES_APPROVED_REAL_ASSETS")
    elif repurposed_pack.status == "insufficient_data":
        warnings.append("PACK_INSUFFICIENT_DATA_UNVERIFIED_CLAIMS")

    return OperationOutcome(
        result=pack_dict,
        evidence=p.source_article.evidence,
        warnings=warnings,
    )
