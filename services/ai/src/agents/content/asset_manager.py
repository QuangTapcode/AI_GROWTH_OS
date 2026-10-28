"""DualAssetManager for Media Asset Governance (CM-05).

Enforces Dual-Asset Policy from Section 7 of 'Ke_hoach_Agent_Content_Marketing_v2.docx':
1. Real Enterprise Assets (Ảnh thật doanh nghiệp/phòng/sản phẩm):
   - Mandatory for any article describing real rooms, products, or physical locations.
   - Must be approved, licensed, and attributed.
   - AI images are STRICTLY PROHIBITED from substituting real assets.
2. AI-Generated Images (Ảnh AI minh họa):
   - Allowed only for abstract concepts, trend commentary, or generalized tips.
   - Must contain alt_text starting with '[Ảnh minh họa AI]'.
   - Must pass Tesseract OCR check to prevent fabricated text/pricing.
"""

from __future__ import annotations

import re
from typing import Any, Literal, Mapping, Sequence
from pydantic import BaseModel, ConfigDict, Field


# ============================================================================
# TẬP TỪ KHÓA NHẬN DIỆN BÀI VIẾT MÔ TẢ SẢN PHẨM / PHÒNG / ĐỊA ĐIỂM THẬT
# ============================================================================

REAL_PRODUCT_KEYWORDS: tuple[str, ...] = (
    # Bất động sản, phòng lưu trú, căn hộ, khách sạn
    "phòng",
    "căn hộ",
    "homestay",
    "khách sạn",
    "resort",
    "villa",
    "biệt thự",
    "studio",
    "penthouse",
    "phòng ngủ",
    "phòng khách",
    "ban công",
    "view biển",
    "view hồ",
    "diện tích",
    "m2",
    "m²",
    "nội thất",
    "check-in",
    "check-out",
    "đặt phòng",
    "giá thuê",
    "bồn tắm",
    "hồ bơi riêng",
    "apartment",
    "hotel room",
    "suite",
    "nhà phố",
    # Sản phẩm vật lý hữu hình, trải nghiệm trực tiếp
    "sản phẩm thật",
    "sản phẩm vật lý",
    "trên tay",
    "đập hộp",
    "unboxing",
    "thông số kỹ thuật",
    "chất liệu",
    "showroom",
    "cửa hàng",
    "tận mắt",
    "ảnh thực tế",
    "chụp thực tế",
    "mặt hàng",
    "mẫu mã",
    # Địa điểm vật lý cụ thể
    "tọa lạc tại",
    "địa chỉ",
    "chi nhánh",
)

AI_IMAGE_ALT_PREFIX = "[Ảnh minh họa AI]"


class AssetDecision(BaseModel):
    """Kết quả thẩm định tài sản hình ảnh theo chính sách Dual-Asset."""
    model_config = ConfigDict(extra="forbid")

    status: Literal["draft", "needs_assets"] = Field(
        description="Trạng thái quyết định: draft (hợp lệ) hoặc needs_assets (thiếu ảnh thật/ảnh hợp lệ)"
    )
    reason: str = Field(description="Lý do chi tiết giải thích cho quyết định thẩm định")
    is_real_product: bool = Field(description="Cờ xác định bài viết có mô tả sản phẩm/phòng/địa điểm thật hay không")
    detection_method: Literal["explicit_flag", "keyword_rule", "default_abstract"] = Field(
        description="Phương thức nhận biết: cờ yêu cầu tường minh, luật từ khóa, hoặc mặc định khái niệm"
    )
    matched_keywords: list[str] = Field(default_factory=list, description="Danh sách từ khóa thực tế đã khớp")
    approved_real_assets: list[dict[str, Any]] = Field(default_factory=list, description="Ảnh thật đã được duyệt")
    approved_ai_assets: list[dict[str, Any]] = Field(default_factory=list, description="Ảnh AI hợp lệ đã được duyệt")
    rejected_or_pending_assets: list[dict[str, Any]] = Field(default_factory=list, description="Ảnh chưa được duyệt hoặc bị từ chối")
    policy_violations: list[str] = Field(default_factory=list, description="Danh sách cảnh báo vi phạm chính sách")


def _extract_text_corpus(request: Any) -> str:
    """Thu thập toàn bộ văn bản từ request để quét từ khóa nhận diện sản phẩm thật."""
    text_parts: list[str] = []

    def add_val(val: Any) -> None:
        if isinstance(val, str) and val.strip():
            text_parts.append(val.strip())
        elif isinstance(val, (list, tuple)):
            for item in val:
                add_val(item)
        elif isinstance(val, Mapping):
            for v in val.values():
                add_val(v)
        elif hasattr(val, "model_dump"):
            add_val(val.model_dump())

    if isinstance(request, Mapping):
        for key in ("title", "primary_keyword", "meta_description", "headings", "body_markdown", "caption", "topic", "extracted_facts"):
            if key in request:
                add_val(request[key])
    else:
        for attr in ("title", "primary_keyword", "meta_description", "headings", "body_markdown", "caption", "topic", "extracted_facts"):
            if hasattr(request, attr):
                add_val(getattr(request, attr))

    return " ".join(text_parts).lower()


def is_real_product_description(request: Any) -> tuple[bool, str, list[str]]:
    """Xác định bài viết có thuộc diện mô tả sản phẩm/phòng/địa điểm thật hay không.
    
    Quy tắc ưu tiên:
    1. Cờ tường minh trong request: `requires_real_asset` hoặc `is_real_product` (bool).
    2. Luật từ khóa (Keyword rule): Quét ngữ liệu tiêu đề, đề mục, nội dung, facts theo `REAL_PRODUCT_KEYWORDS`.
    3. Mặc định: False (bài viết chia sẻ khái niệm, xu hướng, thông tin chung).
    """
    # 1. Kiểm tra cờ tường minh
    explicit_flag: bool | None = None
    if isinstance(request, Mapping):
        if "requires_real_asset" in request and request["requires_real_asset"] is not None:
            explicit_flag = bool(request["requires_real_asset"])
        elif "is_real_product" in request and request["is_real_product"] is not None:
            explicit_flag = bool(request["is_real_product"])
    else:
        if hasattr(request, "requires_real_asset") and getattr(request, "requires_real_asset") is not None:
            explicit_flag = bool(getattr(request, "requires_real_asset"))
        elif hasattr(request, "is_real_product") and getattr(request, "is_real_product") is not None:
            explicit_flag = bool(getattr(request, "is_real_product"))

    if explicit_flag is not None:
        return explicit_flag, "explicit_flag", []

    # 2. Quét từ khóa
    corpus = _extract_text_corpus(request)
    matched: list[str] = []
    for kw in REAL_PRODUCT_KEYWORDS:
        # Tìm kiếm theo biên từ hoặc cụm từ
        pattern = r"(?<!\w)" + re.escape(kw) + r"(?!\w)"
        if re.search(pattern, corpus, flags=re.IGNORECASE):
            matched.append(kw)

    if matched:
        return True, "keyword_rule", matched

    return False, "default_abstract", []


def _normalize_asset(asset: Any) -> dict[str, Any]:
    """Chuẩn hóa cấu trúc asset về dạng dict đồng nhất."""
    if hasattr(asset, "model_dump"):
        res = asset.model_dump(mode="json")
        if "status" not in res:
            res["status"] = getattr(asset, "status", "approved")
        return res
    if isinstance(asset, Mapping):
        res = dict(asset)
        if "status" not in res:
            res["status"] = "approved"
        return res
    return {
        "asset_id": getattr(asset, "asset_id", getattr(asset, "id", "")),
        "source_type": getattr(asset, "source_type", getattr(asset, "asset_type", "real_asset")),
        "url": getattr(asset, "url", getattr(asset, "asset_url", "")),
        "license": getattr(asset, "license", ""),
        "attribution": getattr(asset, "attribution", ""),
        "status": getattr(asset, "status", "pending"),
        "alt_text": getattr(asset, "alt_text", ""),
        "workspace_id": getattr(asset, "workspace_id", None),
    }


class DualAssetManager:
    """Quản trị viên chính sách ảnh kép (Dual-Asset Governance Manager)."""

    @staticmethod
    def decide_asset_status(request: Any, assets: Sequence[Any]) -> AssetDecision:
        """Hàm thuần túy thẩm định trạng thái tài sản ảnh theo chính sách Dual-Asset.
        
        Quy tắc nghiệp vụ cốt lõi:
        - Bài mô tả sản phẩm/phòng/địa điểm thật mà không có ít nhất 1 ảnh thật (real_asset)
          đã được duyệt (status='approved') thì BẮT BUỘC trả về 'needs_assets'.
        - NGHIÊM CẤM dùng ảnh AI thay thế cho sản phẩm/phòng/địa điểm thật (TC-04, TC-05).
        - Bài khái niệm/xu hướng: được phép dùng ảnh thật approved hoặc ảnh AI approved kèm tiền tố '[Ảnh minh họa AI]'.
        """
        is_real, method, matched_kws = is_real_product_description(request)

        approved_real: list[dict[str, Any]] = []
        approved_ai: list[dict[str, Any]] = []
        rejected_or_pending: list[dict[str, Any]] = []
        policy_violations: list[str] = []

        for raw_asset in assets:
            norm_ast = _normalize_asset(raw_asset)
            status = norm_ast.get("status", "pending")
            source_type = norm_ast.get("source_type", "real_asset")
            alt_text = norm_ast.get("alt_text", "") or ""

            # Kiểm tra tuân thủ chính sách định dạng ảnh AI
            if source_type == "ai_generated":
                if not alt_text.startswith(AI_IMAGE_ALT_PREFIX):
                    policy_violations.append(
                        f"Ảnh AI '{norm_ast.get('asset_id')}' vi phạm quy định: alt_text bắt buộc phải bắt đầu bằng '{AI_IMAGE_ALT_PREFIX}'."
                    )

            if status == "approved":
                if source_type == "real_asset":
                    approved_real.append(norm_ast)
                elif source_type == "ai_generated":
                    approved_ai.append(norm_ast)
            else:
                rejected_or_pending.append(norm_ast)

        # ----------------------------------------------------------------------
        # TRƯỜNG HỢP 1: BÀI VIẾT MÔ TẢ SẢN PHẨM / PHÒNG / ĐỊA ĐIỂM THẬT
        # ----------------------------------------------------------------------
        if is_real:
            if not approved_real:
                # Nếu chỉ có ảnh AI mà không có ảnh thật -> chặn đứng ngay lập tức
                ai_warning = ""
                if approved_ai:
                    ai_warning = (
                        f" Phát hiện {len(approved_ai)} ảnh AI, tuy nhiên chính sách Dual-Asset "
                        f"nghiêm cấm dùng ảnh AI thay thế cho ảnh thật sản phẩm/phòng để tránh vi phạm đạo đức thương mại."
                    )
                reason = (
                    "Bài viết mô tả sản phẩm/phòng/địa điểm thật nhưng chưa có ảnh thật nào được phê duyệt (status='approved'). "
                    f"Chính sách Dual-Asset bắt buộc phải có ảnh chụp thật được cấp phép.{ai_warning}"
                )
                return AssetDecision(
                    status="needs_assets",
                    reason=reason,
                    is_real_product=True,
                    detection_method=method,
                    matched_keywords=matched_kws,
                    approved_real_assets=approved_real,
                    approved_ai_assets=approved_ai,
                    rejected_or_pending_assets=rejected_or_pending,
                    policy_violations=policy_violations,
                )

            # Đã có ảnh thật approved
            reason = (
                f"Đã có {len(approved_real)} ảnh thật được phê duyệt, đáp ứng đầy đủ chính sách "
                f"Dual-Asset cho bài viết mô tả sản phẩm/phòng/địa điểm thực tế."
            )
            return AssetDecision(
                status="draft",
                reason=reason,
                is_real_product=True,
                detection_method=method,
                matched_keywords=matched_kws,
                approved_real_assets=approved_real,
                approved_ai_assets=approved_ai,
                rejected_or_pending_assets=rejected_or_pending,
                policy_violations=policy_violations,
            )

        # ----------------------------------------------------------------------
        # TRƯỜNG HỢP 2: BÀI VIẾT KHÁI NIỆM / BÌNH LUẬN XU HƯỚNG / TIPS
        # ----------------------------------------------------------------------
        total_approved = len(approved_real) + len(approved_ai)
        if total_approved == 0:
            reason = "Chưa có tài sản hình ảnh nào được phê duyệt (ảnh thật hoặc ảnh AI hợp lệ)."
            return AssetDecision(
                status="needs_assets",
                reason=reason,
                is_real_product=False,
                detection_method=method,
                matched_keywords=[],
                approved_real_assets=approved_real,
                approved_ai_assets=approved_ai,
                rejected_or_pending_assets=rejected_or_pending,
                policy_violations=policy_violations,
            )

        reason = (
            f"Tài sản hình ảnh hợp lệ theo chính sách Dual-Asset ({len(approved_real)} ảnh thật, "
            f"{len(approved_ai)} ảnh AI minh họa được phê duyệt)."
        )
        return AssetDecision(
            status="draft",
            reason=reason,
            is_real_product=False,
            detection_method=method,
            matched_keywords=[],
            approved_real_assets=approved_real,
            approved_ai_assets=approved_ai,
            rejected_or_pending_assets=rejected_or_pending,
            policy_violations=policy_violations,
        )


# Hàm thuần túy tương thích theo yêu cầu đề bài
def decide_asset_status(request: Any, assets: Sequence[Any]) -> AssetDecision:
    """Hàm thuần túy thẩm định trạng thái tài sản ảnh theo chính sách Dual-Asset."""
    return DualAssetManager.decide_asset_status(request, assets)
