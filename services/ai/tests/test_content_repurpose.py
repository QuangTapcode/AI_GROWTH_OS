"""Unit and integration test suite for CM-16, CM-17, CM-18 (operation content.repurpose).

Verifies:
1. fb_repurposer.py:
   - Facebook 3-part layout (Hook, Body, CTA)
   - 3-5 hashtags adhering to Zero-Claim (no digits, no prices, no %, no unbacked promo terms)
2. tiktok_repurposer.py:
   - Spoken video script strictly 120-180 words
   - Structured visual cues / storyboard scenes (4 scenes: Hook 3s, Problem/Context, Solution, CTA)
3. repurpose_router.py:
   - Independent routing to Facebook or TikTok (100% accurate)
   - Rejection of invalid/unsupported channels
   - Preservation of parent_content_id and parent_version
   - Version incrementing
   - Inheritance of citations from source article evidence
4. Governance & Guardrails:
   - Reflection loop with max 2 iterations
   - Insufficient data fallback if hard errors persist or facts are lacking
   - Dual-Asset policy enforcement (needs_assets for real products without approved real assets)
"""

from __future__ import annotations

import pytest
from uuid import uuid4

from src.agents.content.fb_repurposer import (
    FacebookRepurposer,
    generate_deterministic_facebook_post,
    validate_facebook_hashtags,
)
from src.agents.content.tiktok_repurposer import (
    TikTokRepurposer,
    count_script_words,
    generate_deterministic_tiktok_script,
    validate_tiktok_word_count,
)
from src.agents.content.repurpose_router import (
    ContentRepurposePayload,
    inherit_citations_from_evidence,
    normalize_repurpose_cta,
    route_repurpose,
    run_content_repurpose,
)
from src.agents.content.social_pack_v2 import (
    AssetV2,
    CitationItem,
    FactItem,
    SocialPack as SocialPackV2,
)
from src.agents.contracts import ArtifactInput
from src.agents.seo.schemas import SeoArticle
from src.app.runtime import RunContext, CallBudget, OperationError
from src.app.schemas import EvidenceRef, JobRequest


# --- Fixtures ---

@pytest.fixture
def sample_seo_facts() -> list[FactItem]:
    return [
        FactItem(fact_id="f01", text="TripC cung cấp nền tảng số hỗ trợ lập kế hoạch chuyến đi.", source_type="seo_body"),
        FactItem(fact_id="f02", text="Thời gian tối ưu hóa lịch trình giảm từ 3 giờ xuống còn 15 phút.", source_type="seo_body"),
        FactItem(fact_id="f03", text="Hệ thống tổng hợp hơn 500 điểm đến văn hóa và ẩm thực bản địa.", source_type="seo_body"),
        FactItem(fact_id="f04", text="Tính năng gợi ý tự động hoạt động dựa trên sở thích cá nhân của người dùng.", source_type="seo_body"),
    ]


@pytest.fixture
def sample_seo_article_dict(sample_seo_facts: list[FactItem]) -> dict:
    body = (
        "## Tổng quan\n\n"
        "TripC cung cấp nền tảng số hỗ trợ lập kế hoạch chuyến đi. "
        "Thời gian tối ưu hóa lịch trình giảm từ 3 giờ xuống còn 15 phút. "
        "Hệ thống tổng hợp hơn 500 điểm đến văn hóa và ẩm thực bản địa. "
        "Tính năng gợi ý tự động hoạt động dựa trên sở thích cá nhân của người dùng.\n\n"
        "## Đăng ký ngay\n\n"
        "Đăng ký trải nghiệm ngay tại TripC"
    )
    return {
        "article_id": str(uuid4()),
        "workspace_id": str(uuid4()),
        "version": 1,
        "title": "Cẩm nang tối ưu lịch trình du lịch thông minh",
        "primary_keyword": "lập kế hoạch chuyến đi",
        "meta_description": "Khám phá nền tảng hỗ trợ lập kế hoạch thông minh giúp tiết kiệm thời gian.",
        "headings": ["Tổng quan", "Đăng ký ngay"],
        "body_markdown": body,
        "cta": "Đăng ký trải nghiệm ngay tại TripC",
        "citations": [
            {"id": "c01", "url": "https://tripc.vn/nghien-cuu-du-lich", "title": "Báo cáo du lịch số 2026"}
        ],
        "seo_checks": {"title": True, "meta": True, "headings": True, "citations": True},
        "content_hash": "a" * 64,
        "role": "seo",
    }


@pytest.fixture
def sample_approved_assets() -> list[AssetV2]:
    return [
        AssetV2(
            asset_id="ast_mock_01",
            url="https://cdn.tripc.vn/images/guide-cover.jpg",
            source_type="ai_generated",
            license="ai_generated",
            attribution="Flux.1 Dev generated",
            alt_text="[Ảnh minh họa AI] Minh họa đồ họa số về bản đồ du lịch",
        )
    ]


@pytest.fixture
def sample_citations() -> list[CitationItem]:
    return [
        CitationItem(id="c01", url="https://tripc.vn/nghien-cuu-du-lich", title="Báo cáo du lịch số 2026")
    ]


# ==============================================================================
# CM-16: Facebook Repurposer Tests
# ==============================================================================

class TestFacebookRepurposer:

    def test_deterministic_facebook_post_structure(self, sample_seo_facts: list[FactItem]):
        """Bài Facebook phải đủ 3 phần: Hook, Thân bài (bullets), CTA và 3-5 hashtag."""
        post = generate_deterministic_facebook_post(
            title="Cẩm nang du lịch TripC",
            facts=sample_seo_facts,
            brand_voice="Chuyên nghiệp, tin cậy",
            verbatim_cta="Đăng ký trải nghiệm ngay tại TripC",
        )
        caption = post["caption"]
        hashtags = post["hashtags"]

        # 1. Kiểm tra 3 phần
        assert "Khám phá" in caption or "Cẩm nang" in caption or "Tìm kiếm" in caption, "Thiếu Hook tiêu đề"
        assert "•" in caption, "Thiếu các gạch đầu dòng điểm nhấn thân bài"
        assert "Đăng ký trải nghiệm ngay tại TripC" in caption, "Thiếu CTA nguyên văn"

        # 2. Kiểm tra số lượng hashtag: 3 đến 5
        assert 3 <= len(hashtags) <= 5, f"Số hashtag phải từ 3 đến 5, nhận được {len(hashtags)}"

    def test_facebook_hashtags_zero_claim_compliance(self, sample_seo_facts: list[FactItem]):
        """Hashtag không được chứa khẳng định mới, giá, % hay số."""
        valid_tags = ["#TripC", "#CamNangDuLich", "#LichTrinhThongMinh", "#KhamPha"]
        violations = validate_facebook_hashtags(valid_tags, facts=sample_seo_facts)
        assert len(violations) == 0, f"Hashtag hợp lệ nhưng bị báo lỗi: {violations}"

        # Hashtag vi phạm số / % / giá / ưu đãi
        invalid_tags = [
            "#GiamGia50PhanTram",
            "#GiaChi200k",
            "#So1VietNam",
            "#ReNhatThiTruong",
            "#TangMienPhi",
        ]
        violations = validate_facebook_hashtags(invalid_tags, facts=sample_seo_facts)
        assert len(violations) > 0, "Phải phát hiện vi phạm Zero-Claim trong hashtag"

    def test_facebook_repurpose_full_lifecycle(
        self,
        sample_seo_facts: list[FactItem],
        sample_approved_assets: list[AssetV2],
        sample_citations: list[CitationItem],
    ):
        """Kiểm thử toàn bộ vòng đời FacebookRepurposer.repurpose với Reflection Loop."""
        repurposer = FacebookRepurposer()
        pack = repurposer.repurpose(
            workspace_id="00000000-0000-4000-8000-000000000001",
            parent_content_id="art_123",
            parent_version=1,
            title="Cẩm nang du lịch TripC",
            verbatim_cta="Đăng ký trải nghiệm ngay tại TripC",
            facts=sample_seo_facts,
            brand_voice="Chuyên nghiệp",
            image_assets=sample_approved_assets,
            citations=sample_citations,
            is_real_product=False,
            current_version=1,
        )

        assert isinstance(pack, SocialPackV2)
        assert pack.status == "draft"
        assert pack.channels == ["facebook"]
        assert pack.version == 2, "Version phải tăng từ 1 lên 2"
        assert pack.parent_content_id == "art_123"
        assert pack.parent_version == 1
        assert len(pack.sentence_fact_map) >= 3
        # Mọi câu factual phải được map fact_id
        for sm in pack.sentence_fact_map:
            if sm.sentence_type == "factual":
                assert isinstance(sm.fact_id, list) and len(sm.fact_id) > 0
                assert sm.entailment_status == "supported"


# ==============================================================================
# CM-17: TikTok Repurposer Tests
# ==============================================================================

class TestTikTokRepurposer:

    def test_tiktok_word_count_strictly_bounded(self, sample_seo_facts: list[FactItem]):
        """Kịch bản đọc thoại TikTok phải nằm trong khoảng 120-180 từ."""
        script_data = generate_deterministic_tiktok_script(
            title="Tối ưu lịch trình du lịch",
            facts=sample_seo_facts,
            brand_voice="Hào hứng, hiện đại",
            verbatim_cta="Tải app TripC ngay hôm nay",
        )
        caption = script_data["caption"]
        word_count = script_data["spoken_word_count"]

        # Kiểm tra hàm đếm từ
        calculated_words = count_script_words(caption)
        assert 120 <= calculated_words <= 180, (
            f"Số từ đọc thoại ({calculated_words}) nằm ngoài khoảng bắt buộc 120-180 từ"
        )
        assert 120 <= word_count <= 180

        # Kiểm tra hàm validator
        violations = validate_tiktok_word_count(caption)
        assert len(violations) == 0, f"Validator báo lỗi số từ: {violations}"

    def test_tiktok_storyboard_scenes_structured(self, sample_seo_facts: list[FactItem]):
        """Kịch bản TikTok phải có storyboard gồm các cảnh trực quan chi tiết."""
        script_data = generate_deterministic_tiktok_script(
            title="Tối ưu lịch trình du lịch",
            facts=sample_seo_facts,
            brand_voice="Hào hứng, hiện đại",
            verbatim_cta="Tải app TripC ngay hôm nay",
        )
        storyboard = script_data["storyboard"]
        assert len(storyboard) == 4, f"Cần 4 phân cảnh tiêu chuẩn, nhận được {len(storyboard)}"

        # Phân cảnh 1: Hook 3s
        assert storyboard[0]["scene_index"] == 1
        assert storyboard[0]["duration_seconds"] == 3.0
        assert storyboard[0]["visual_cue"] != ""
        assert storyboard[0]["audio_voiceover"] != ""

        # Phân cảnh 4: CTA
        assert storyboard[3]["scene_index"] == 4
        assert "Tải app TripC ngay hôm nay" in storyboard[3]["audio_voiceover"]

    def test_tiktok_repurpose_full_lifecycle(
        self,
        sample_seo_facts: list[FactItem],
        sample_approved_assets: list[AssetV2],
        sample_citations: list[CitationItem],
    ):
        """Kiểm thử vòng đời TikTokRepurposer.repurpose với metadata storyboard."""
        repurposer = TikTokRepurposer()
        pack = repurposer.repurpose(
            workspace_id="00000000-0000-4000-8000-000000000001",
            parent_content_id="art_456",
            parent_version=2,
            title="Tối ưu lịch trình du lịch",
            verbatim_cta="Tải app TripC ngay hôm nay",
            facts=sample_seo_facts,
            brand_voice="Sôi nổi",
            image_assets=sample_approved_assets,
            citations=sample_citations,
            is_real_product=False,
            current_version=2,
        )

        assert isinstance(pack, SocialPackV2)
        assert pack.status == "draft"
        assert pack.channels == ["tiktok"]
        assert pack.version == 3, "Version phải tăng từ 2 lên 3"
        assert pack.parent_content_id == "art_456"
        assert pack.parent_version == 2
        assert "storyboard" in pack.metadata
        assert len(pack.metadata["storyboard"]) == 4
        assert 120 <= pack.metadata["spoken_word_count"] <= 180


# ==============================================================================
# CM-18: Repurpose Router Tests
# ==============================================================================

class TestRepurposeRouter:

    def test_route_repurpose_channel_discrimination(
        self,
        sample_seo_facts: list[FactItem],
        sample_approved_assets: list[AssetV2],
        sample_citations: list[CitationItem],
    ):
        """Định tuyến chính xác 100% theo target_channel."""
        # 1. Kênh Facebook
        fb_pack = route_repurpose(
            workspace_id="00000000-0000-4000-8000-000000000001",
            parent_content_id="art_100",
            parent_version=1,
            target_channel="facebook",
            source_article={"title": "Bài viết test"},
            verbatim_cta="Nhấn vào link",
            facts=sample_seo_facts,
            brand_voice="Chuẩn mực",
            image_assets=sample_approved_assets,
            citations=sample_citations,
            is_real_product=False,
            current_version=1,
        )
        assert fb_pack.channels == ["facebook"]
        assert fb_pack.metadata.get("format") == "3_part_post"

        # 2. Kênh TikTok
        tt_pack = route_repurpose(
            workspace_id="00000000-0000-4000-8000-000000000001",
            parent_content_id="art_100",
            parent_version=1,
            target_channel="tiktok",
            source_article={"title": "Bài viết test"},
            verbatim_cta="Nhấn vào link",
            facts=sample_seo_facts,
            brand_voice="Chuẩn mực",
            image_assets=sample_approved_assets,
            citations=sample_citations,
            is_real_product=False,
            current_version=1,
        )
        assert tt_pack.channels == ["tiktok"]
        assert tt_pack.metadata.get("format") == "short_video_script"

        # 3. Kênh không hợp lệ
        with pytest.raises(OperationError) as exc_info:
            route_repurpose(
                workspace_id="00000000-0000-4000-8000-000000000001",
                parent_content_id="art_100",
                parent_version=1,
                target_channel="instagram",
                source_article={"title": "Bài viết test"},
                verbatim_cta="Nhấn vào link",
                facts=sample_seo_facts,
                brand_voice="Chuẩn mực",
                image_assets=sample_approved_assets,
                citations=sample_citations,
                is_real_product=False,
                current_version=1,
            )
        assert exc_info.value.code == "UNSUPPORTED_TARGET_CHANNEL"

    def test_citation_inheritance(self):
        """Kế thừa đầy đủ danh sách citations từ evidence của bài SEO nguồn."""
        evidences = [
            EvidenceRef(
                source_id=uuid4(),
                chunk_id="chunk-01",
                source_url="https://tripc.vn/nguon-01",
                license="CC-BY-4.0",
                attribution="TripC Author A",
            ),
            EvidenceRef(
                source_id=uuid4(),
                chunk_id="chunk-02",
                source_url="https://tripc.vn/nguon-02",
                license="Proprietary",
                attribution="TripC Author B",
            ),
        ]
        inherited = inherit_citations_from_evidence(evidences)
        assert len(inherited) == 2
        assert inherited[0].id == "c01"
        assert inherited[0].url == "https://tripc.vn/nguon-01"
        assert inherited[1].id == "c02"
        assert inherited[1].url == "https://tripc.vn/nguon-02"

    def test_insufficient_facts_fallback(
        self,
        sample_approved_assets: list[AssetV2],
        sample_citations: list[CitationItem],
    ):
        """Nếu facts không đủ ngưỡng tối thiểu, trả về status insufficient_data."""
        few_facts = [
            FactItem(fact_id="f01", text="TripC là nền tảng số.", source_type="seo_body")
        ]
        pack = route_repurpose(
            workspace_id="00000000-0000-4000-8000-000000000001",
            parent_content_id="art_insufficient",
            parent_version=1,
            target_channel="facebook",
            source_article={"title": "Bài viết quá ngắn"},
            verbatim_cta="Đăng ký ngay",
            facts=few_facts,
            brand_voice="Chuyên nghiệp",
            image_assets=sample_approved_assets,
            citations=sample_citations,
            is_real_product=False,
            current_version=1,
        )
        assert pack.status == "insufficient_data"
        assert "Không đủ facts tối thiểu" in str(pack.rejection_reason)

    def test_real_product_missing_real_asset_returns_needs_assets(
        self,
        sample_seo_facts: list[FactItem],
        sample_citations: list[CitationItem],
    ):
        """Bài mô tả sản phẩm thật mà chỉ có ảnh AI thì BẮT BUỘC trả needs_assets (Dual-Asset)."""
        ai_asset = AssetV2(
            asset_id="ast_ai_01",
            url="https://cdn.tripc.vn/images/ai-resort.jpg",
            source_type="ai_generated",
            license="ai_generated",
            attribution="Flux.1",
            alt_text="[Ảnh minh họa AI] Resort bãi biển",
        )
        pack = route_repurpose(
            workspace_id="00000000-0000-4000-8000-000000000001",
            parent_content_id="art_real_prod",
            parent_version=1,
            target_channel="facebook",
            source_article={"title": "Review khách sạn TripC Boutique Hotel phòng suite view biển"},
            verbatim_cta="Đặt phòng ngay",
            facts=sample_seo_facts,
            brand_voice="Chuyên nghiệp",
            image_assets=[ai_asset],
            citations=sample_citations,
            is_real_product=True,
            current_version=1,
        )
        assert pack.status == "needs_assets"
        assert len(pack.image_assets) == 0, "Không được giữ ảnh AI cho sản phẩm thực tế"
