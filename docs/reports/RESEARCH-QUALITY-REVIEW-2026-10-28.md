# Review Research ngày 28/10/2026

Phạm vi: review kỹ thuật và ngữ nghĩa bởi coding agent; không thay chữ ký business
owner/QA. Kết luận: code và bộ lọc đã bổ sung; dữ liệu local hiện chưa đủ để nghiệm
thu chất lượng Research. GSC live được hoãn theo yêu cầu người dùng.

## Review findings đã lưu

Đối chiếu profile TripC, quote và metadata trong evidence lịch sử; không khẳng định
đã fetch lại toàn bộ các trang ở lượt review này.

| Finding | Đánh giá | Việc xử lý |
| --- | --- | --- |
| Quiet areas with minimal coworking — research-real 26/10 | **NEEDS_CHANGES**. Quote hỗ trợ môi trường yên tĩnh; ít coworking là trade-off, không phải nhu cầu đã chứng minh | Đổi trọng tâm thành lựa chọn khu vực yên tĩnh; giữ ít coworking là hạn chế. Prompt v7 bổ sung quy tắc này |
| Flexible workspace — autopilot-chain 26/10 | Quote hỗ trợ chọn nơi làm theo công việc; audience/offer fit có cơ sở từ profile nhưng vẫn là giả thuyết. “Schedules” rộng hơn câu trích | Thu hẹp need vào công việc trong ngày; chưa gọi là nhu cầu đo được |
| Coworking — learning-loop 26/10 | Cùng quote/chủ đề flexible workspace đã dùng; có nguy cơ đề xuất lại nội dung dưới tên chung hơn | Worker nay truyền inventory và evidence quotes; code lọc quote đã dùng |
| Housing around weather — learning-loop 26/10 | **NEEDS_CHANGES**. Quote nói thời tiết và timing, chưa nói tìm nhà; rationale gần như lặp quote | Cần đoạn nguồn trực tiếp hỗ trợ quyết định nhà ở. Bộ lọc topic không cho keywords khác cứu một topic không có trong quote |

Nguồn: [research-real](../../qa/evidence/research-real-2026-10-26/research-real-pipeline.json),
[autopilot-chain](../../qa/evidence/growth-lead-real-2026-10-26/autopilot-chain.json),
[learning-loop](../../qa/evidence/learning-loop-real-2026-10-26/learning-loop.json).
Không sửa hoặc cấp approval mới cho các artifact lịch sử.

## Chạy model thật trên snapshot local

Model: `ollama/qwen3:4b-instruct`; prompt `research-v7`; snapshot backend
`02f84922-eb5d-4830-92de-e294e73d7508`; input không dùng example.org.
Nguồn hiện tại chỉ có một chunk metadata trang chủ TripC, chưa có nội dung bài
chuyên sâu như corpus ngày 26/10. Inventory đầu vào gồm 100 bài trong workspace.

| Focus | Kết quả | Replay |
| --- | --- | --- |
| Housing | 0 finding, `insufficient_data`; model trả danh sách rỗng | Giữ nguyên output, không gọi model thêm |
| Coworking | 0 finding, `insufficient_data`; model trả danh sách rỗng | Giữ nguyên output, không gọi model thêm |
| Food | 0 finding, `INCOMPLETE_BRIEF_DROPPED`; câu giải thích không hoàn chỉnh | Giữ nguyên output, không gọi model thêm |

Đây là kết quả không đạt nghiệm thu nội dung, được giữ nguyên để chẩn đoán. Không
đổi verdict thành PASS hoặc dùng output giả. Sau lượt chạy này bổ sung thêm bộ lọc
audience/user-need và dedup quote; không khẳng định đã chạy lại model thật cho mọi
thay đổi cuối cùng. Contract và regression tests kiểm tra phiên bản cuối.

Evidence: [run-summary](../../qa/evidence/research-quality-2026-10-28/run-summary.json),
[housing](../../qa/evidence/research-quality-2026-10-28/housing.json),
[coworking](../../qa/evidence/research-quality-2026-10-28/coworking.json),
[food](../../qa/evidence/research-quality-2026-10-28/food.json).

## Đã sửa và phần dữ liệu cần bổ sung sau

- Chốt rubric; tách source facts / hypotheses / missing data; không tự xác nhận semantic acceptance.
- Bổ sung lọc topic/offer/audience/user-need và nhận định tăng trưởng không có căn cứ.
- Nối inventory và quote đã dùng từ worker; kiểm tra replay/hash/tenant/version, nguồn bị thu hồi, nguồn cũ, source gap.
- Nối code GSC query → artifact có hash → worker → Research. Chưa có credential/property live; không có số liệu query thật ở lượt này.
- Áp dụng migration Research `013` vào DB local để worker có bảng `trend_signals`.
- Cần ingest và owner duyệt thêm bài nguồn chuyên sâu; sau đó chạy lại model thật và review từng finding theo rubric.

Xem [rubric và cách chạy lại](RESEARCH-QUALITY-RUBRIC.md).
