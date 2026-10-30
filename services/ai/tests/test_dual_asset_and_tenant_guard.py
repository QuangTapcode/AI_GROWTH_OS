"""Tests for CM-03, CM-05, and CM-06: Dual-Asset Management & Multi-Tenant Isolation.

Covers:
- TC-04: Missing approved real asset for real product/room description -> status 'needs_assets'.
- TC-05: AI-generated image strictly forbidden from substituting real asset for real rooms/products.
- TC-08: Cross-workspace access to assets or articles triggers HTTP 403 Forbidden without leaking existence or tenant metadata.
- Migration 018 UP & DOWN: Schema integrity, column definitions, check constraints, indexes, and RLS policies.
"""

from __future__ import annotations

import re
from pathlib import Path
from uuid import UUID, uuid4

import pytest

from src.agents.content.asset_manager import (
    AI_IMAGE_ALT_PREFIX,
    REAL_PRODUCT_KEYWORDS,
    AssetDecision,
    DualAssetManager,
    decide_asset_status,
    is_real_product_description,
)
from src.agents.content.tenant_guard import (
    TenantAccessForbiddenError,
    TenantGuard,
    extract_resource_workspace_id,
    normalize_workspace_id,
)
from src.agents.content.social_pack_v2 import AssetV2
from src.agents.seo.schemas import SeoArticle



# ==============================================================================
# FIXTURES
# ==============================================================================

@pytest.fixture
def current_workspace_id() -> str:
    return str(uuid4())


@pytest.fixture
def foreign_workspace_id() -> str:
    return str(uuid4())


@pytest.fixture
def approved_real_asset(current_workspace_id) -> dict:
    return {
        "asset_id": "ast_real_001",
        "workspace_id": current_workspace_id,
        "source_type": "real_asset",
        "url": "https://cdn.tripc.com/danang/studio_living_room_real.jpg",
        "license": "enterprise_owned",
        "attribution": "TripC Da Nang Media Dept",
        "status": "approved",
        "alt_text": "Phòng khách căn hộ Studio TripC Đà Nẵng chụp thực tế",
        "content_hash": "a" * 64,
    }


@pytest.fixture
def pending_real_asset(current_workspace_id) -> dict:
    return {
        "asset_id": "ast_real_002",
        "workspace_id": current_workspace_id,
        "source_type": "real_asset",
        "url": "https://cdn.tripc.com/danang/bedroom_pending.jpg",
        "license": "enterprise_owned",
        "attribution": "TripC Da Nang Media Dept",
        "status": "pending",
        "alt_text": "Phòng ngủ đang chờ duyệt bản quyền",
        "content_hash": "b" * 64,
    }


@pytest.fixture
def approved_ai_asset(current_workspace_id) -> dict:
    return {
        "asset_id": "ast_ai_001",
        "workspace_id": current_workspace_id,
        "source_type": "ai_generated",
        "url": "https://cdn.tripc.com/ai/digital_nomad_lifestyle_concept.webp",
        "license": "ai_generated",
        "attribution": "Flux.1 [dev] via AI Engine",
        "status": "approved",
        "alt_text": f"{AI_IMAGE_ALT_PREFIX} Không gian làm việc tối giản bên bờ biển cho Digital Nomad",
        "content_hash": "c" * 64,
    }


@pytest.fixture
def real_room_seo_article(current_workspace_id) -> SeoArticle:
    """Bài viết SEO mô tả phòng/căn hộ thực tế tại Đà Nẵng."""
    return SeoArticle(
        article_id=uuid4(),
        workspace_id=UUID(current_workspace_id),
        context_snapshot_id=uuid4(),
        profile_version=1,
        version=1,
        status="draft",
        missing_facts=[],
        input_artifact_refs=[],
        requires_human_approval=True,
        applied=False,
        synthetic=True,
        title="Trải nghiệm Căn hộ Studio TripC Da Nang view biển Mỹ Khê",
        meta_description="Khám phá căn hộ Studio diện tích 35m2 đầy đủ nội thất tại Đà Nẵng.",
        primary_keyword="căn hộ studio đà nẵng",
        headings=["Vị trí đắc địa", "Tiện ích căn hộ studio"],
        body_markdown="Căn hộ studio 35m2 có ban công ngắm trọn biển Mỹ Khê. Giá thuê bao gồm toàn bộ phí quản lý.",
        cta="Đặt phòng ngay để nhận ưu đãi",
        citations=[],
        seo_checks={},
    )


@pytest.fixture
def concept_seo_article(current_workspace_id) -> SeoArticle:
    """Bài viết SEO chia sẻ xu hướng làm việc từ xa (không mô tả phòng/sản phẩm cụ thể)."""
    return SeoArticle(
        article_id=uuid4(),
        workspace_id=UUID(current_workspace_id),
        context_snapshot_id=uuid4(),
        profile_version=1,
        version=1,
        status="draft",
        missing_facts=[],
        input_artifact_refs=[],
        requires_human_approval=True,
        applied=False,
        synthetic=True,
        title="5 Xu hướng sống và làm việc từ xa của thế hệ Digital Nomad năm 2026",
        meta_description="Tìm hiểu xu hướng làm việc linh hoạt và phong cách sống tự do tại Đông Nam Á.",
        primary_keyword="xu hướng digital nomad",
        headings=["Làm việc linh hoạt", "Cộng đồng kết nối"],
        body_markdown="Lối sống tự do địa lý đang trở thành chuẩn mực mới cho các chuyên gia công nghệ toàn cầu.",
        cta="Tham gia cộng đồng để kết nối",
        citations=[],
        seo_checks={},
    )


# ==============================================================================
# NHÓM 1: KIỂM THỬ MIGRATION 018 UP & DOWN (CM-03)
# ==============================================================================

def test_migration_018_up_integrity():
    """Kiểm tra cấu trúc và tính toàn vẹn của file migration 018 UP."""
    repo_root = Path(__file__).resolve().parents[3]
    up_path = repo_root / "database" / "migrations" / "018_media_assets.sql"
    assert up_path.exists(), f"Không tìm thấy file {up_path}"

    content = up_path.read_text(encoding="utf-8")

    # 1. Bảng media_assets
    assert "CREATE TABLE IF NOT EXISTS media_assets" in content

    # 2. Các cột bắt buộc theo yêu cầu đề bài
    required_columns = [
        "source_type",
        "url",
        "license",
        "attribution",
        "status",
        "workspace_id",
        "content_hash",
    ]
    for col in required_columns:
        assert re.search(rf"\b{col}\b", content), f"Thiếu cột bắt buộc: {col}"

    # 3. Ràng buộc check giá trị hợp lệ
    assert "CHECK (source_type IN ('real_asset', 'ai_generated'))" in content
    assert "CHECK (status IN ('approved', 'pending', 'rejected'))" in content

    # 4. Row Level Security (RLS)
    assert "ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY" in content
    assert "media_assets_tenant_isolation" in content
    assert "app.current_workspace_id" in content

    # 5. Các chỉ mục tối ưu hóa
    assert "idx_media_assets_workspace" in content
    assert "idx_media_assets_status" in content
    assert "idx_media_assets_type" in content
    assert "idx_media_assets_hash" in content


def test_migration_018_down_integrity():
    """Kiểm tra cấu trúc và tính toàn vẹn của file rollback 018 DOWN."""
    repo_root = Path(__file__).resolve().parents[3]
    down_path = repo_root / "database" / "migrations" / "018_media_assets.down.sql"
    assert down_path.exists(), f"Không tìm thấy file {down_path}"

    content = down_path.read_text(encoding="utf-8")

    # 1. Thu hồi RLS policy
    assert "DROP POLICY IF EXISTS media_assets_tenant_isolation ON media_assets;" in content

    # 2. Xóa bảng CASCADE
    assert "DROP TABLE IF EXISTS media_assets CASCADE;" in content

    # 3. Thu hồi chỉ mục
    assert "DROP INDEX IF EXISTS idx_media_assets_workspace;" in content


# ==============================================================================
# NHÓM 2: DUAL ASSET MANAGER & BUSINESS DECISIONS (CM-05, TC-04, TC-05)
# ==============================================================================

def test_tc_04_real_product_missing_real_asset_returns_needs_assets(real_room_seo_article):
    """TC-04: Bài viết mô tả phòng/sản phẩm thật mà không có ảnh thật approved -> BẮT BUỘC needs_assets."""
    # Không cung cấp bất kỳ ảnh nào
    decision = decide_asset_status(real_room_seo_article, assets=[])

    assert decision.status == "needs_assets"
    assert decision.is_real_product is True
    assert decision.detection_method == "keyword_rule"
    assert len(decision.matched_keywords) > 0
    assert "phòng" in decision.matched_keywords or "căn hộ" in decision.matched_keywords or "studio" in decision.matched_keywords
    assert "Chính sách Dual-Asset" in decision.reason
    assert "chưa có ảnh thật nào được phê duyệt" in decision.reason


def test_tc_05_ai_image_strictly_forbidden_to_substitute_real_asset(real_room_seo_article, approved_ai_asset):
    """TC-05: Cố tình dùng ảnh AI thay thế cho bài mô tả phòng/sản phẩm thật -> BẮT BUỘC needs_assets."""
    # Có 2 ảnh AI đã approved, nhưng bài là mô tả căn hộ thật
    ai_asset_2 = dict(approved_ai_asset)
    ai_asset_2["asset_id"] = "ast_ai_002"

    decision = decide_asset_status(real_room_seo_article, assets=[approved_ai_asset, ai_asset_2])

    assert decision.status == "needs_assets"
    assert decision.is_real_product is True
    assert len(decision.approved_ai_assets) == 2
    assert len(decision.approved_real_assets) == 0
    # Phải có thông điệp rõ ràng cấm dùng ảnh AI thay thế
    assert "nghiêm cấm dùng ảnh AI thay thế cho ảnh thật sản phẩm/phòng" in decision.reason


def test_real_product_with_approved_real_asset_returns_draft(real_room_seo_article, approved_real_asset):
    """Bài mô tả phòng thật khi có ảnh thật approved thì chuyển trạng thái 'draft' thành công."""
    decision = decide_asset_status(real_room_seo_article, assets=[approved_real_asset])

    assert decision.status == "draft"
    assert decision.is_real_product is True
    assert len(decision.approved_real_assets) == 1
    assert "Đã có 1 ảnh thật được phê duyệt" in decision.reason


def test_real_product_with_pending_or_rejected_real_asset_returns_needs_assets(
    real_room_seo_article, pending_real_asset
):
    """Ảnh thật có mặt nhưng chưa được duyệt (status='pending') -> Vẫn trả về 'needs_assets'."""
    decision = decide_asset_status(real_room_seo_article, assets=[pending_real_asset])

    assert decision.status == "needs_assets"
    assert len(decision.approved_real_assets) == 0
    assert len(decision.rejected_or_pending_assets) == 1


def test_explicit_flag_requires_real_asset_true(concept_seo_article, approved_ai_asset):
    """Cờ tường minh requires_real_asset=True buộc bài viết phải có ảnh thật kể cả khi không khớp từ khóa."""
    req_dict = {
        "title": concept_seo_article.title,
        "body_markdown": concept_seo_article.body_markdown,
        "requires_real_asset": True,  # Cờ tường minh
    }
    decision = decide_asset_status(req_dict, assets=[approved_ai_asset])

    assert decision.status == "needs_assets"
    assert decision.is_real_product is True
    assert decision.detection_method == "explicit_flag"
    assert len(decision.approved_real_assets) == 0


def test_explicit_flag_requires_real_asset_false(real_room_seo_article, approved_ai_asset):
    """Cờ tường minh requires_real_asset=False cho phép dùng ảnh AI kể cả khi bài có chứa từ khóa phòng."""
    req_dict = {
        "title": real_room_seo_article.title,
        "body_markdown": real_room_seo_article.body_markdown,
        "requires_real_asset": False,  # Bỏ qua yêu cầu ảnh thật
    }
    decision = decide_asset_status(req_dict, assets=[approved_ai_asset])

    assert decision.status == "draft"
    assert decision.is_real_product is False
    assert decision.detection_method == "explicit_flag"
    assert len(decision.approved_ai_assets) == 1


def test_concept_article_allows_approved_ai_image(concept_seo_article, approved_ai_asset):
    """Bài viết chia sẻ kiến thức/khái niệm cho phép sử dụng ảnh AI minh họa đã approved."""
    decision = decide_asset_status(concept_seo_article, assets=[approved_ai_asset])

    assert decision.status == "draft"
    assert decision.is_real_product is False
    assert len(decision.approved_ai_assets) == 1


def test_concept_article_without_any_approved_assets_returns_needs_assets(concept_seo_article):
    """Bài viết khái niệm không có ảnh nào approved -> trả về needs_assets."""
    decision = decide_asset_status(concept_seo_article, assets=[])

    assert decision.status == "needs_assets"
    assert decision.is_real_product is False
    assert "Chưa có tài sản hình ảnh nào được phê duyệt" in decision.reason


def test_ai_image_missing_alt_prefix_records_policy_violation(concept_seo_article):
    """Ảnh AI thiếu tiền tố '[Ảnh minh họa AI]' trong alt_text bị ghi nhận vi phạm chính sách."""
    invalid_ai_asset = {
        "asset_id": "ast_ai_invalid",
        "source_type": "ai_generated",
        "url": "https://cdn.tripc.com/ai/sample.jpg",
        "license": "ai_generated",
        "attribution": "Imagen 3",
        "status": "approved",
        "alt_text": "Hình ảnh minh họa đẹp không có nhãn quy chuẩn",  # Thiếu tiền tố [Ảnh minh họa AI]
    }
    decision = decide_asset_status(concept_seo_article, assets=[invalid_ai_asset])

    assert len(decision.policy_violations) == 1
    assert "alt_text bắt buộc phải bắt đầu bằng '[Ảnh minh họa AI]'" in decision.policy_violations[0]


# ==============================================================================
# NHÓM 3: TENANT GUARD & ZERO INFORMATION LEAKAGE (CM-06, TC-08)
# ==============================================================================

def test_tc_08_tenant_guard_asset_cross_workspace_raises_403_without_leakage(
    current_workspace_id, foreign_workspace_id, approved_real_asset
):
    """TC-08: Truy cập asset của workspace khác trả về HTTP 403 Forbidden và KHÔNG làm lộ bất kỳ dữ liệu ngoại lai nào."""
    # Asset thuộc foreign_workspace_id
    foreign_asset = dict(approved_real_asset)
    foreign_asset["workspace_id"] = foreign_workspace_id

    # Yêu cầu từ current_workspace_id
    with pytest.raises(TenantAccessForbiddenError) as exc_info:
        TenantGuard.guard_asset(foreign_asset, current_workspace_id=current_workspace_id)

    err = exc_info.value
    # 1. Trả về mã HTTP 403
    assert err.status_code == 403
    assert err.code == "FORBIDDEN_TENANT_ACCESS"

    # 2. Tuyệt đối không làm lộ foreign_workspace_id hay sự tồn tại trong message/details
    assert foreign_workspace_id not in str(err)
    assert foreign_workspace_id not in err.message
    assert err.details is None


def test_tc_08_tenant_guard_article_cross_workspace_raises_403_without_leakage(
    current_workspace_id, foreign_workspace_id, real_room_seo_article
):
    """TC-08: Truy cập article của workspace khác trả về HTTP 403 Forbidden và không lộ thông tin."""
    foreign_article = real_room_seo_article.model_copy(update={"workspace_id": UUID(foreign_workspace_id)})

    with pytest.raises(TenantAccessForbiddenError) as exc_info:
        TenantGuard.guard_article(foreign_article, current_workspace_id=current_workspace_id)

    err = exc_info.value
    assert err.status_code == 403
    assert foreign_workspace_id not in str(err)
    assert foreign_workspace_id not in err.message
    assert err.details is None


def test_tenant_guard_same_workspace_passes(current_workspace_id, approved_real_asset, real_room_seo_article):
    """Truy cập đúng workspace diễn ra bình thường, trả về nguyên vẹn đối tượng."""
    guarded_asset = TenantGuard.guard_asset(approved_real_asset, current_workspace_id=current_workspace_id)
    assert guarded_asset == approved_real_asset

    guarded_article = TenantGuard.guard_article(real_room_seo_article, current_workspace_id=current_workspace_id)
    assert guarded_article == real_room_seo_article


def test_tenant_guard_asset_list_rejects_on_any_foreign_asset(
    current_workspace_id, foreign_workspace_id, approved_real_asset
):
    """Nếu danh sách chứa dù chỉ 1 asset của tenant khác, toàn bộ thao tác bị chặn với 403."""
    asset1 = dict(approved_real_asset)
    asset2_foreign = dict(approved_real_asset)
    asset2_foreign["workspace_id"] = foreign_workspace_id

    with pytest.raises(TenantAccessForbiddenError):
        TenantGuard.guard_asset_list([asset1, asset2_foreign], current_workspace_id=current_workspace_id)


def test_tenant_guard_filter_assets_zero_leakage(
    current_workspace_id, foreign_workspace_id, approved_real_asset
):
    """Hàm filter_assets lọc sạch các asset ngoại lai, bảo đảm 0 rò rỉ dữ liệu."""
    valid_asset = dict(approved_real_asset)
    valid_asset["asset_id"] = "ast_valid"

    foreign_asset = dict(approved_real_asset)
    foreign_asset["asset_id"] = "ast_foreign"
    foreign_asset["workspace_id"] = foreign_workspace_id

    filtered = TenantGuard.filter_assets([valid_asset, foreign_asset], current_workspace_id=current_workspace_id)

    assert len(filtered) == 1
    assert filtered[0]["asset_id"] == "ast_valid"
    assert all(extract_resource_workspace_id(a) == normalize_workspace_id(current_workspace_id) for a in filtered)
