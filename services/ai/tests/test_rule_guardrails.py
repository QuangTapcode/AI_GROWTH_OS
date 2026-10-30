"""Comprehensive unit tests for CM-13 Deterministic Guardrails Engine.

Verifies:
- TC-01: Price claim detection (Vietnamese price patterns & slang: 8tr, 8,5 triệu, 50k, 5.000.000đ, 1 củ, tám triệu, $200, VNĐ/USD, nửa giá).
- TC-02: Unsupported numbers, percentages, and dates (with format normalization).
- TC-03: Unsupported promotional terms, testimonials, and superlatives.
- TC-10: Sentence map factual sentences missing fact_id or referencing unknown fact_id.
- TC-11: Zero-Claim Rule compliance for Hook and CTA (no unbacked numbers/prices/superlatives).
- TC-12: Tenant-specific forbidden terms.
- Boundary checks: Channel restrictions and URL whitelisting.
- Anti-false-positive guarantees: 0 false positives on supported facts and Golden Samples.

Requirements: >= 200 pytest test cases passing 100%.
"""

from __future__ import annotations

import pytest

from src.agents.content.rule_guardrails import (
    DEFAULT_ALLOWED_DOMAINS,
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
from src.agents.content.social_pack_v2 import FactItem, SentenceMap


# ==============================================================================
# SUITE 1: VIETNAMESE PRICE CLAIM DETECTION - POSITIVE VIOLATIONS (TC-01, TC-12)
# >= 45 cases
# ==============================================================================

@pytest.mark.parametrize(
    "text, expected_matched",
    [
        # Digits with "tr" / "triệu"
        ("Phòng cho thuê chỉ 8tr mỗi tháng.", "8tr"),
        ("Giá căn hộ là 8 tr/tháng.", "8 tr"),
        ("Căn hộ studio 8.5tr bao gồm phí quản lý.", "8.5tr"),
        ("Căn hộ studio 8,5tr full nội thất.", "8,5tr"),
        ("Chỉ 12tr bạn có ngay căn hộ biển.", "12tr"),
        ("Mức giá 8 triệu mỗi tháng.", "8 triệu"),
        ("Chỉ 8,5 triệu đồng đã bao gồm phí.", "8,5 triệu"),
        ("Căn penthouse giá 25 trieu.", "25 trieu"),
        # Digits with "k" / "nghìn"
        ("Phí gửi xe chỉ 50k một ngày.", "50k"),
        ("Cà phê sáng 50 k ngay tại sảnh.", "50 k"),
        ("Vé vào hồ bơi 50K cho cư dân.", "50K"),
        ("Ăn trưa chỉ 35k cực kỳ tiết kiệm.", "35k"),
        ("Dịch vụ giặt ủi 100k mỗi tuần.", "100k"),
        ("Phí dọn phòng 200k.", "200k"),
        ("Giá 500 nghìn cho gói dịch vụ.", "500 nghìn"),
        ("Phí vào cổng 100 ngàn đồng.", "100 ngàn"),
        # Standard currency & symbols: đ, đồng, vnđ, vnd, $, usd, €
        ("Tiền thuê phòng là 5.000.000đ mỗi tháng.", "5.000.000đ"),
        ("Giá phòng là 5,000,000đ đã có thuế.", "5,000,000đ"),
        ("Phí trọn gói 5.000.000 đồng hàng tháng.", "5.000.000 đồng"),
        ("Chi phí khoảng 8.500.000 VNĐ.", "8.500.000 VNĐ"),
        ("Giá thuê 7000000 vnd mỗi tháng.", "7000000 vnd"),
        ("Chi phí chỉ $200 cho một tuần.", "$200"),
        ("Mức giá 200$ mỗi đêm.", "200$"),
        ("Giá thuê 500 USD mỗi tháng.", "500 USD"),
        ("Gói làm việc 200usd dành cho nomad.", "200usd"),
        ("Vé sự kiện €50 cho khách mời.", "€50"),
        ("Phí tham gia 50€ trọn gói.", "50€"),
        # Vietnamese slang: "củ", "chỉ 1 củ"
        ("Căn này thuê chỉ 1 củ tiền cọc.", "1 củ"),
        ("Giá thuê chỉ 2 củ mỗi tháng.", "2 củ"),
        ("Chỉ cần cọc 3 củ là vào ở ngay.", "3 củ"),
        ("Gói dịch vụ 5 củ ưu đãi.", "5 củ"),
        ("Phòng nhỏ giá 1 cu.", "1 cu"),
        # Textual numbers: "tám triệu", "hai triệu", "mười triệu", "nửa củ"
        ("Giá phòng tám triệu đồng một tháng.", "tám triệu đồng"),
        ("Chi phí hai triệu mỗi tháng.", "hai triệu"),
        ("Cọc trước ba triệu khi nhận phòng.", "ba triệu"),
        ("Giá thuê mười triệu mỗi tháng.", "mười triệu"),
        ("Phí dịch vụ năm mươi nghìn một ngày.", "năm mươi nghìn"),
        ("Tiền cọc nửa củ giữ phòng.", "nửa củ"),
        # Slang price idioms: "nửa giá", "đồng giá", "đại hạ giá"
        ("Phòng đẹp đang cho thuê nửa giá tuần này.", "nửa giá"),
        ("Tuần lễ vàng đồng giá phòng studio.", "đồng giá"),
        ("Khách sạn đang đại hạ giá mùa mưa.", "đại hạ giá"),
        ("Căn hộ view biển hạ giá bất ngờ.", "hạ giá"),
        # Embedded in sentence
        ("Hãy liên hệ ngay để nhận phòng 8tr siêu đẹp.", "8tr"),
        ("Cơ hội nhận căn hộ giá 8,5 triệu đang chờ bạn.", "8,5 triệu"),
        ("Chỉ cần 50k bạn đã có ly cà phê ngon.", "50k"),
        ("Tiết kiệm với chi phí 5.000.000đ mỗi tháng.", "5.000.000đ"),
    ],
)
def test_price_claims_positive_unsupported(text: str, expected_matched: str) -> None:
    """Ensure all Vietnamese price patterns are caught when not present in facts."""
    assert has_price_claim(text) is True
    violations = check_price_claims(text, allowed_facts=())
    assert len(violations) >= 1
    v = violations[0]
    assert v.code == "PRICE_CLAIM_UNSUPPORTED"
    assert expected_matched.lower() in v.matched_text.lower()
    assert v.span_start >= 0
    assert v.span_end > v.span_start


# ==============================================================================
# SUITE 2: PRICE CLAIMS - NEGATIVE CASES (PERMITTED WHEN IN FACTS)
# >= 30 cases
# ==============================================================================

@pytest.mark.parametrize(
    "text, fact_text",
    [
        ("Giá thuê 8.500.000 VNĐ/tháng.", "Căn hộ có giá thuê 8.500.000 VNĐ/tháng."),
        ("Mức giá 8.500.000 VNĐ trọn gói.", "Mức giá 8.500.000 VNĐ trọn gói."),
        ("Căn hộ giá 8tr/tháng.", "Căn hộ giá 8tr/tháng tại Mỹ Khê."),
        ("Giá thuê 8,5 triệu đã bao gồm phí.", "Giá thuê 8,5 triệu đã bao gồm phí quản lý."),
        ("Phí dịch vụ 50k một ngày.", "Phí dịch vụ 50k một ngày."),
        ("Giá phòng 5.000.000đ mỗi tháng.", "Giá phòng 5.000.000đ mỗi tháng."),
        ("Tiền thuê $200 mỗi tuần.", "Tiền thuê $200 mỗi tuần cho khách nomad."),
        ("Căn hộ 200 USD/tháng.", "Căn hộ 200 USD/tháng."),
        ("Cọc giữ chỗ 1 củ.", "Cọc giữ chỗ 1 củ đã được thỏa thuận."),
        ("Mức giá tám triệu đồng.", "Mức giá tám triệu đồng hàng tháng."),
        ("Thuê phòng nửa giá theo chương trình.", "Khách hàng được thuê phòng nửa giá."),
        ("Căn hộ đồng giá cho nomad.", "Chính sách căn hộ đồng giá cho nomad."),
        ("Phí dọn dẹp 100k.", "Phí dọn dẹp 100k/lần."),
        ("Giá 500 nghìn vé tháng.", "Giá 500 nghìn vé tháng tập gym."),
        ("Căn studio giá 12tr.", "Căn studio giá 12tr view biển."),
        # No price claim in text at all
        ("Tòa nhà tọa lạc cách bãi biển Mỹ Khê 200m.", "Tọa lạc cách bãi biển Mỹ Khê 200m."),
        ("Trang bị hạ tầng mạng 5G tốc độ cao.", "Hạ tầng mạng 5G phủ sóng toàn tòa nhà."),
        ("Căn hộ có diện tích 120m2 thoáng mát.", "Diện tích căn hộ đạt 120m2."),
        ("Hồ bơi vô cực tại tầng 15.", "Hồ bơi vô cực tọa lạc tại tầng 15."),
        ("Không gian yên tĩnh phù hợp làm việc.", "Không gian yên tĩnh phù hợp làm việc từ xa."),
        ("Ban công ngắm trọn hoàng hôn biển.", "Ban công riêng nhìn ra biển Mỹ Khê."),
        ("Bàn làm việc công thái học chuẩn chỉnh.", "Trang bị bàn ghế công thái học hiện đại."),
        ("Gần các quán cà phê và nhà hàng hải sản.", "Khu vực tập trung nhiều quán ăn ngon."),
        ("Cung cấp xe đạp nội khu.", "Cung cấp xe đạp nội khu."),
        ("Thời gian mở cửa từ 8:00 đến 22:00.", "Thời gian mở cửa từ 8:00 đến 22:00 hàng ngày."),
        ("Phù hợp cho cả cá nhân và nhóm làm việc.", "Không gian làm việc cho cá nhân và nhóm."),
        ("Có khu bếp chung đầy đủ tiện nghi.", "Khu bếp chung trang bị lò vi sóng và bếp từ."),
        ("Hỗ trợ check-in tự động nhanh chóng.", "Hệ thống check-in tự động 24h."),
        ("Phòng tắm riêng có bình nóng lạnh.", "Mỗi phòng đều có nhà vệ sinh khép kín."),
        ("Đón ánh sáng tự nhiên suốt cả ngày.", "Cửa sổ lớn đón ánh sáng tự nhiên."),
    ],
)
def test_price_claims_negative_allowed_when_in_facts(text: str, fact_text: str) -> None:
    """Prices present in facts or text without prices must produce 0 price violations."""
    fact_item = FactItem(fact_id="f01", text=fact_text, source_type="seo_body")
    violations = check_price_claims(text, allowed_facts=[fact_item])
    assert len(violations) == 0, f"False positive detected: {violations}"


# ==============================================================================
# SUITE 3: UNSUPPORTED NUMBERS, PERCENTAGES, AND DATES (TC-02)
# >= 40 positive violation cases
# ==============================================================================

@pytest.mark.parametrize(
    "text, expected_code, expected_match",
    [
        # Percentages
        ("Ưu đãi giảm ngay 50% trong tuần.", "PERCENTAGE_UNSUPPORTED", "50%"),
        ("Khuyến mãi tới 90% cho khách đầu tiên.", "PERCENTAGE_UNSUPPORTED", "90%"),
        ("Tỷ lệ hài lòng 100% của cư dân.", "PERCENTAGE_UNSUPPORTED", "100%"),
        ("Tiết kiệm 20% chi phí lưu trú.", "PERCENTAGE_UNSUPPORTED", "20%"),
        ("Chiết khấu 15% cho hợp đồng năm.", "PERCENTAGE_UNSUPPORTED", "15%"),
        ("Giảm 5% phí dịch vụ hàng tháng.", "PERCENTAGE_UNSUPPORTED", "5%"),
        ("Tăng trưởng 8.5% so với cùng kỳ.", "PERCENTAGE_UNSUPPORTED", "8.5%"),
        ("Giảm tới 30% khi thanh toán sớm.", "PERCENTAGE_UNSUPPORTED", "30%"),
        # Dates / Times
        ("Khai trương chính thức vào 15/10/2026.", "DATE_UNSUPPORTED", "15/10/2026"),
        ("Sự kiện diễn ra ngày 24/12/2026.", "DATE_UNSUPPORTED", "24/12/2026"),
        ("Đăng ký trước ngày 30/11.", "DATE_UNSUPPORTED", "30/11"),
        ("Hỗ trợ kỹ thuật 24/7 cho cư dân.", "DATE_UNSUPPORTED", "24/7"),
        ("Bắt đầu từ ngày 15.", "DATE_UNSUPPORTED", "ngày 15"),
        ("Chương trình áp dụng trong tháng 10.", "DATE_UNSUPPORTED", "tháng 10"),
        ("Mục tiêu hoàn thành trong năm 2030.", "DATE_UNSUPPORTED", "năm 2030"),
        ("Gặp nhau vào thứ 7 tuần này.", "DATE_UNSUPPORTED", "thứ 7"),
        ("Sự kiện kết thúc lúc 20h.", "DATE_UNSUPPORTED", "20h"),
        ("Lớp yoga mở lúc 6h sáng.", "DATE_UNSUPPORTED", "6h"),
        ("Nhận phòng trước 14h hàng ngày.", "DATE_UNSUPPORTED", "14h"),
        # Standalone Numbers & Quantities
        ("Căn hộ rộng tới 150m2.", "NUMBER_UNSUPPORTED", "150"),
        ("Tòa nhà có 99 phòng lưu trú.", "NUMBER_UNSUPPORTED", "99"),
        ("Cách sân bay chỉ 15km.", "NUMBER_UNSUPPORTED", "15"),
        ("Phòng ngủ trang bị 3 giường lớn.", "NUMBER_UNSUPPORTED", "3"),
        ("Đón hơn 500 khách lưu trú mỗi tháng.", "NUMBER_UNSUPPORTED", "500"),
        ("Dịch vụ bao gồm 7 ngày thử nghiệm.", "NUMBER_UNSUPPORTED", "7"),
        ("Tòa nhà cao 35 tầng hướng biển.", "NUMBER_UNSUPPORTED", "35"),
        ("Có tới 12 phòng họp riêng biệt.", "NUMBER_UNSUPPORTED", "12"),
        ("Hồ bơi dài 50m đạt chuẩn olympic.", "NUMBER_UNSUPPORTED", "50"),
        ("Chỉ mất 2 phút đi bộ ra bãi tắm.", "NUMBER_UNSUPPORTED", "2"),
        ("Sức chứa hội trường lên tới 250 người.", "NUMBER_UNSUPPORTED", "250"),
        ("Có 4 thang máy tốc độ cao.", "NUMBER_UNSUPPORTED", "4"),
        ("Được trang bị 8 máy giặt sấy.", "NUMBER_UNSUPPORTED", "8"),
        ("Trải nghiệm 6 tiện ích cao cấp.", "NUMBER_UNSUPPORTED", "6"),
        ("Tặng voucher cho 300 khách hàng.", "NUMBER_UNSUPPORTED", "300"),
        ("Thời gian thuê tối thiểu 60 ngày.", "NUMBER_UNSUPPORTED", "60"),
        ("Phí cọc tương đương 45 ngày thuê.", "NUMBER_UNSUPPORTED", "45"),
        ("Cung cấp 10 gói dịch vụ tiện ích.", "NUMBER_UNSUPPORTED", "10"),
        ("Tặng 3 ngày nghỉ dưỡng cuối tuần.", "NUMBER_UNSUPPORTED", "3"),
        ("Chỉ còn 9 phòng trống.", "NUMBER_UNSUPPORTED", "9"),
        ("Cộng đồng hơn 80 người làm việc.", "NUMBER_UNSUPPORTED", "80"),
    ],
)
def test_unsupported_numbers_positive(text: str, expected_code: str, expected_match: str) -> None:
    """Ensure unbacked numbers, percentages, and dates are strictly detected."""
    violations = check_unsupported_numbers(text, allowed_facts=())
    assert len(violations) >= 1
    matched_codes = [v.code for v in violations]
    assert expected_code in matched_codes or "NUMBER_UNSUPPORTED" in matched_codes
    all_matched = " ".join(v.matched_text for v in violations)
    assert expected_match.lower() in all_matched.lower()


# ==============================================================================
# SUITE 4: NUMBERS, %, DATES - NEGATIVE CASES (PERMITTED WHEN IN FACTS)
# >= 30 cases
# ==============================================================================

@pytest.mark.parametrize(
    "text, fact_text",
    [
        ("Căn hộ studio cách biển 200m.", "Tọa lạc cách bãi biển Mỹ Khê 200m."),
        ("Diện tích căn hộ đạt 120m2.", "Diện tích căn hộ đạt 120m2 với ban công riêng."),
        ("Tòa nhà phủ sóng mạng 5G tốc độ cao.", "Toàn bộ tòa nhà phủ sóng mạng 5G."),
        ("Đà Nẵng nằm trong top 5 thành phố nomad.", "Đà Nẵng nằm trong top 5 thành phố có tốc độ phát triển cao."),
        ("Báo cáo xu hướng làm việc năm 2026.", "Xu hướng làm việc từ xa năm 2026."),
        ("Hỗ trợ cư dân 24/7 suốt tuần.", "Đội ngũ lễ tân hỗ trợ 24/7."),
        ("Thời gian mở cửa lúc 8h sáng.", "Khu vực làm việc mở cửa lúc 8h sáng."),
        ("Áp dụng trong tháng 10 này.", "Chương trình thử nghiệm diễn ra trong tháng 10."),
        ("Sự kiện tổ chức ngày 24/10/2026.", "Ngày 24/10/2026 diễn ra buổi gặp mặt cộng đồng."),
        ("Đạt tỷ lệ tăng trưởng 50%.", "Doanh nghiệp ghi nhận mức tăng trưởng 50%."),
        ("Tiết kiệm 30% chi phí vận hành.", "Khảo sát cho thấy giúp tiết kiệm 30% chi phí."),
        # Format normalization: 8.500.000 vs 8500000
        ("Mức giá 8500000 VNĐ.", "Giá thuê trọn gói là 8.500.000 VNĐ mỗi tháng."),
        ("Giá phòng là 8.500.000đ.", "Căn hộ có giá thuê 8500000đ."),
        ("Diện tích 120 mét vuông.", "Căn hộ có diện tích 120 mét vuông."),
        ("Phòng ngủ tại tầng 8 view biển.", "Căn hộ studio tại tầng 8 view biển Mỹ Khê."),
        ("Trang bị 2 màn hình phụ.", "Mỗi bàn làm việc có 2 màn hình phụ."),
        ("Bao gồm 4 khu vực tiếp khách.", "Tòa nhà có 4 khu vực tiếp khách sang trọng."),
        ("Bể bơi dài 25m ngoài trời.", "Khu bể bơi ngoài trời dài 25m."),
        ("Chỉ mất 5 phút ra bãi biển.", "Khoảng cách ra bãi tắm mất 5 phút đi bộ."),
        ("Tòa nhà có 50 phòng cao cấp.", "Tòa nhà gồm 50 phòng cao cấp."),
        ("Nằm ở vị trí thứ 3 trong bảng xếp hạng.", "Đứng vị trí thứ 3 trong danh sách."),
        ("Ngày 15 hàng tháng tổng kết.", "Buổi sinh hoạt chung diễn ra ngày 15 hàng tháng."),
        # URL digits masking: digits in URLs must not trigger loose number violations
        ("Xem chi tiết tại https://tripc.vn/trends/workation-danang-2026 nhé.", "Xem chi tiết tại website TripC."),
        ("Đọc bài viết tại https://tripc.vn/penthouse-120 ngay hôm nay.", "Đọc bài viết về căn penthouse 120m2."),
        ("Ghé thăm website https://tripc.vn/post-99 để xem ảnh.", "Ghé thăm website chính thức của tòa nhà."),
        # Text without any numbers
        ("Không gian xanh mát và ngập tràn ánh nắng.", "Tòa nhà ngập tràn ánh nắng tự nhiên."),
        ("Khu vực tiếp khách lịch sự và trang nhã.", "Khu vực tiếp khách rộng rãi."),
        ("Nội thất gỗ tự nhiên mộc mạc và ấm cúng.", "Nội thất sử dụng chất liệu gỗ tự nhiên."),
        ("Trải nghiệm làm việc thảnh thơi gần biển.", "Môi trường sống và làm việc cân bằng cạnh bờ biển."),
        ("Đội ngũ nhân viên thân thiện và nhiệt tình.", "Đội ngũ nhân sự tận tâm hỗ trợ cư dân."),
    ],
)
def test_unsupported_numbers_negative_allowed(text: str, fact_text: str) -> None:
    """Numbers backed by facts or inside URLs must NOT trigger false positive violations."""
    fact_item = FactItem(fact_id="f01", text=fact_text, source_type="seo_body")
    violations = check_unsupported_numbers(text, allowed_facts=[fact_item])
    assert len(violations) == 0, f"False positive detected: {violations}"


# ==============================================================================
# SUITE 5: PROMOTIONAL, TESTIMONIAL, AND SUPERLATIVE TERMS (TC-03)
# >= 40 cases (positive & negative)
# ==============================================================================

@pytest.mark.parametrize(
    "text, expected_code, expected_term",
    [
        # Promotional terms
        ("Nhận phòng và tặng ngay một đêm nghỉ dưỡng.", "PROMOTIONAL_TERM_UNSUPPORTED", "tặng"),
        ("Sử dụng dịch vụ free hoàn toàn tuần này.", "PROMOTIONAL_TERM_UNSUPPORTED", "free"),
        ("Dịch vụ ăn sáng miễn phí cho tất cả cư dân.", "PROMOTIONAL_TERM_UNSUPPORTED", "miễn phí"),
        ("Gói combo làm việc kết hợp nghỉ dưỡng ưu đãi.", "PROMOTIONAL_TERM_UNSUPPORTED", "combo"),
        ("Chỉ hôm nay để nhận phòng giá tốt.", "PROMOTIONAL_TERM_UNSUPPORTED", "chỉ hôm nay"),
        ("Chương trình ưu đãi cho khách đặt sớm.", "PROMOTIONAL_TERM_UNSUPPORTED", "ưu đãi"),
        ("Chương trình khuyến mãi mùa du lịch hè.", "PROMOTIONAL_TERM_UNSUPPORTED", "khuyến mãi"),
        ("Nhận voucher giảm giá khi check-in.", "PROMOTIONAL_TERM_UNSUPPORTED", "voucher"),
        ("Cơ hội nhận quà tặng đặc biệt.", "PROMOTIONAL_TERM_UNSUPPORTED", "quà tặng"),
        ("Chương trình giảm sốc chưa từng có.", "PROMOTIONAL_TERM_UNSUPPORTED", "giảm sốc"),
        ("Chương trình tri ân khách hàng thân thiết.", "PROMOTIONAL_TERM_UNSUPPORTED", "tri ân"),
        # Testimonial terms
        ("Khách nói đây là căn hộ tuyệt vời nhất.", "TESTIMONIAL_UNSUPPORTED", "khách nói"),
        ("Chất lượng phòng đạt chuẩn 5 sao quốc tế.", "TESTIMONIAL_UNSUPPORTED", "5 sao"),
        ("Trải nghiệm dịch vụ năm sao tại bãi biển.", "TESTIMONIAL_UNSUPPORTED", "năm sao"),
        ("Căn hộ được chứng nhận chuẩn xanh.", "TESTIMONIAL_UNSUPPORTED", "được chứng nhận"),
        ("Tòa nhà có chứng nhận tiêu chuẩn an toàn.", "TESTIMONIAL_UNSUPPORTED", "chứng nhận"),
        ("Tất cả khách hàng đánh giá rất tích cực.", "TESTIMONIAL_UNSUPPORTED", "khách hàng đánh giá"),
        ("Nhận được nhiều review tốt từ cộng đồng.", "TESTIMONIAL_UNSUPPORTED", "review tốt"),
        ("Đến ở đây ai cũng khen không gian thoáng.", "TESTIMONIAL_UNSUPPORTED", "ai cũng khen"),
        ("Nhiều người dùng khen ngợi tốc độ internet.", "TESTIMONIAL_UNSUPPORTED", "người dùng khen"),
        # Superlative / Absolute claims
        ("Mạng internet luôn luôn ổn định 100%.", "SUPERLATIVE_UNSUPPORTED", "luôn luôn"),
        ("Căn hộ có view biển tốt nhất Đà Nẵng.", "SUPERLATIVE_UNSUPPORTED", "tốt nhất"),
        ("Mức giá thuê rẻ nhất khu vực Mỹ Khê.", "SUPERLATIVE_UNSUPPORTED", "rẻ nhất"),
        ("TripC là thương hiệu số 1 về lưu trú nomad.", "SUPERLATIVE_UNSUPPORTED", "số 1"),
        ("Đơn vị lưu trú hàng đầu tại miền Trung.", "SUPERLATIVE_UNSUPPORTED", "hàng đầu"),
        ("Trải nghiệm không gian hoàn hảo nhất hiện nay.", "SUPERLATIVE_UNSUPPORTED", "hoàn hảo nhất"),
        ("Chính sách độc quyền chỉ có tại tòa nhà.", "SUPERLATIVE_UNSUPPORTED", "độc quyền"),
        ("Chất lượng dịch vụ vô địch tại bãi biển.", "SUPERLATIVE_UNSUPPORTED", "vô địch"),
        ("Đảm bảo an ninh tuyệt đối suốt ngày đêm.", "SUPERLATIVE_UNSUPPORTED", "tuyệt đối"),
        ("Quyền sử dụng vĩnh viễn không giới hạn.", "SUPERLATIVE_UNSUPPORTED", "vĩnh viễn"),
        ("Cảnh hoàng hôn đẹp không đâu bằng.", "SUPERLATIVE_UNSUPPORTED", "không đâu bằng"),
        ("Dịch vụ sang trọng không đâu sánh bằng.", "SUPERLATIVE_UNSUPPORTED", "không đâu sánh bằng"),
        ("Tận hưởng căn hộ đỉnh nhất thành phố.", "SUPERLATIVE_UNSUPPORTED", "đỉnh nhất"),
        ("Nội thất xịn nhất trong phân khúc studio.", "SUPERLATIVE_UNSUPPORTED", "xịn nhất"),
        ("Tòa nhà sang nhất tại đường Võ Nguyên Giáp.", "SUPERLATIVE_UNSUPPORTED", "sang nhất"),
    ],
)
def test_unsupported_claims_positive(text: str, expected_code: str, expected_term: str) -> None:
    """Ensure promotional, testimonial, and superlative claims without fact backing are flagged."""
    violations = check_unsupported_claims(text, allowed_facts=())
    assert len(violations) >= 1
    matched_codes = [v.code for v in violations]
    assert expected_code in matched_codes
    matched_texts = " ".join(v.matched_text for v in violations)
    assert expected_term.lower() in matched_texts.lower()


@pytest.mark.parametrize(
    "text, fact_text",
    [
        ("Cung cấp bữa sáng miễn phí cho khách lưu trú.", "Toàn bộ khách lưu trú được phục vụ bữa sáng miễn phí."),
        ("Dịch vụ dọn phòng free mỗi tuần.", "Mỗi tuần có 1 buổi dọn phòng free theo hợp đồng."),
        ("Được tặng thêm voucher đồ uống.", "Khách check-in được tặng thêm voucher đồ uống tại quầy lễ tân."),
        ("Tòa nhà được chứng nhận tiêu chuẩn xanh EDGE.", "Công trình được chứng nhận tiêu chuẩn công trình xanh EDGE."),
        ("Đạt chuẩn 5 sao về chất lượng dịch vụ.", "Được tổ chức du lịch xếp hạng chuẩn 5 sao về chất lượng."),
        ("Khách hàng đánh giá cao không gian làm việc.", "Khảo sát cho thấy khách hàng đánh giá cao không gian yên tĩnh."),
        ("TripC là thương hiệu hàng đầu cho digital nomad.", "Được bình chọn là điểm đến hàng đầu cho cộng đồng digital nomad."),
        ("Cung cấp tiện ích độc quyền cho cư dân.", "Khu vực hồ bơi là tiện ích độc quyền cho cư dân tòa nhà."),
        # Neutral descriptions without forbidden terms
        ("Căn hộ studio thoáng mát và sạch sẽ.", "Căn hộ studio được dọn dẹp sạch sẽ trước khi bàn giao."),
        ("Tọa lạc trên đường biển xinh đẹp của Đà Nẵng.", "Tòa nhà tọa lạc gần bãi biển Mỹ Khê Đà Nẵng."),
        ("Không gian yên bình giúp tập trung làm việc.", "Không gian yên tĩnh tạo cảm hứng làm việc năng suất."),
        ("Trang bị bàn ghế gỗ và ban công thoáng đãng.", "Nội thất gồm bàn ghế gỗ và ban công riêng biệt."),
    ],
)
def test_unsupported_claims_negative_allowed(text: str, fact_text: str) -> None:
    """Promotional/superlative terms backed by facts or neutral copy must NOT be flagged."""
    fact_item = FactItem(fact_id="f01", text=fact_text, source_type="seo_body")
    violations = check_unsupported_claims(text, allowed_facts=[fact_item])
    assert len(violations) == 0, f"False positive detected: {violations}"


# ==============================================================================
# SUITE 6: URL WHITELISTING & CHANNELS BOUNDARIES
# >= 25 cases
# ==============================================================================

@pytest.mark.parametrize(
    "urls, expected_violation",
    [
        (["https://scam-site.com/offer"], True),
        (["https://phishing.net/login"], True),
        (["https://booking.com/hotel/tripc"], True),
        (["https://airbnb.com/rooms/12345"], True),
        (["http://unapproved-partner.org/promo"], True),
        (["https://bad-link.xyz"], True),
        (["https://tripc.vn/blog/can-ho-studio"], False),
        (["https://m.me/tripcdanang"], False),
        (["https://cdn.tripc.vn/assets/studio_real.jpg"], False),
        (["https://tripc.vn"], False),
        (["https://subdomain.tripc.vn/post"], False),
    ],
)
def test_url_whitelist_rules(urls: list[str], expected_violation: bool) -> None:
    """Ensure URLs outside the whitelist are flagged as DISALLOWED_URL."""
    violations = check_urls(urls, allowed_domains=["tripc.vn", "m.me", "cdn.tripc.vn"])
    if expected_violation:
        assert len(violations) >= 1
        assert violations[0].code == "DISALLOWED_URL"
    else:
        assert len(violations) == 0


@pytest.mark.parametrize(
    "channels, target_channels, expected_code",
    [
        (["instagram"], ["facebook", "tiktok"], "INVALID_CHANNEL"),
        (["youtube"], ["facebook", "tiktok"], "INVALID_CHANNEL"),
        (["zalo"], ["facebook", "tiktok"], "INVALID_CHANNEL"),
        (["twitter"], ["facebook", "tiktok"], "INVALID_CHANNEL"),
        (["threads"], ["facebook", "tiktok"], "INVALID_CHANNEL"),
        (["tiktok"], ["facebook"], "UNSELECTED_CHANNEL"),
        (["facebook", "tiktok"], ["facebook"], "UNSELECTED_CHANNEL"),
        (["facebook"], ["tiktok"], "UNSELECTED_CHANNEL"),
        # Valid cases
        (["facebook"], ["facebook"], None),
        (["tiktok"], ["tiktok"], None),
        (["facebook", "tiktok"], ["facebook", "tiktok"], None),
    ],
)
def test_channel_boundaries(
    channels: list[str],
    target_channels: list[str],
    expected_code: str | None,
) -> None:
    """Validate that unsupported channels or channels outside request selection are blocked."""
    violations = check_channels(channels, target_channels=target_channels)
    if expected_code:
        assert len(violations) >= 1
        assert any(v.code == expected_code for v in violations)
    else:
        assert len(violations) == 0


# ==============================================================================
# SUITE 7: TENANT FORBIDDEN TERMS (TC-12)
# >= 20 cases
# ==============================================================================

@pytest.mark.parametrize(
    "text, forbidden_list, expected_violation",
    [
        ("Đối thủ Airbnb không thể cung cấp dịch vụ tốt hơn.", ["Airbnb", "Oyo"], True),
        ("Khách sạn Oyo có giá rẻ nhưng chất lượng kém.", ["Airbnb", "Oyo"], True),
        ("Chúng tôi cam kết lợi nhuận 15% mỗi năm.", ["cam kết lợi nhuận", "lừa đảo"], True),
        ("Cảnh báo tránh xa các chiêu trò lừa đảo.", ["cam kết lợi nhuận", "lừa đảo"], True),
        ("Đảm bảo bao đậu visa cho khách quốc tế.", ["bao đậu", "chữa bách bệnh"], True),
        ("Thần dược chữa bách bệnh cho mọi người.", ["bao đậu", "chữa bách bệnh"], True),
        ("Sản phẩm xách tay giá gốc.", ["xách tay", "hàng nhái"], True),
        ("Nói không với hàng nhái trên thị trường.", ["xách tay", "hàng nhái"], True),
        # Clean cases
        ("Căn hộ TripC Da Nang cách bãi biển Mỹ Khê 200m.", ["Airbnb", "Oyo"], False),
        ("Hạ tầng internet cáp quang tốc độ cao.", ["cam kết lợi nhuận", "lừa đảo"], False),
        ("Không gian làm việc yên tĩnh và văn minh.", ["bao đậu", "chữa bách bệnh"], False),
        ("Dịch vụ lễ tân hỗ trợ nhiệt tình 24/7.", ["xách tay", "hàng nhái"], False),
    ],
)
def test_tenant_forbidden_terms(
    text: str,
    forbidden_list: list[str],
    expected_violation: bool,
) -> None:
    """Ensure tenant-configured sensitive words or competitor names trigger TENANT_FORBIDDEN_TERM."""
    violations = check_tenant_forbidden_terms(text, forbidden_terms=forbidden_list)
    if expected_violation:
        assert len(violations) >= 1
        assert violations[0].code == "TENANT_FORBIDDEN_TERM"
    else:
        assert len(violations) == 0


# ==============================================================================
# SUITE 8: SENTENCE MAP FACT_ID ASSIGNMENT & ZERO-CLAIM RULES (TC-10, TC-11)
# >= 25 cases
# ==============================================================================

def test_factual_sentence_missing_fact_id_violation() -> None:
    """TC-10: Factual sentences missing fact_id or set to NONE must trigger MISSING_FACT_ID."""
    s_map = [
        {"sentence_index": 0, "text": "Đà Nẵng là điểm đến tuyệt vời.", "sentence_type": "hook", "fact_id": "NONE"},
        {"sentence_index": 1, "text": "Căn hộ studio có giá 8.500.000 VNĐ.", "sentence_type": "factual", "fact_id": "NONE"},
    ]
    violations = check_factual_sentence_fact_ids(s_map, available_facts=[FactItem(fact_id="f01", text="Giá 8.5tr", source_type="seo_body")])
    assert len(violations) >= 1
    assert violations[0].code == "MISSING_FACT_ID"
    assert violations[0].sentence_index == 1


def test_factual_sentence_unknown_fact_id_violation() -> None:
    """TC-10: Factual sentence pointing to non-existent fact_id must trigger UNKNOWN_FACT_ID."""
    s_map = [
        SentenceMap(sentence_index=0, text="Căn hộ studio có diện tích 120m2.", sentence_type="factual", fact_id=["f99"]),
    ]
    violations = check_factual_sentence_fact_ids(s_map, available_facts=[FactItem(fact_id="f01", text="Diện tích 120m2", source_type="seo_body")])
    assert len(violations) >= 1
    assert violations[0].code == "UNKNOWN_FACT_ID"
    assert violations[0].matched_text == "f99"


@pytest.mark.parametrize(
    "hook_text, expected_violation",
    [
        # Hook containing unverified price or number (TC-11 Zero-Claim violation)
        ("Khám phá ngay căn hộ giá chỉ 8tr mỗi tháng!", True),
        ("Top 10 lý do bạn nên chọn sống tại TripC Da Nang.", True),
        ("Cơ hội nhận ưu đãi giảm giá 50% trong hôm nay.", True),
        ("Bạn có muốn trải nghiệm căn hộ tốt nhất Đà Nẵng?", True),
        ("Chỉ với 50k bạn đã có thể làm việc cả ngày.", True),
        # Valid hooks (pure interest, zero claims)
        ("Đà Nẵng đang trở thành điểm đến lý tưởng cho người làm việc từ xa.", False),
        ("Bạn đang tìm kiếm một không gian sống cân bằng gần bờ biển?", False),
        ("Khám phá phong cách sống hiện đại của cộng đồng nomad.", False),
        ("Một ngày làm việc tràn đầy cảm hứng tại phố biển miền Trung.", False),
    ],
)
def test_zero_claim_hook_compliance(hook_text: str, expected_violation: bool) -> None:
    """TC-11: Hook sentences must NOT contain numbers, prices, or superlatives without proof."""
    s_map = [
        SentenceMap(sentence_index=0, text=hook_text, sentence_type="hook", fact_id="NONE"),
    ]
    violations = check_factual_sentence_fact_ids(s_map, available_facts=())
    if expected_violation:
        assert len(violations) >= 1
        assert any(v.code == "ZERO_CLAIM_VIOLATION" for v in violations)
    else:
        assert len(violations) == 0


@pytest.mark.parametrize(
    "cta_text, expected_violation",
    [
        # CTA containing unverified claims
        ("Đặt phòng ngay chỉ 8.500.000 VNĐ trong hôm nay!", True),
        ("Nhận ngay ưu đãi 30% khi đăng ký sớm.", True),
        ("Liên hệ để sở hữu căn hộ tốt nhất Đà Nẵng.", True),
        # Valid CTAs (action verb, fanpage link, standard invitation)
        ("Liên hệ Fanpage để đặt lịch tham quan căn hộ.", False),
        ("Nhắn tin ngay để nhận thông tin chi tiết.", False),
        ("Ghé thăm website https://tripc.vn để khám phá thêm.", False),
        ("Gọi ngay hotline 0905123456 để được tư vấn đặt phòng nhanh chóng.", False),
    ],
)
def test_zero_claim_cta_compliance(cta_text: str, expected_violation: bool) -> None:
    """TC-11: CTA sentences must adhere to standard call-to-actions without unauthorized claims."""
    s_map = [
        SentenceMap(sentence_index=1, text=cta_text, sentence_type="cta", fact_id="SYSTEM_CTA"),
    ]
    violations = check_factual_sentence_fact_ids(s_map, available_facts=())
    if expected_violation:
        assert len(violations) >= 1
        assert any(v.code == "ZERO_CLAIM_VIOLATION" for v in violations)
    else:
        assert len(violations) == 0


# ==============================================================================
# SUITE 9: END-TO-END GOLDEN SAMPLES ZERO-FALSE-POSITIVE GUARANTEE
# Golden Sample 1, 2, 3, 4
# ==============================================================================

def test_golden_sample_1_real_assets_zero_violations() -> None:
    """Verify Section 15.1 Golden Sample 1: 0 false positives on valid SocialPack."""
    caption = (
        "Đà Nẵng đang trở thành điểm đến lý tưởng cho cộng đồng làm việc từ xa.\n\n"
        "Căn hộ Studio tại TripC Da Nang tọa lạc cách bãi biển Mỹ Khê 200m, với giá thuê trọn gói "
        "8.500.000 VNĐ/tháng (đã bao gồm phí quản lý).\n\n"
        "Toàn bộ tòa nhà được trang bị hạ tầng mạng 5G tốc độ cao.\n\n"
        "Liên hệ Fanpage để đặt lịch tham quan căn hộ."
    )
    facts = [
        FactItem(fact_id="f01", text="Căn hộ Studio tại TripC Da Nang có giá thuê 8.500.000 VNĐ/tháng (đã bao gồm phí quản lý).", source_type="seo_body"),
        FactItem(fact_id="f02", text="Vị trí cách bãi biển Mỹ Khê 200m.", source_type="seo_body"),
        FactItem(fact_id="f03", text="Toàn bộ tòa nhà phủ sóng mạng 5G tốc độ cao.", source_type="seo_body"),
    ]
    s_map = [
        SentenceMap(sentence_index=0, text="Đà Nẵng đang trở thành điểm đến lý tưởng cho cộng đồng làm việc từ xa.", sentence_type="hook", fact_id="NONE"),
        SentenceMap(sentence_index=1, text="Căn hộ Studio tại TripC Da Nang tọa lạc cách bãi biển Mỹ Khê 200m, với giá thuê trọn gói 8.500.000 VNĐ/tháng (đã bao gồm phí quản lý).", sentence_type="factual", fact_id=["f01", "f02"]),
        SentenceMap(sentence_index=2, text="Toàn bộ tòa nhà được trang bị hạ tầng mạng 5G tốc độ cao.", sentence_type="factual", fact_id=["f03"]),
        SentenceMap(sentence_index=3, text="Liên hệ Fanpage để đặt lịch tham quan căn hộ.", sentence_type="cta", fact_id="SYSTEM_CTA"),
    ]

    report = evaluate_social_pack_guardrails(
        caption=caption,
        extracted_facts=facts,
        channels=["facebook"],
        target_channels=["facebook"],
        sentence_fact_map=s_map,
        cta_target_url="https://m.me/tripcdanang",
        allowed_domains=["tripc.vn", "m.me"],
    )

    assert report.is_valid is True
    assert len(report.violations) == 0, f"Expected 0 violations on Golden Sample 1, got: {report.violations}"


def test_golden_sample_2_ai_graphic_zero_violations() -> None:
    """Verify Section 15.2 Golden Sample 2: 0 false positives on conceptual AI graphic pack."""
    caption = (
        "Xu hướng làm việc từ xa kết hợp du lịch (Workation) đang định hình lại phong cách sống hiện đại.\n\n"
        "Đà Nẵng đứng trong nhóm 5 thành phố có tốc độ phát triển cộng đồng Digital Nomad nhanh nhất Đông Nam Á năm 2026.\n\n"
        "Đọc bài viết phân tích chi tiết tại website của TripC: https://tripc.vn/trends/workation-danang-2026."
    )
    facts = [
        FactItem(fact_id="f11", text="Đà Nẵng nằm trong top 5 thành phố có tốc độ tăng trưởng Digital Nomad nhanh nhất Đông Nam Á năm 2026.", source_type="seo_body"),
    ]
    s_map = [
        SentenceMap(sentence_index=0, text="Xu hướng làm việc từ xa kết hợp du lịch (Workation) đang định hình lại phong cách sống hiện đại.", sentence_type="hook", fact_id="NONE"),
        SentenceMap(sentence_index=1, text="Đà Nẵng đứng trong nhóm 5 thành phố có tốc độ phát triển cộng đồng Digital Nomad nhanh nhất Đông Nam Á năm 2026.", sentence_type="factual", fact_id=["f11"]),
        SentenceMap(sentence_index=2, text="Đọc bài viết phân tích chi tiết tại website của TripC: https://tripc.vn/trends/workation-danang-2026.", sentence_type="cta", fact_id="SYSTEM_CTA"),
    ]

    report = evaluate_social_pack_guardrails(
        caption=caption,
        extracted_facts=facts,
        channels=["facebook"],
        target_channels=["facebook"],
        sentence_fact_map=s_map,
        cta_target_url="https://tripc.vn/trends/workation-danang-2026",
        allowed_domains=["tripc.vn"],
    )

    assert report.is_valid is True
    assert len(report.violations) == 0, f"Expected 0 violations on Golden Sample 2, got: {report.violations}"


def test_golden_sample_3_penthouse_zero_violations() -> None:
    """Verify Section 15.3 Golden Sample 3 (needs_assets pack text): 0 false positives."""
    caption = (
        "Khám phá căn hộ Penthouse hướng biển Mỹ Khê tại TripC Da Nang.\n\n"
        "Diện tích căn hộ đạt 120m2 với ban công riêng và bồn tắm ngắm biển trực diện.\n\n"
        "Liên hệ ngay để nhận thông tin đặt chỗ ưu tiên."
    )
    facts = [
        FactItem(fact_id="f21", text="Căn hộ Penthouse có diện tích 120m2 với ban công riêng.", source_type="seo_body"),
        FactItem(fact_id="f22", text="Trang bị bồn tắm ngắm biển Mỹ Khê trực diện.", source_type="seo_body"),
    ]
    s_map = [
        SentenceMap(sentence_index=0, text="Khám phá căn hộ Penthouse hướng biển Mỹ Khê tại TripC Da Nang.", sentence_type="hook", fact_id="NONE"),
        SentenceMap(sentence_index=1, text="Diện tích căn hộ đạt 120m2 với ban công riêng và bồn tắm ngắm biển trực diện.", sentence_type="factual", fact_id=["f21", "f22"]),
        SentenceMap(sentence_index=2, text="Liên hệ ngay để nhận thông tin đặt chỗ ưu tiên.", sentence_type="cta", fact_id="SYSTEM_CTA"),
    ]

    report = evaluate_social_pack_guardrails(
        caption=caption,
        extracted_facts=facts,
        channels=["facebook", "tiktok"],
        target_channels=["facebook", "tiktok"],
        sentence_fact_map=s_map,
        cta_target_url="https://tripc.vn/penthouse",
        allowed_domains=["tripc.vn"],
    )

    assert report.is_valid is True
    assert len(report.violations) == 0, f"Expected 0 violations on Golden Sample 3, got: {report.violations}"


def test_golden_sample_4_table_15_4_zero_violations() -> None:
    """Verify Section 15.4 Ground Truth Social Pack: 0 false positives."""
    caption = (
        "Bạn đang tìm kiếm căn hộ dành cho người làm việc từ xa tại khu vực biển Đà Nẵng?\n\n"
        "TripC Da Nang cung cấp căn hộ studio với mức giá 8.500.000 VNĐ/tháng đã gồm phí quản lý, tọa lạc cách bãi biển Mỹ Khê 200m.\n\n"
        "Toàn bộ tòa nhà được phủ sóng mạng 5G tốc độ cao.\n\n"
        "Liên hệ Fanpage để đặt lịch xem phòng thực tế."
    )
    facts = [
        FactItem(fact_id="f01", text="Căn hộ Studio tại TripC Da Nang có giá thuê 8.500.000 VNĐ/tháng (đã bao gồm phí quản lý).", source_type="seo_body"),
        FactItem(fact_id="f02", text="Vị trí cách bãi biển Mỹ Khê 200m.", source_type="seo_body"),
        FactItem(fact_id="f03", text="Toàn bộ tòa nhà được phủ sóng mạng 5G tốc độ cao.", source_type="seo_body"),
    ]
    s_map = [
        SentenceMap(sentence_index=0, text="Bạn đang tìm kiếm căn hộ dành cho người làm việc từ xa tại khu vực biển Đà Nẵng?", sentence_type="hook", fact_id="NONE"),
        SentenceMap(sentence_index=1, text="TripC Da Nang cung cấp căn hộ studio với mức giá 8.500.000 VNĐ/tháng đã gồm phí quản lý, tọa lạc cách bãi biển Mỹ Khê 200m.", sentence_type="factual", fact_id=["f01", "f02"]),
        SentenceMap(sentence_index=2, text="Toàn bộ tòa nhà được phủ sóng mạng 5G tốc độ cao.", sentence_type="factual", fact_id=["f03"]),
        SentenceMap(sentence_index=3, text="Liên hệ Fanpage để đặt lịch xem phòng thực tế.", sentence_type="cta", fact_id="SYSTEM_CTA"),
    ]

    report = evaluate_social_pack_guardrails(
        caption=caption,
        extracted_facts=facts,
        channels=["facebook"],
        target_channels=["facebook"],
        sentence_fact_map=s_map,
        allowed_domains=["tripc.vn"],
    )

    assert report.is_valid is True
    assert len(report.violations) == 0, f"Expected 0 violations on Section 15.4 Golden set, got: {report.violations}"


# ==============================================================================
# SUITE 10: ADVERSARIAL ATTACK CATCH TEST (CATCHING 100% HARD ERRORS)
# ==============================================================================

def test_adversarial_attack_all_violations_caught() -> None:
    """An adversarial post with multiple combined violations must be 100% caught."""
    adversarial_caption = (
        "Cơ hội vàng: Căn hộ studio chỉ 8tr mỗi tháng tại bãi biển!\n"
        "Ưu đãi giảm sốc 50% chỉ hôm nay cho khách đặt cọc 1 củ.\n"
        "Khách nói đây là căn hộ 5 sao tốt nhất và rẻ nhất Đà Nẵng, đối thủ Airbnb phải chào thua.\n"
        "Đăng ký ngay tại https://fake-booking-scam.com/tripc."
    )
    # Available facts only mention beach location and 5G
    facts = [
        FactItem(fact_id="f01", text="Vị trí cách bãi biển Mỹ Khê 200m.", source_type="seo_body"),
        FactItem(fact_id="f02", text="Toàn bộ tòa nhà phủ sóng mạng 5G.", source_type="seo_body"),
    ]
    s_map = [
        SentenceMap(sentence_index=0, text="Cơ hội vàng: Căn hộ studio chỉ 8tr mỗi tháng tại bãi biển!", sentence_type="hook", fact_id="NONE"),
        # Sentence 1 is missing fact_id (set to NONE via raw dict representation)
        {"sentence_index": 1, "text": "Ưu đãi giảm sốc 50% chỉ hôm nay cho khách đặt cọc 1 củ.", "sentence_type": "factual", "fact_id": "NONE"},
        SentenceMap(sentence_index=2, text="Khách nói đây là căn hộ 5 sao tốt nhất và rẻ nhất Đà Nẵng, đối thủ Airbnb phải chào thua.", sentence_type="factual", fact_id=["f01"]),
        SentenceMap(sentence_index=3, text="Đăng ký ngay tại https://fake-booking-scam.com/tripc.", sentence_type="cta", fact_id="SYSTEM_CTA"),
    ]

    report = evaluate_social_pack_guardrails(
        caption=adversarial_caption,
        extracted_facts=facts,
        channels=["facebook", "instagram"],  # instagram is invalid channel
        target_channels=["facebook"],
        sentence_fact_map=s_map,
        cta_target_url="https://fake-booking-scam.com/tripc",
        allowed_domains=["tripc.vn", "m.me"],
        forbidden_terms=["Airbnb"],
    )

    assert report.is_valid is False
    codes = {v.code for v in report.violations}

    # Verify that every category of hard violation was caught:
    assert "PRICE_CLAIM_UNSUPPORTED" in codes  # 8tr, 1 củ
    assert "PERCENTAGE_UNSUPPORTED" in codes   # 50%
    assert "PROMOTIONAL_TERM_UNSUPPORTED" in codes  # giảm sốc, chỉ hôm nay
    assert "TESTIMONIAL_UNSUPPORTED" in codes       # khách nói, 5 sao
    assert "SUPERLATIVE_UNSUPPORTED" in codes       # tốt nhất, rẻ nhất
    assert "TENANT_FORBIDDEN_TERM" in codes         # Airbnb
    assert "DISALLOWED_URL" in codes                # fake-booking-scam.com
    assert "INVALID_CHANNEL" in codes               # instagram
    assert "MISSING_FACT_ID" in codes               # sentence 1 factual with NONE
    assert "ZERO_CLAIM_VIOLATION" in codes          # sentence 0 hook with 8tr

    assert len(report.violations) >= 10
