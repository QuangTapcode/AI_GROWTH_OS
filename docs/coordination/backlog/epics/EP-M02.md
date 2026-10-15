# EP-M02 — Business Knowledge Base

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Quang Quang (AI)**. Reviewers: **Thiệu Quang, Mỹ, Dương, Thiệu**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thiệu** cung cấp QA evidence.
- Contributors: Quang Quang, Thiệu Quang, Mỹ, Tiến, Huyền, Trường, Dương, Thiệu; vai trò: AI, BE, FE, UI/UX, BA, Tester 1, Tester 2. Thiệu làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 1; ngày bắt đầu: 2; hạn mục tiêu: ngày 5 tính từ kickoff, chưa là ngày lịch.
- Milestones: Ingestion/source review/RAG tích hợp trước demo ngày 5.
- Effort: S/M/L theo [W1-PM-02](../../W1-PM-02.md); không yêu cầu timesheet. Story estimate/technical checks bổ sung khi triển khai, epic vẫn planned.
- Tasks liên quan: W1-BA-03, W1-FE-02, W1-BE-02, W1-AI-02, W1-QA2-02; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: EP-FOUNDATION, EP-M01. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: Không bổ sung. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: services/ai/, apps/api/, apps/worker/, apps/web/, database/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- Text/PDF có lớp văn bản/URL được phép; source upload/status/review/version/delete
- Extract/chunk/index và tenant-scoped retrieval/citations

## Acceptance criteria

- [ ] EP-M02-AC-01: Nạp nguồn được phép, theo dõi processing/failure, reviewer duyệt source/version trước sử dụng.
- [ ] EP-M02-AC-02: RAG chỉ truy hồi nguồn hợp lệ đúng workspace, citation truy về source/version/chunk được.
- [ ] EP-M02-AC-03: Thiếu facts thì trả thiếu dữ liệu, không bổ sung giá/địa chỉ/thống kê không xác minh.
- [ ] EP-M02-AC-04: Xóa/thu hồi source khiến nguồn không còn vào retrieval/cache; tenant vector filtering được QA2 kiểm chứng.

## Ngoài phạm vi epic

- OCR/media extraction
- Google Docs connector riêng hoặc crawl không giới hạn

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
