# Review Research ngày 29/10/2026

Phạm vi: dữ liệu nguồn, lỗi pipeline và chạy lại model thật trên staging local. Review ngữ nghĩa dưới đây do coding agent thực hiện, không thay chữ ký business owner/QA. Tiếp nối [review 28/10](RESEARCH-QUALITY-REVIEW-2026-10-28.md).

## Nguyên nhân `insufficient_data` buổi chiều 29/10

Trong 9 lần chạy, có 1 lần `ready_for_handoff` (trích từ metadata trang chủ), 5 lần `insufficient_data` và 3 lần lỗi:

- DB local đã bị reset sau 25/10 nên context chỉ còn 3 nguồn: Wikipedia, Wikivoyage và một chunk metadata của tripc.vn. Các chủ đề housing, arrival checklist và community events không có đoạn nguồn nào (`source_gap`).
- Fallback luôn gán `offer_fit` bằng sản phẩm đầu tiên (`housing`), bất kể chủ đề.
- Fallback cắt quote tối đa 500 ký tự, trong khi schema chỉ cho 400. Quote dài từ 401 đến 500 ký tự làm cả run lỗi `AI service failed`.
- Chunk metadata (danh sách SEO keywords) được xếp hạng cao nhất vì chứa mọi từ khóa, nên bị trích làm evidence.
- Nhãn `no_eligible_chunks_after_guardrails` vẫn xuất hiện khi còn 117 chunk hợp lệ, làm chẩn đoán sai hướng.

## Đã xử lý

| Hạng mục | Thay đổi |
| --- | --- |
| Nguồn | Nạp 16 URL qua API (14 bài tripc.ai/blog, vietnam.travel, danangfantasticity), worker ingest được 310 chunk. Owner duyệt (cùng URL đã duyệt ngày 25/10) và cấp context mới với 19 nguồn |
| Offer | Fallback chỉ gắn offer khi chủ đề nêu đúng sản phẩm/dịch vụ đã xác nhận. Không khớp thì bỏ qua, ghi `FALLBACK_NO_MATCHING_OFFER` |
| Quote | Giới hạn 400 ký tự theo schema. Draft fallback không hợp lệ ghi `FALLBACK_INVALID_DRAFT` thay vì làm lỗi cả run |
| Metadata | Chunk có danh sách `Keywords:` không được dùng làm evidence (`METADATA_EXCERPT_EXCLUDED`) |
| Câu trích | Trích nguyên câu thay vì cửa sổ cắt giữa câu; ưu tiên câu nhắc tới location của profile |
| Chẩn đoán | Nhãn `no_eligible_chunks_after_guardrails` chỉ xuất hiện khi thật sự không còn chunk |

Kiểm thử: AI 268 passed (thêm 6 regression test), six-role fake eval 30/30.

## Chạy model thật sau khi sửa

Model `ollama/qwen3:4b-instruct`, prompt `research-v8`, context `2eabe68b-d019-4b2e-8214-5af86284af27`. Mỗi lượt xoay discovery sang nhóm chủ đề khác.

| Nhóm chủ đề | Kết quả | Nguồn trích | Đánh giá ngữ nghĩa (agent) |
| --- | --- | --- | --- |
| housing / arrival checklist / local experiences | `ready_for_handoff` · housing | moving-to-vietnam-complete-relocation-guide | **NEEDS_CHANGES**: câu trích là câu dẫn link sang bài khác, chỉ nhắc housing trong danh sách; nên dùng đoạn từ bài apartment-viewing/first-two-weeks |
| transport / community events / local experiences | `ready_for_handoff` · community events | how-to-make-friends-meet-people-vietnam | Đạt dạng giả thuyết. Câu trích quảng bá Soft Landing, dịch vụ chưa có trong profile, nên SEO/Content không được nhắc như dịch vụ đang bán |
| coworking / airport transfer / banking | `ready_for_handoff` · coworking | da-nang-vs-hanoi-vs-ho-chi-minh-city-remote-workers | Đạt dạng giả thuyết: câu trích nói về Đà Nẵng (Wi-Fi tốt, coworking ít hơn hai thành phố lớn) |

Trước khi chạy lượt cuối, một nhóm settling/residency/language exchange trả `insufficient_data`. Đây là kết quả đúng: không chủ đề nào khớp sản phẩm/dịch vụ đã xác nhận.

Evidence: [run-summary](../../qa/evidence/research-quality-2026-10-29/run-summary.json).

## Còn lại

- **Ý tưởng của model vẫn bị loại ở mọi lượt.** Output thô của qwen3:4b cho thấy `audience_fit`/`offer_fit` chỉ là nhãn, không có câu hoàn chỉnh, dù prompt đã yêu cầu. Toàn bộ finding hiện đến từ fallback dạng mẫu. Đề xuất chạy lại bằng `qwen3:8b` (model dùng ngày 26/10, hiện chưa cài) hoặc làm prompt `research-v9`.
- **Soft Landing:** model liên tục đề xuất Soft Landing, và các bài TripC có giới thiệu dịch vụ này. Nếu đây là dịch vụ thật, owner cần thêm vào confirmed services của business profile. Agent không tự thêm.
- **GSC chưa có credential**, `measurement_status` vẫn là `unavailable`. Xem [hướng dẫn kết nối](../integrations/GSC-SETUP.md).
- Semantic acceptance: `pending_review`. Business owner/QA ký theo [rubric](RESEARCH-QUALITY-RUBRIC.md); không tự đổi verdict.
