# SEO Worker — testcase chi tiết

Suite tập trung vào pipeline `seo.local_draft`, từ kiểm tra artifact Research,
chọn nguồn và dựng prompt đến kiểm tra nội dung, citation và trạng thái chờ
duyệt. Các kỹ thuật EP, BVA, Decision Table và State Transition được kết hợp
trong từng luồng phù hợp; không chia file theo từng kỹ thuật.

Test chạy qua API nội bộ AI service. Artifact Research được tạo từ request
tổng hợp bằng code thực; provider chỉ giả lập phản hồi model. Vì vậy không
cần model thật, Internet hay database ngoài.

## Danh sách 36 testcase

| # | Pytest case / ID | Kỹ thuật và điều kiện kiểm thử | Kết quả mong đợi |
|---|---|---|---|
| 1 | `test_valid_article_is_grounded_versioned_and_requires_review` | EP: finding Research hợp lệ. Decision Table: nguồn, quote, CTA, title/meta, headings, citations. State Transition: run được hoàn tất thành bản nháp chờ review. | Artifact versioned, citation nguyên văn, metadata/checklist có mặt; không publish; bài dưới ngưỡng được đánh dấu `article_too_short`. |
| 2–7 | `ep-foreign-tenant`, `decision-wrong-upstream-role`, `decision-stale-snapshot`, `decision-tampered-artifact`, `bva-artifact-version`, `decision-revoked-evidence` | EP + Decision Table về tenant, role research, snapshot, content hash, version và trạng thái nguồn đã bị revoke. | API từ chối trước khi provider chạy với lỗi tương ứng. |
| 8–11 | `bva-first-index`, `bva-index-one-past-end`, `bva-schema-maximum-no-finding`, `bva-index-above-schema-maximum` | BVA `finding_index` tại 0, một phần tử ngoài danh sách, giá trị schema tối đa 2 nhưng không có finding, và vượt trần 2. | Chỉ index trỏ đến finding hiện có được draft; các trường hợp còn lại bị từ chối hoặc `MISSING_RESEARCH`. |
| 12–15 | `bva-empty-cta`, `bva-minimum-cta`, `bva-maximum-cta`, `bva-cta-over-maximum` | BVA CTA theo schema từ 1 đến 200 ký tự. | 0 và 201 ký tự bị từ chối; 1 và 200 ký tự được tiếp nhận. |
| 16 | `test_provider_receives_primary_passage_and_only_relevant_safe_related_evidence` | EP / Decision Table: excerpt liên quan được chọn, excerpt không liên quan, có giá và metadata keyword bị loại. | Prompt bắt đầu bằng nguồn Research đã chọn; chỉ excerpt liên quan và an toàn được trích dẫn. |
| 17 | `test_related_evidence_count_is_bounded_and_primary_citation_is_first` | BVA giới hạn 3 excerpt bổ sung; kiểm tra excerpt chính luôn đứng đầu. | Có tối đa 4 citation gồm nguồn chính và 3 nguồn liên quan. |
| 18–19 | `ep-short-metadata`, `bva-long-title-and-meta` | EP metadata ngắn và BVA metadata đầu vào dài hơn giới hạn hiển thị. | Title/meta được chuẩn hóa và rút gọn trong giới hạn lần lượt 70/160 ký tự. |
| 20–21 | `ep-markdown-heading-normalization`, `decision-insufficient-usable-headings` | EP heading có/không có dấu `#`; bảng quyết định yêu cầu ít nhất 2 heading sử dụng được. | Code tự render Markdown headings; thiếu heading hợp lệ làm run thất bại với `SEO_CHECK_FAILED`. |
| 22–25 | `bva-section-count-below-minimum`, `bva-section-count-above-maximum`, `bva-empty-title`, `bva-heading-over-schema-limit` | BVA schema model: 2–5 sections, title không rỗng, heading tối đa 90 ký tự. | Output sai schema được thử sửa theo contract; nếu không hợp lệ, run thất bại thay vì tạo article. |
| 26 | `test_unsupported_sentences_are_removed_but_grounded_sentences_remain` | Decision Table phân biệt câu được nguồn hỗ trợ và câu tự thêm tiện ích/offer. | Câu không có căn cứ bị loại; câu có căn cứ vẫn còn, warning đếm câu bị bỏ. |
| 27–28 | `decision-unsupported-number-fails-closed`, `decision-unsupported-price-fails-closed` | State Transition: phát hiện số/giá không có căn cứ → yêu cầu rewrite một lần → vẫn sai thì fail closed. | Run kết thúc bằng `UNSUPPORTED_CONTENT_CLAIM`, không trả nội dung chứa claim sai. |
| 29 | `test_search_location_is_canonicalized_and_listing_artifacts_removed` | EP biến thể tên địa điểm; bảng quyết định về chuẩn hóa location và loại số thứ tự/ngày cập nhật khỏi copy. | Tên được sửa theo business profile; listing number và update stamp không có trong bài. |
| 30 | `test_research_blocking_facts_control_article_handoff` | Decision Table missing facts: note coverage/stale/partial không blocking so với `confirmed_offer` blocking. | Article đủ dài được chuyển sang `draft` khi chỉ có note không blocking; missing fact blocking giữ `insufficient_data`. |
| 31–32 | `bva-149-words`, `bva-150-words` | BVA ngay dưới và tại ngưỡng public article 150 từ. Nội dung chỉ dùng câu khớp nguồn. | 149 từ có `article_too_short`; 150 từ không có missing fact này. |
| 33–34 | `known-audit-alias`, `known-refresh-alias` | State Transition kiểm tra hiện trạng routing của `seo.audit` và `content.refresh`. | Hiện cả hai operation vẫn chạy SEO article handler; đây là gap được ghi nhận, không khẳng định audit/refresh đã hoạt động đúng chức năng. |
| 35 | `test_empty_research_artifact_is_rejected_without_provider_call` | EP finding rỗng. State Transition: thiếu Research → lỗi trước bước draft. | Run thất bại `MISSING_RESEARCH`, provider không được gọi. |
| 36 | `test_article_generation_is_deterministic_for_same_job_and_input` | State Transition retry cùng job/input version. | Trả lại kết quả đã lưu, không gọi model thêm. |

Mã kiểm thử nằm tại
[`test_seo_worker.py`](tests/test_seo_worker.py); fixture API độc lập tại
[`conftest.py`](conftest.py).

## Gap đã biết — chưa tính là chức năng đạt

`services/ai/tests/test_acceptance_seo.py` có các acceptance test `xfail(strict)`
cho những yêu cầu chưa được triển khai hoặc chưa đạt:

- SEO-1: title/meta hiện chỉ check có giá trị, chưa xác minh keyword và độ dài
  SEO hữu ích.
- SEO-2: citation mới được liệt kê cuối bài, chưa gắn nguồn riêng theo từng
  section.
- SEO-3: kiểm tra lexical có thể bỏ sót câu phủ định đảo nghĩa nguồn.
- SEO-4: `seo.audit` hiện đang route qua handler viết article, chưa audit trang.
- SEO-5: `content.refresh` hiện chưa phân tích metrics trước khi viết lại.
- SEO-7: kiểm tra khuyến mãi, testimonial và giá viết bằng chữ chưa đầy đủ
  cho article.

Các gap này được giữ rõ trong regression acceptance tests thay vì biến thành
test pass giả định hành vi chưa có. Không thể liệt kê mọi input vô hạn; suite
bao phủ nhánh nghiệp vụ, lớp tương đương, ngưỡng, điều kiện quyết định và
chuyển trạng thái quan trọng đã xác định trong implementation.
