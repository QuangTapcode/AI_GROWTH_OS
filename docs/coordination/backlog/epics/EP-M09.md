# EP-M09 — SEO Intelligence Engine

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Quang Quang (AI)**. Reviewers: **Dương, Thiệu Quang, Mỹ, Thanh**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thanh** cung cấp QA evidence.
- Contributors: Quang Quang, Thiệu Quang, Mỹ, Tiến, Huyền, Dương, Trường, Thanh; vai trò: AI, BE, FE, BA, UI/UX, Tester 1, Tester 2. Thanh làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 2–3; ngày bắt đầu: 9; hạn mục tiêu: ngày 15 tính từ kickoff, chưa là ngày lịch.
- Milestones: Ngày 9 title/meta/headings; ngày 11 cluster/link/local; refresh đối chiếu metric ngày 14–15.
- Effort: S/M/L theo [W1-PM-02](../../W1-PM-02.md); không yêu cầu timesheet. Story estimate/technical checks bổ sung khi triển khai, epic vẫn planned.
- Tasks liên quan: W2-AI-03, W3-AI-01, W3-BE-01, W3-FE-01, W3-QA2-02; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: EP-FOUNDATION, EP-M07, EP-M08. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: EP-M13. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: services/ai/, apps/api/, apps/worker/, apps/web/, database/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- Keyword/cluster nhỏ, title/meta/headings audit và suggestions
- Internal/broken links trong tập URL nhỏ, một local template có unique data
- Refresh từ dữ liệu nguồn có sẵn, lưu content version

## Acceptance criteria

- [ ] EP-M09-AC-01: Audit tìm đúng lỗi trong fixtures đã chốt; source/URL limits và rule version được ghi.
- [ ] EP-M09-AC-02: Gợi ý internal links thuộc website pilot; broken links trong allowed set được xác minh.
- [ ] EP-M09-AC-03: Local draft có unique approved facts, không sinh trang gần trùng để publish hàng loạt.
- [ ] EP-M09-AC-04: Refresh dùng metric/context có nguồn và lưu version mới; thiếu metrics thì báo thiếu, không giả decay.

## Ngoài phạm vi epic

- Crawler lớn, rank tracker riêng
- Local page mass publishing

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
