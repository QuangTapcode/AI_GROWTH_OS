"""SocialPack v2 Schema & Business Validators (CM-01).

Implements the technical specification from Section 6 and Section 15 of
'Ke_hoach_Agent_Content_Marketing_v2.docx'.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


ChannelType = Literal["facebook", "tiktok"]
SocialPackStatusType = Literal["draft", "needs_assets", "insufficient_data"]
SentenceType = Literal["factual", "hook", "cta"]
EntailmentStatusType = Literal["supported", "partial", "unsupported", "contradicted", "unverifiable"]
AssetSourceType = Literal["real_asset", "ai_generated"]


class CTAObject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str = Field(min_length=1, max_length=50, description="Loại CTA: send_message, open_link, contact_us...")
    label: str = Field(min_length=1, max_length=100, description="Nhãn hiển thị nút hành động")
    target_url: str = Field(min_length=1, max_length=500, description="Đường dẫn đích")


class FactItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fact_id: str = Field(pattern=r"^f\d+$", description="Mã định danh duy nhất của fact: f01, f02...")
    text: str = Field(min_length=1, max_length=1000, description="Nội dung khẳng định sự thật")
    source_type: str = Field(default="seo_body", max_length=50, description="Nguồn bóc tách: seo_body, seo_title, citation...")


class SentenceMap(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sentence_index: int = Field(ge=0, description="Thứ tự câu trong caption, bắt đầu từ 0")
    text: str = Field(min_length=1, max_length=1000, description="Nội dung câu hoàn chỉnh")
    sentence_type: SentenceType = Field(description="Phân loại: factual, hook, hoặc cta")
    fact_id: list[str] | Literal["NONE", "SYSTEM_CTA"] = Field(
        description="Danh sách fact_id (cho câu factual) hoặc 'NONE'/'SYSTEM_CTA' (cho hook/cta)"
    )
    entailment_status: EntailmentStatusType = Field(
        default="supported",
        description="Trạng thái suy diễn NLI: supported, contradicted, hoặc unverifiable"
    )
    is_factual: bool | None = Field(default=None, description="Cờ phụ trợ đánh dấu câu có tính sự thật")

    @model_validator(mode="after")
    def validate_sentence_fact_assignment(self) -> SentenceMap:
        if self.sentence_type == "factual":
            if isinstance(self.fact_id, str):
                raise ValueError(
                    f"Câu factual (câu {self.sentence_index}) bắt buộc phải liên kết danh sách fact_id hợp lệ, "
                    f"không được là chuỗi '{self.fact_id}'."
                )
            if not isinstance(self.fact_id, list) or len(self.fact_id) == 0:
                raise ValueError(
                    f"Câu factual (câu {self.sentence_index}) bắt buộc phải có ít nhất 1 fact_id hợp lệ."
                )
            for fid in self.fact_id:
                if fid in ("NONE", "SYSTEM_CTA"):
                    raise ValueError(
                        f"Câu factual (câu {self.sentence_index}) không được chứa giá trị phi sự thật '{fid}'."
                    )
        elif self.sentence_type in ("hook", "cta"):
            expected_labels = ("NONE", "SYSTEM_CTA")
            if isinstance(self.fact_id, list) or self.fact_id not in expected_labels:
                raise ValueError(
                    f"Câu {self.sentence_type} (câu {self.sentence_index}) tuân thủ Zero-Claim Rule, "
                    f"không được gắn fact_id thật (giá trị hiện tại: {self.fact_id}). "
                    f"Chỉ chấp nhận 'NONE' hoặc 'SYSTEM_CTA'."
                )
        return self


class AIImageMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_name: str = Field(min_length=1, max_length=100, description="Tên mô hình ghim cứng: flux-1-dev, imagen-3...")
    prompt: str = Field(min_length=1, max_length=2000, description="Prompt tiếng Anh tạo ảnh")
    seed: int = Field(ge=0, description="Seed tái tạo ảnh xác định")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat(), description="Thời gian sinh")
    ocr_checked: bool = Field(default=True, description="Đã qua kiểm tra Tesseract OCR chữ và giá")


class AssetV2(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: str = Field(min_length=1, max_length=100, description="Mã định danh ảnh: ast_...")
    url: str = Field(min_length=1, max_length=1000, description="URL ảnh có thể truy cập")
    source_type: AssetSourceType = Field(description="Phân loại: real_asset (ảnh thật) hoặc ai_generated (ảnh AI)")
    license: str = Field(min_length=1, max_length=200, description="Giấy phép bản quyền: enterprise_owned, licensed_stock, ai_generated...")
    attribution: str = Field(min_length=1, max_length=300, description="Ghi nhận quyền tác giả / mô hình sinh")
    alt_text: str = Field(min_length=1, max_length=500, description="Mô tả văn bản thay thế")

    @model_validator(mode="after")
    def validate_asset_policy(self) -> AssetV2:
        if self.source_type == "real_asset":
            if not self.license or not self.license.strip():
                raise ValueError(f"Ảnh thật '{self.asset_id}' bắt buộc phải có license hợp lệ.")
            if not self.attribution or not self.attribution.strip():
                raise ValueError(f"Ảnh thật '{self.asset_id}' bắt buộc phải có attribution hợp lệ.")
        elif self.source_type == "ai_generated":
            prefix = "[Ảnh minh họa AI]"
            if not self.alt_text.startswith(prefix):
                raise ValueError(
                    f"Ảnh AI '{self.asset_id}' bắt buộc phải có alt_text bắt đầu bằng '{prefix}'."
                )
        return self


class CitationItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=50, description="Mã trích dẫn: c01, c02...")
    url: str = Field(min_length=1, max_length=1000, description="Đường dẫn nguồn tài liệu")
    title: str | None = Field(default=None, max_length=300, description="Tiêu đề tài liệu nguồn")


class SocialPack(BaseModel):
    """Schema SocialPack v2.0 theo chuẩn thiết kế Agent Content Marketing."""
    model_config = ConfigDict(extra="forbid")

    pack_id: str = Field(min_length=1, max_length=100, description="Mã định danh SocialPack")
    workspace_id: str = Field(min_length=1, max_length=100, description="Định danh tenant cách ly dữ liệu")
    parent_content_id: str = Field(min_length=1, max_length=100, description="Khóa ngoại trỏ đến article_id của SEO Worker")
    parent_version: int = Field(ge=1, description="Số phiên bản của bài viết SEO nguồn")
    channels: list[ChannelType] = Field(min_length=1, description="Danh sách kênh phân phối mục tiêu: facebook, tiktok")
    caption: str = Field(min_length=1, max_length=5000, description="Nội dung caption bài đăng")
    cta: CTAObject = Field(description="Lời kêu gọi hành động chuẩn hóa")
    extracted_facts: list[FactItem] = Field(default_factory=list, description="Danh sách facts có ID duy nhất")
    sentence_fact_map: list[SentenceMap] = Field(default_factory=list, description="Ánh xạ từng câu với fact ID")
    image_assets: list[AssetV2] = Field(default_factory=list, description="Danh sách tài sản hình ảnh")
    ai_image_meta: AIImageMetadata | None = Field(default=None, description="Metadata sinh ảnh AI (bắt buộc khi có ảnh AI)")
    citations: list[CitationItem] = Field(default_factory=list, description="Danh sách trích dẫn nguồn")
    version: int = Field(default=1, ge=1, description="Phiên bản của SocialPack")
    bundle_id: str | None = Field(default=None, max_length=100, description="Mã bundle immutable của Agent đã sinh ra SocialPack (VD: content_agent_release_v2)")
    content_hash: str = Field(default="", description="Mã băm toàn vẹn nội dung SHA-256")
    status: SocialPackStatusType = Field(default="draft", description="Trạng thái: draft, needs_assets, insufficient_data")
    rejection_reason: str | None = Field(default=None, max_length=1000, description="Lý do từ chối / cần bổ sung tài sản")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Metadata bổ sung kỹ thuật/telemetry")

    @model_validator(mode="after")
    def validate_social_pack_integrity(self) -> SocialPack:
        # 1. Ràng buộc kênh phân phối (channels)
        valid_channels = {"facebook", "tiktok"}
        for ch in self.channels:
            if ch not in valid_channels:
                raise ValueError(f"Kênh '{ch}' không hợp lệ. Chỉ chấp nhận 'facebook' hoặc 'tiktok'.")

        # 2. Ràng buộc trạng thái (status)
        valid_statuses = {"draft", "needs_assets", "insufficient_data"}
        if self.status not in valid_statuses:
            raise ValueError(f"Trạng thái '{self.status}' không hợp lệ. Chỉ chấp nhận: {sorted(valid_statuses)}.")

        # 3. Ràng buộc Fact ID phải tồn tại trong extracted_facts (nếu có extracted_facts)
        if self.extracted_facts:
            known_facts = {f.fact_id for f in self.extracted_facts}
            for s in self.sentence_fact_map:
                if s.sentence_type == "factual" and isinstance(s.fact_id, list):
                    for fid in s.fact_id:
                        if fid not in known_facts:
                            raise ValueError(
                                f"Fact ID '{fid}' tại câu {s.sentence_index} không tồn tại trong extracted_facts."
                            )

        # 4. Ràng buộc ảnh AI phải có ai_image_meta
        has_ai_image = any(a.source_type == "ai_generated" for a in self.image_assets)
        if has_ai_image and self.ai_image_meta is None:
            raise ValueError("SocialPack chứa ảnh AI (source_type='ai_generated') nhưng thiếu ai_image_meta.")

        # 5. Tự động tính content_hash nếu chưa có
        if not self.content_hash:
            self.content_hash = compute_content_hash(self)

        return self


# ==============================================================================
# HÀM TÍNH TOÁN CONTENT HASH (SHA-256)
# ==============================================================================

def compute_content_hash(pack: SocialPack | dict[str, Any]) -> str:
    """Tính mã băm SHA-256 trên biểu diễn JSON chuẩn hóa của nội dung nghiệp vụ.

    QUY TẮC PHÂN ĐỊNH TRƯỜNG DỮ LIỆU:
    1. CÁC TRƯỜNG NẰM TRONG HASH (Quyết định tính toàn vẹn nội dung của SocialPack):
       - parent_content_id: Khóa ngoại bài viết SEO nguồn
       - parent_version: Phiên bản bài viết SEO nguồn
       - channels: Danh sách kênh phân phối (sắp xếp tăng dần để đảm bảo tính xác định)
       - caption: Nội dung văn bản bài đăng
       - cta: Lời kêu gọi hành động (type, label, target_url)
       - extracted_facts: Toàn bộ danh sách facts được trích xuất
       - sentence_fact_map: Toàn bộ bảng ánh xạ câu - sự thật
       - image_assets: Toàn bộ thông tin tài sản hình ảnh được gắn kèm
       - ai_image_meta: Metadata prompt/seed sinh ảnh AI (nếu có)
       - citations: Toàn bộ danh sách trích dẫn tài liệu

    2. CÁC TRƯỜNG LOẠI TRỪ KHỎI HASH (Metadata vòng đời & trạng thái vận hành):
       - content_hash: Chính trường mã băm
       - bundle_id: Mã bundle immutable của Agent phát hành
       - pack_id: Định danh duy nhất thực thể
       - workspace_id: Định danh tenant cách ly CSDL
       - version: Số phiên bản vòng đời của SocialPack
       - status: Trạng thái quy trình (draft, needs_assets, insufficient_data)
       - rejection_reason: Lý do từ chối do hệ thống hoặc người dùng đưa ra
       - metadata: Dữ liệu đo lường kỹ thuật / APM telemetry
    """
    if isinstance(pack, SocialPack):
        data = pack.model_dump(mode="json")
    else:
        data = dict(pack)

    # Trích xuất payload nội dung nghiệp vụ thuần túy
    channels = sorted(list(data.get("channels", [])))

    canonical_payload = {
        "parent_content_id": str(data.get("parent_content_id", "")),
        "parent_version": int(data.get("parent_version", 1)),
        "channels": channels,
        "caption": str(data.get("caption", "")),
        "cta": data.get("cta", {}),
        "extracted_facts": data.get("extracted_facts", []),
        "sentence_fact_map": data.get("sentence_fact_map", []),
        "image_assets": data.get("image_assets", []),
        "ai_image_meta": data.get("ai_image_meta", None),
        "citations": data.get("citations", []),
    }

    # Chuẩn hóa JSON: sắp xếp key, phân tách không dấu cách dư, utf-8
    canonical_json = json.dumps(
        canonical_payload,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":")
    )

    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


# ==============================================================================
# REQUEST & RESPONSE MODELS CHO 3 OPERATIONS
# ==============================================================================

class ContentGenerateRequest(BaseModel):
    """Payload đầu vào cho operation content.generate."""
    model_config = ConfigDict(extra="forbid")

    workspace_id: str = Field(min_length=1, max_length=100, description="Định danh tenant bắt buộc")
    parent_content_id: str = Field(min_length=1, max_length=100, description="article_id của bài viết SEO")
    parent_version: int = Field(ge=1, description="Phiên bản bài viết SEO")
    source_article: dict[str, Any] = Field(description="Dữ liệu bài viết SEO nguồn")
    channels: list[ChannelType] = Field(default_factory=lambda: ["facebook", "tiktok"], min_length=1)
    cta: CTAObject | str = Field(description="Lời kêu gọi hành động mong muốn")
    brand_voice: str | None = Field(default=None, max_length=500, description="Giọng điệu thương hiệu")
    allow_ai_image: bool = Field(default=True, description="Cho phép sinh ảnh AI minh họa nếu thiếu ảnh thật")
    available_real_assets: list[AssetV2] = Field(default_factory=list, description="Kho ảnh thật approved sẵn có")


class ContentGenerateResponse(BaseModel):
    """Kết quả trả về của operation content.generate."""
    model_config = ConfigDict(extra="forbid")

    social_pack: SocialPack = Field(description="Gói nội dung mạng xã hội được sinh")
    status: SocialPackStatusType = Field(description="Trạng thái gói nội dung")
    warnings: list[str] = Field(default_factory=list, description="Cảnh báo kỹ thuật nếu có")


class ContentRepurposeRequest(BaseModel):
    """Payload đầu vào cho operation content.repurpose."""
    model_config = ConfigDict(extra="forbid")

    workspace_id: str = Field(min_length=1, max_length=100, description="Định danh tenant bắt buộc")
    parent_content_id: str = Field(min_length=1, max_length=100, description="article_id của bài viết SEO")
    parent_version: int = Field(ge=1, description="Phiên bản bài viết SEO")
    source_article: dict[str, Any] = Field(description="Dữ liệu bài viết SEO nguồn")
    target_channel: ChannelType = Field(description="Kênh mục tiêu tái chế: facebook hoặc tiktok")
    format_style: Literal["standard_post", "story", "carousel", "short_script"] = Field(
        default="standard_post",
        description="Định dạng tái chế chuyên biệt"
    )
    cta: CTAObject | str = Field(description="Lời kêu gọi hành động")
    image_assets: list[AssetV2] = Field(default_factory=list, description="Ảnh đính kèm")


class ContentRepurposeResponse(BaseModel):
    """Kết quả trả về của operation content.repurpose."""
    model_config = ConfigDict(extra="forbid")

    social_pack: SocialPack = Field(description="Gói nội dung mạng xã hội đã tái chế")
    target_channel: ChannelType = Field(description="Kênh mục tiêu đã tái chế")
    status: SocialPackStatusType = Field(description="Trạng thái hoàn thành")


class ContentQualityCheckRequest(BaseModel):
    """Payload đầu vào cho operation content.quality_check."""
    model_config = ConfigDict(extra="forbid")

    workspace_id: str = Field(min_length=1, max_length=100, description="Định danh tenant bắt buộc")
    social_pack: SocialPack = Field(description="Gói nội dung cần thẩm định chất lượng")
    facts: list[FactItem] = Field(default_factory=list, description="Danh sách facts để kiểm tra đối chiếu")
    rubric_criteria: list[str] = Field(default_factory=list, description="Tiêu chí chấm điểm cụ thể")


class ContentQualityCheckResponse(BaseModel):
    """Kết quả trả về của operation content.quality_check."""
    model_config = ConfigDict(extra="forbid")

    passed: bool = Field(description="Đạt yêu cầu xuất bản hay không")
    score: float = Field(ge=0.0, le=100.0, description="Điểm đánh giá chất lượng (thang 100)")
    attribution_rate: float = Field(ge=0.0, le=1.0, description="Tỷ lệ quy kết sự thật (1.0 = 100%)")
    zero_claim_compliant: bool = Field(description="Tuân thủ Zero-Claim cho Hook/CTA")
    issues: list[str] = Field(default_factory=list, description="Danh sách lỗi phát hiện")
    suggested_fixes: list[str] = Field(default_factory=list, description="Gợi ý sửa đổi cho Reflection Loop")
