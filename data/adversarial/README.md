# DỮ LIỆU ĐỐI KHÁNG TỰ ĐỘNG (SYNTHETIC ADVERSARIAL TEST SUITE)

> **Hạng mục:** CM-21 | **Phiên bản:** v2.0 | **Tổng số ca:** 350 ca

## 1. Cấu trúc thư mục
- `adversarial_all.jsonl`: Toàn bộ 350 ca đối kháng bao phủ 14 nhóm tấn công.
- `adversarial_tune.jsonl`: 280 ca (80%) dùng cho quá trình phân tích lỗi và tinh chỉnh (Tune) agent.
- `adversarial_heldout.jsonl`: 70 ca (20%) được giữ bí mật độc lập, **TUYỆT ĐỐI CẤM** dùng khi tune prompt hoặc làm few-shot exemplars.
- `adversarial_manifest.json`: Thống kê chi tiết, mã băm SHA-256 xác định tính toàn vẹn.

## 2. Danh mục 14 nhóm tấn công
1. `fake_price_vn`: Chèn giá biến thể tiếng Việt (8tr, 8.5 triệu, 50k, 5.000.000đ, 1 củ, $200, nửa giá...)
2. `fake_discount_percent`: % giảm giá ảo (giảm 50%, sale 30%, discount 70%...)
3. `hidden_promotions`: Ưu đãi ngầm (tặng 1 đêm, free bữa sáng, combo tri ân...)
4. `fabricated_statistics`: Số liệu thống kê bịa (99% hài lòng, tăng 300% hiệu suất...)
5. `fake_testimonials`: Testimonial khách ảo hoặc giải thưởng bịa đặt
6. `superlatives_absolutes`: Từ ngữ tuyệt đối, so sánh nhất (tốt nhất, rẻ nhất, số 1, 100%...)
7. `indirect_prompt_injection`: Lồng chỉ thị độc hại trong bài SEO nhằm ép hạ giá/đổi lệnh
8. `outdated_information`: Thông tin sự kiện quá hạn, mâu thuẫn thời gian theo mùa
9. `insufficient_facts`: Bài SEO thiếu facts (< 3 facts hợp lệ) -> `insufficient_data`
10. `missing_real_assets`: Bài mô tả căn hộ thật nhưng thiếu ảnh thật approved -> `needs_assets`
11. `version_or_hash_mismatch`: Lệch số version hoặc lệch content_hash SHA-256
12. `wrong_tenant`: Truy cập sai workspace_id, dùng trộm tài nguyên ngoại lai (TenantGuard 403)
13. `unselected_channel`: Kênh không được chọn, kênh chưa kích hoạt, kênh sai chính tả
14. `violating_ai_image`: Ảnh AI vi phạm (lỗi chữ OCR, có số giá, có logo, mặt người thật)
