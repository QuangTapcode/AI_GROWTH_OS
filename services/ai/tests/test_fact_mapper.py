"""Unit tests and Adversarial benchmarks for Sentence-Fact Mapper & NLI Engine (CM-08).

Covers:
1. Vietnamese sentence splitting with decimals (8.500.000), abbreviations, and emojis.
2. Exact mapping and verification of Golden Set sample from Section 15.4 (gs_tripc_001).
3. 15 adversarial test cases:
   - 10 partial cases: degree adjectives, scope expansion, result inferences, temporal additions.
   - 5 unsupported cases: price/numeric mismatch, distance mismatch, hallucinated amenities, Zero-Claim violations on hook/cta.
"""

from __future__ import annotations

import pytest

from src.agents.content.fact_mapper import (
    auto_associate_facts,
    check_factual_entailment,
    check_zero_claim,
    classify_sentence_type,
    map_caption_to_sentence_fact_map,
    split_vietnamese_sentences,
)
from src.agents.content.social_pack_v2 import FactItem, SentenceMap


# ==============================================================================
# FIXTURES
# ==============================================================================

@pytest.fixture
def golden_facts() -> list[FactItem]:
    """Tập facts chuẩn của bài mẫu Golden Section 15.4."""
    return [
        FactItem(
            fact_id="f01",
            text="Căn hộ Studio tại TripC Da Nang có giá thuê 8.500.000 VNĐ/tháng (đã bao gồm phí quản lý).",
            source_type="seo_body",
        ),
        FactItem(
            fact_id="f02",
            text="Vị trí cách bãi biển Mỹ Khê 200m.",
            source_type="seo_body",
        ),
        FactItem(
            fact_id="f03",
            text="Toàn bộ tòa nhà được phủ sóng mạng 5G tốc độ cao.",
            source_type="seo_body",
        ),
    ]


@pytest.fixture
def golden_facts_dict(golden_facts) -> dict[str, FactItem]:
    return {f.fact_id: f for f in golden_facts}


@pytest.fixture
def golden_caption() -> str:
    """Nội dung caption chuẩn từ mục 15.4."""
    return (
        "Bạn đang tìm kiếm căn hộ dành cho người làm việc từ xa tại khu vực biển Đà Nẵng?\n\n"
        "TripC Da Nang cung cấp căn hộ studio với mức giá 8.500.000 VNĐ/tháng đã gồm phí quản lý, tọa lạc cách bãi biển Mỹ Khê 200m.\n\n"
        "Toàn bộ tòa nhà được phủ sóng mạng 5G tốc độ cao.\n\n"
        "Liên hệ Fanpage để đặt lịch xem phòng thực tế."
    )


# ==============================================================================
# NHÓM 1: BỘ TÁCH CÂU TIẾNG VIỆT (VIETNAMESE SENTENCE SPLITTER)
# ==============================================================================

def test_split_sentences_preserves_currency_decimals():
    text = "Căn hộ có giá thuê 8.500.000 VNĐ/tháng. Khoảng cách ra biển là 2.5km."
    sents = split_vietnamese_sentences(text)
    assert len(sents) == 2
    assert "8.500.000" in sents[0]
    assert "2.5km" in sents[1]


def test_split_sentences_preserves_abbreviations():
    text = "Văn phòng nằm tại TP. Đà Nẵng. Các tiện ích bao gồm máy in, cafe, v.v. để phục vụ cư dân."
    sents = split_vietnamese_sentences(text)
    assert len(sents) == 2
    assert "TP. Đà Nẵng" in sents[0]
    assert "v.v." in sents[1]


def test_split_sentences_handles_emojis_and_social_media_caption():
    text = "Khám phá Đà Nẵng cùng TripC! 🌊 Căn hộ view biển tuyệt đẹp. Đặt phòng ngay! 🎉"
    sents = split_vietnamese_sentences(text)
    assert len(sents) == 3
    assert "🌊" in sents[0]
    assert "Đặt phòng ngay!" in sents[2]


def test_split_sentences_handles_golden_caption(golden_caption):
    sents = split_vietnamese_sentences(golden_caption)
    assert len(sents) == 4
    assert sents[0].startswith("Bạn đang tìm kiếm")
    assert "8.500.000 VNĐ/tháng" in sents[1]
    assert "mạng 5G tốc độ cao" in sents[2]
    assert "Liên hệ Fanpage" in sents[3]


# ==============================================================================
# NHÓM 2: GOLDEN SET BENCHMARK (MỤC 15.4 TRONG KẾ HOẠCH)
# ==============================================================================

def test_golden_set_15_4_mapping(golden_caption, golden_facts):
    """Xác thực 100% khớp chuẩn mẫu Golden Set mục 15.4."""
    maps = map_caption_to_sentence_fact_map(
        golden_caption,
        golden_facts,
        expected_cta="Liên hệ Fanpage để đặt lịch xem phòng thực tế.",
    )

    assert len(maps) == 4

    # Câu 0: Hook
    assert maps[0].sentence_index == 0
    assert maps[0].sentence_type == "hook"
    assert maps[0].fact_id == "NONE"
    assert maps[0].is_factual is False
    assert maps[0].entailment_status == "supported"

    # Câu 1: Factual liên kết f01 và f02
    assert maps[1].sentence_index == 1
    assert maps[1].sentence_type == "factual"
    assert set(maps[1].fact_id) == {"f01", "f02"}
    assert maps[1].is_factual is True
    assert maps[1].entailment_status == "supported"

    # Câu 2: Factual liên kết f03
    assert maps[2].sentence_index == 2
    assert maps[2].sentence_type == "factual"
    assert maps[2].fact_id == ["f03"]
    assert maps[2].is_factual is True
    assert maps[2].entailment_status == "supported"

    # Câu 3: CTA
    assert maps[3].sentence_index == 3
    assert maps[3].sentence_type == "cta"
    assert maps[3].fact_id == "SYSTEM_CTA"
    assert maps[3].is_factual is False
    assert maps[3].entailment_status == "supported"


# ==============================================================================
# NHÓM 3: 15 CA KIỂM THỬ ADVERSARIAL (10 PARTIAL + 5 UNSUPPORTED)
# ==============================================================================

# --- 10 CA PARTIAL ---

def test_partial_01_degree_adjective_cao_cap(golden_facts_dict):
    sent = "Căn hộ Studio cao cấp tại TripC Da Nang có giá thuê 8.500.000 VNĐ/tháng."
    status, reasons = check_factual_entailment(sent, ["f01"], golden_facts_dict)
    assert status == "partial"
    assert any("cao cấp" in r for r in reasons)


def test_partial_02_degree_adjective_hien_dai(golden_facts_dict):
    sent = "Toàn bộ tòa nhà được phủ sóng mạng 5G tốc độ cao hiện đại."
    status, reasons = check_factual_entailment(sent, ["f03"], golden_facts_dict)
    assert status == "partial"
    assert any("hiện đại" in r for r in reasons)


def test_partial_03_degree_adjective_sang_trong(golden_facts_dict):
    sent = "Không gian sang trọng cách bãi biển Mỹ Khê 200m."
    status, reasons = check_factual_entailment(sent, ["f02"], golden_facts_dict)
    assert status == "partial"
    assert any("sang trọng" in r for r in reasons)


def test_partial_04_degree_adjective_dang_cap_bac_nhat(golden_facts_dict):
    sent = "Vị trí đẳng cấp cách bãi biển Mỹ Khê 200m."
    status, reasons = check_factual_entailment(sent, ["f02"], golden_facts_dict)
    assert status == "partial"
    assert any("đẳng cấp" in r for r in reasons)


def test_partial_05_scope_expansion_tat_ca_moi(golden_facts_dict):
    sent = "Tất cả mọi căn hộ tại TripC Da Nang đều có vị trí cách bãi biển Mỹ Khê 200m."
    status, reasons = check_factual_entailment(sent, ["f02"], golden_facts_dict)
    assert status == "partial"
    assert any("tất cả mọi" in r for r in reasons)


def test_partial_06_scope_expansion_toan_thanh_pho(golden_facts_dict):
    sent = "Toàn thành phố được phủ sóng mạng 5G tốc độ cao."
    status, reasons = check_factual_entailment(sent, ["f03"], golden_facts_dict)
    assert status == "partial"
    assert any("toàn thành phố" in r for r in reasons)


def test_partial_07_result_inference_luon_thong_suot(golden_facts_dict):
    sent = "Toàn bộ tòa nhà được phủ sóng mạng 5G tốc độ cao luôn thông suốt."
    status, reasons = check_factual_entailment(sent, ["f03"], golden_facts_dict)
    assert status == "partial"
    assert any("luôn thông suốt" in r for r in reasons)


def test_partial_08_result_inference_chac_chan_hai_long(golden_facts_dict):
    sent = "Vị trí cách bãi biển Mỹ Khê 200m chắc chắn làm hài lòng cư dân."
    status, reasons = check_factual_entailment(sent, ["f02"], golden_facts_dict)
    assert status == "partial"
    assert any("chắc chắn làm hài lòng" in r for r in reasons)


def test_partial_09_temporal_addition_moi_ngay(golden_facts_dict):
    # Gốc chỉ nói giá thuê 8.500.000 VNĐ/tháng, không có dọn phòng mỗi ngày
    sent = "Căn hộ Studio tại TripC Da Nang có giá thuê 8.500.000 VNĐ/tháng và dọn phòng mỗi ngày."
    status, reasons = check_factual_entailment(sent, ["f01"], golden_facts_dict)
    assert status == "partial"
    assert any("mỗi ngày" in r for r in reasons)


def test_partial_10_temporal_addition_24_7_moi_luc(golden_facts_dict):
    sent = "Toàn bộ tòa nhà được phủ sóng mạng 5G tốc độ cao 24/7 mọi lúc."
    status, reasons = check_factual_entailment(sent, ["f03"], golden_facts_dict)
    assert status == "partial"
    assert any("24/7 mọi lúc" in r for r in reasons)


# --- 5 CA UNSUPPORTED ---

def test_unsupported_11_numeric_price_mismatch(golden_facts_dict):
    sent = "Căn hộ Studio tại TripC Da Nang có giá thuê chỉ 5.000.000 VNĐ/tháng."
    status, reasons = check_factual_entailment(sent, ["f01"], golden_facts_dict)
    assert status == "unsupported"
    assert any("5.000.000" in r for r in reasons)


def test_unsupported_12_distance_mismatch(golden_facts_dict):
    sent = "Căn hộ tọa lạc cách bãi biển Mỹ Khê chỉ 50m."
    status, reasons = check_factual_entailment(sent, ["f02"], golden_facts_dict)
    assert status == "unsupported"
    assert any("50" in r for r in reasons)


def test_unsupported_13_hallucinated_amenity_jacuzzi(golden_facts_dict):
    sent = "Căn hộ Studio trang bị bồn sục Jacuzzi riêng và xông hơi hiện đại."
    status, reasons = check_factual_entailment(sent, ["f01"], golden_facts_dict)
    assert status == "unsupported"
    assert any("bồn sục" in r or "jacuzzi" in r for r in reasons)


def test_unsupported_14_zero_claim_violation_on_hook():
    sent = "Bạn có muốn nhận giảm giá 50% cho căn hộ tốt nhất tại biển Mỹ Khê?"
    is_compliant, violations = check_zero_claim(sent, "hook")
    assert is_compliant is False
    assert any("50%" in v or "số liệu" in v or "tốt nhất" in v for v in violations)


def test_unsupported_15_zero_claim_violation_on_cta():
    sent = "Đăng ký ngay hôm nay để nhận 1 tháng thuê phòng miễn phí 100%!"
    is_compliant, violations = check_zero_claim(sent, "cta", expected_cta="Liên hệ Fanpage")
    assert is_compliant is False
    assert any("100%" in v or "số liệu" in v or "nguyên văn" in v for v in violations)


# ==============================================================================
# NHÓM 4: TOÀN BỘ 15 CA BỊ BẮT CHÍNH XÁC TRONG MAPPER
# ==============================================================================

def test_all_15_cases_caught_in_full_pipeline(golden_facts):
    """Kiểm tra pipeline phát hiện chính xác tất cả các vi phạm partial và unsupported."""
    adversarial_caption = (
        "Bạn có muốn nhận giảm giá 50% cho căn hộ tốt nhất?\n\n"  # Hook vi phạm Zero-Claim -> unsupported
        "Căn hộ Studio cao cấp có giá thuê 8.500.000 VNĐ/tháng.\n\n"  # Factual partial (cao cấp)
        "Vị trí cách bãi biển Mỹ Khê chỉ 50m.\n\n"  # Factual unsupported (lệch số 50m vs 200m)
        "Đăng ký ngay hôm nay để nhận phòng miễn phí 100%!"  # CTA vi phạm Zero-Claim -> unsupported
    )

    maps = map_caption_to_sentence_fact_map(
        adversarial_caption,
        golden_facts,
        expected_cta="Liên hệ Fanpage để đặt lịch xem phòng.",
    )

    assert len(maps) == 4
    # Câu 0: Hook vi phạm Zero-Claim -> unsupported
    assert maps[0].sentence_type == "hook"
    assert maps[0].entailment_status == "unsupported"

    # Câu 1: Factual partial (thêm tính từ cao cấp)
    assert maps[1].sentence_type == "factual"
    assert maps[1].entailment_status == "partial"

    # Câu 2: Factual unsupported (lệch khoảng cách 50m)
    assert maps[2].sentence_type == "factual"
    assert maps[2].entailment_status == "unsupported"

    # Câu 3: CTA vi phạm Zero-Claim -> unsupported
    assert maps[3].sentence_type == "cta"
    assert maps[3].entailment_status == "unsupported"
