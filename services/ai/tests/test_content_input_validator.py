"""Tests for SeoConsumer and InputValidator (CM-02 & CM-04).

Covers:
- TC-06: Version mismatch (parent_version != article.version)
- TC-07: Hash mismatch (tampered content)
- TC-08: Foreign workspace / Tenant scope violation
- TC-09: Unselected / unsupported channels
- 100% valid SEO article parsing and consumption
- Empty body markdown handling
- Missing article in store
"""

from uuid import uuid4
import pytest

from src.agents.content.input_validator import (
    InputValidationError,
    compute_seo_artifact_hash,
    validate_content_marketing_input,
)
from src.agents.content.seo_consumer import (
    SeoConsumerError,
    parse_seo_article,
    read_seo_article_from_artifact_input,
    read_seo_article_from_store,
)
from src.agents.contracts import ArtifactInput
from src.agents.seo.schemas import SeoArticle
from src.app.schemas import EvidenceRef, RunArtifact


@pytest.fixture
def sample_workspace_id() -> str:
    return str(uuid4())



@pytest.fixture
def sample_article_id() -> str:
    return str(uuid4())


@pytest.fixture
def valid_seo_article_dict(sample_workspace_id, sample_article_id) -> dict:
    return {
        "article_id": sample_article_id,
        "workspace_id": sample_workspace_id,
        "context_snapshot_id": str(uuid4()),
        "profile_version": 1,
        "version": 2,
        "status": "draft",
        "missing_facts": [],
        "input_artifact_refs": [],
        "requires_human_approval": True,
        "applied": False,
        "synthetic": True,
        "title": "Căn hộ Studio TripC Da Nang gần biển Mỹ Khê",
        "meta_description": "Khám phá căn hộ Studio tiện nghi cho Digital Nomad tại Đà Nẵng.",
        "primary_keyword": "căn hộ studio đà nẵng",
        "headings": ["Vị trí đắc địa", "Tiện ích trọn gói"],
        "body_markdown": "## Vị trí đắc địa\n\nCách biển Mỹ Khê 200m.\n\n## Tiện ích trọn gói\n\nGiá 8.5tr đã gồm phí.",
        "cta": "Liên hệ ngay để xem phòng",
        "citations": [
            {
                "source_id": str(uuid4()),
                "source_version": 1,
                "chunk_id": "chk_01",
                "locator": "p1",
                "quote": "Cách biển Mỹ Khê 200m"
            }
        ],
        "seo_checks": {"title": True, "meta": True, "headings": True, "internal_link": True, "citations": True}
    }


# ==============================================================================
# NHÓM 1: SEO CONSUMER TESTS (CM-02)
# ==============================================================================

def test_consumer_parse_valid_seo_article(valid_seo_article_dict):
    """100% bài viết hợp lệ theo đúng schema repo được parse thành công."""
    article = parse_seo_article(valid_seo_article_dict)
    assert isinstance(article, SeoArticle)
    assert str(article.article_id) == valid_seo_article_dict["article_id"]
    assert str(article.workspace_id) == valid_seo_article_dict["workspace_id"]
    assert article.version == 2
    assert len(article.citations) == 1


def test_consumer_read_from_artifact_input(valid_seo_article_dict, sample_workspace_id):
    """Đọc SeoArticle trực tiếp từ cấu trúc ArtifactInput của pipeline."""
    ref = RunArtifact(
        artifact_id=uuid4(),
        workspace_id=sample_workspace_id,
        version=2,
        content_hash="a" * 64,
        context_snapshot_id=uuid4(),
        role="seo"
    )
    artifact_input = ArtifactInput(
        artifact=ref,
        result=valid_seo_article_dict,
        evidence=[]
    )
    article = read_seo_article_from_artifact_input(artifact_input, expected_workspace_id=sample_workspace_id)
    assert article.version == 2
    assert str(article.workspace_id) == sample_workspace_id


def test_consumer_read_from_store_success(valid_seo_article_dict, sample_workspace_id, sample_article_id):
    """Đọc bài viết SEO từ kho lưu trữ theo article_id và workspace_id."""
    store = {sample_article_id: valid_seo_article_dict}
    article = read_seo_article_from_store(sample_article_id, sample_workspace_id, store)
    assert str(article.article_id) == sample_article_id
    assert str(article.workspace_id) == sample_workspace_id


def test_consumer_read_from_store_not_found(sample_workspace_id):
    """Báo lỗi ARTICLE_NOT_FOUND khi ID không tồn tại trong store."""
    store = {}
    with pytest.raises(SeoConsumerError) as exc:
        read_seo_article_from_store(str(uuid4()), sample_workspace_id, store)
    assert exc.value.code == "ARTICLE_NOT_FOUND"


# ==============================================================================
# NHÓM 2: TEST CASES NGHIỆP VỤ BẮT BUỘC (TC-06, TC-07, TC-08, TC-09 - CM-04)
# ==============================================================================

def test_tc_06_version_mismatch_rejected(valid_seo_article_dict, sample_workspace_id):
    """TC-06: parent_version truyền vào lệch với phiên bản hiện tại của bài viết SEO."""
    # Bài viết đang ở version 2, nhưng request truyền parent_version = 1
    res = validate_content_marketing_input(
        workspace_id=sample_workspace_id,
        article_input=valid_seo_article_dict,
        parent_version=1  # Lệch version
    )
    assert res.is_valid is False
    assert any(e.code == "ARTIFACT_VERSION_MISMATCH" for e in res.errors)

    with pytest.raises(InputValidationError) as exc:
        res.raise_if_invalid()
    assert exc.value.code == "ARTIFACT_VERSION_MISMATCH"


def test_tc_07_hash_mismatch_rejected(valid_seo_article_dict, sample_workspace_id):
    """TC-07: Nội dung bài viết SEO bị thay đổi ngầm sau khi duyệt (lệch content_hash)."""
    # Tính hash ban đầu
    original_hash = compute_seo_artifact_hash(valid_seo_article_dict)

    # Giả lập sửa đổi ngầm nội dung bài SEO
    tampered_article = dict(valid_seo_article_dict)
    tampered_article["body_markdown"] = "Nội dung đã bị chèn trái phép giảm giá 90%!"

    res = validate_content_marketing_input(
        workspace_id=sample_workspace_id,
        article_input=tampered_article,
        parent_version=2,
        expected_content_hash=original_hash  # Mong đợi hash cũ
    )
    assert res.is_valid is False
    assert any(e.code == "ARTIFACT_HASH_MISMATCH" for e in res.errors)

    with pytest.raises(InputValidationError) as exc:
        res.raise_if_invalid()
    assert exc.value.code == "ARTIFACT_HASH_MISMATCH"


def test_tc_08_foreign_workspace_tenant_isolation_rejected(valid_seo_article_dict):
    """TC-08: Chặn truy cập bài viết thuộc tenant khác (Tenant Scope Violation)."""
    other_workspace_id = str(uuid4())
    res = validate_content_marketing_input(
        workspace_id=other_workspace_id,  # Tenant yêu cầu là other_workspace_id
        article_input=valid_seo_article_dict,  # Nhưng bài thuộc sample_workspace_id
        parent_version=2
    )
    assert res.is_valid is False
    assert any(e.code == "TENANT_SCOPE_VIOLATION" for e in res.errors)

    with pytest.raises(InputValidationError) as exc:
        res.raise_if_invalid()
    assert exc.value.code == "TENANT_SCOPE_VIOLATION"


def test_tc_09_unselected_target_channel_rejected(valid_seo_article_dict, sample_workspace_id):
    """TC-09: Đầu vào chỉ chọn 'facebook' nhưng yêu cầu đăng 'tiktok' hoặc kênh cấm."""
    # Kịch bản 1: Kênh nằm ngoài danh sách được chọn (chỉ cho facebook, nhưng yêu cầu cả tiktok)
    res1 = validate_content_marketing_input(
        workspace_id=sample_workspace_id,
        article_input=valid_seo_article_dict,
        parent_version=2,
        target_channels=["facebook", "tiktok"],
        allowed_channels=["facebook"]  # Chỉ cấp quyền/chọn facebook
    )
    assert res1.is_valid is False
    assert any(e.code == "INVALID_TARGET_CHANNEL" for e in res1.errors)

    # Kịch bản 2: Kênh hoàn toàn không được hỗ trợ (như instagram)
    res2 = validate_content_marketing_input(
        workspace_id=sample_workspace_id,
        article_input=valid_seo_article_dict,
        parent_version=2,
        target_channels=["instagram"]
    )
    assert res2.is_valid is False
    assert any(e.code == "UNSUPPORTED_CHANNEL" for e in res2.errors)


# ==============================================================================
# NHÓM 3: CÁC CA BIÊN BỔ SUNG (EDGE CASES)
# ==============================================================================

def test_empty_body_markdown_rejected(valid_seo_article_dict, sample_workspace_id):
    """Chặn khi body_markdown của bài SEO bị rỗng hoặc chỉ có khoảng trắng."""
    empty_body_article = dict(valid_seo_article_dict)
    empty_body_article["body_markdown"] = "   "

    res = validate_content_marketing_input(
        workspace_id=sample_workspace_id,
        article_input=empty_body_article,
        parent_version=2
    )
    assert res.is_valid is False
    assert any(e.code == "EMPTY_BODY_MARKDOWN" for e in res.errors)


def test_empty_channels_list_rejected(valid_seo_article_dict, sample_workspace_id):
    """Chặn khi target_channels là danh sách rỗng."""
    res = validate_content_marketing_input(
        workspace_id=sample_workspace_id,
        article_input=valid_seo_article_dict,
        parent_version=2,
        target_channels=[]
    )
    assert res.is_valid is False
    assert any(e.code == "EMPTY_CHANNELS" for e in res.errors)


def test_all_checks_pass_for_valid_input(valid_seo_article_dict, sample_workspace_id):
    """Tất cả tiêu chí kiểm tra pass 100% khi bài viết hợp lệ toàn diện."""
    stored_hash = compute_seo_artifact_hash(valid_seo_article_dict)

    res = validate_content_marketing_input(
        workspace_id=sample_workspace_id,
        article_input=valid_seo_article_dict,
        parent_version=2,
        expected_content_hash=stored_hash,
        target_channels=["facebook"],
        allowed_channels=["facebook", "tiktok"]
    )
    assert res.is_valid is True
    assert len(res.errors) == 0
    assert res.article is not None
    assert str(res.article.article_id) == valid_seo_article_dict["article_id"]


def test_consumer_invalid_schema_rejected():
    """Báo lỗi INVALID_SEO_ARTICLE_SCHEMA khi dữ liệu bài SEO thiếu các trường bắt buộc."""
    broken_payload = {"title": "Chỉ có mỗi tiêu đề"}
    with pytest.raises(SeoConsumerError) as exc:
        parse_seo_article(broken_payload)
    assert exc.value.code == "INVALID_SEO_ARTICLE_SCHEMA"


def test_consumer_tenant_mismatch_in_artifact_input(valid_seo_article_dict, sample_workspace_id):
    """Báo lỗi TENANT_SCOPE_VIOLATION khi workspace trong ArtifactInput khác expected_workspace_id."""
    ref = RunArtifact(
        artifact_id=uuid4(),
        workspace_id=sample_workspace_id,
        version=2,
        content_hash="a" * 64,
        context_snapshot_id=uuid4(),
        role="seo"
    )
    artifact_input = ArtifactInput(
        artifact=ref,
        result=valid_seo_article_dict,
        evidence=[]
    )
    other_ws = str(uuid4())
    with pytest.raises(SeoConsumerError) as exc:
        read_seo_article_from_artifact_input(artifact_input, expected_workspace_id=other_ws)
    assert exc.value.code == "TENANT_SCOPE_VIOLATION"


def test_consumer_article_id_mismatch_in_artifact_input(valid_seo_article_dict, sample_workspace_id):
    """Báo lỗi ARTICLE_ID_MISMATCH khi article_id khác expected_article_id."""
    ref = RunArtifact(
        artifact_id=uuid4(),
        workspace_id=sample_workspace_id,
        version=2,
        content_hash="a" * 64,
        context_snapshot_id=uuid4(),
        role="seo"
    )
    artifact_input = ArtifactInput(
        artifact=ref,
        result=valid_seo_article_dict,
        evidence=[]
    )
    different_article_id = str(uuid4())
    with pytest.raises(SeoConsumerError) as exc:
        read_seo_article_from_artifact_input(
            artifact_input,
            expected_workspace_id=sample_workspace_id,
            expected_article_id=different_article_id
        )
    assert exc.value.code == "ARTICLE_ID_MISMATCH"


def test_consumer_read_from_store_tenant_mismatch(valid_seo_article_dict, sample_article_id):
    """Báo lỗi TENANT_SCOPE_VIOLATION khi bài trong store thuộc tenant khác."""
    store = {sample_article_id: valid_seo_article_dict}
    other_ws = str(uuid4())
    with pytest.raises(SeoConsumerError) as exc:
        read_seo_article_from_store(sample_article_id, other_ws, store)
    assert exc.value.code == "TENANT_SCOPE_VIOLATION"


def test_validate_input_with_pydantic_instance(valid_seo_article_dict, sample_workspace_id):
    """Kiểm tra khi truyền trực tiếp instance Pydantic SeoArticle (thay vì dict)."""
    article_model = parse_seo_article(valid_seo_article_dict)
    stored_hash = compute_seo_artifact_hash(article_model)

    res = validate_content_marketing_input(
        workspace_id=sample_workspace_id,
        article_input=article_model,
        parent_version=2,
        expected_content_hash=stored_hash,
        target_channels=["facebook", "tiktok"]
    )
    assert res.is_valid is True
    assert res.article == article_model

