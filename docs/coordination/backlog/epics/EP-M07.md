# EP-M07 — Content Intelligence Engine

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Quang Quang (AI)**. Reviewers: **Dương, Thiệu Quang, Mỹ, Thanh**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thanh** cung cấp QA evidence.
- Contributors: Quang Quang, Thiệu Quang, Mỹ, Tiến, Huyền, Dương, Trường, Thanh; vai trò: AI, BE, FE, BA, UI/UX, Tester 1, Tester 2. Thanh làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 2; ngày bắt đầu: 7; hạn mục tiêu: ngày 8 tính từ kickoff, chưa là ngày lịch.
- Milestones: Brief fields/source/approval ngày 8.
- Effort: S/M/L theo [W1-PM-02](../../W1-PM-02.md); không yêu cầu timesheet. Story estimate/technical checks bổ sung khi triển khai, epic vẫn planned.
- Tasks liên quan: W2-BA-01, W2-AI-02, W2-BE-02, W2-FE-02, W2-QA1-01; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: EP-FOUNDATION, EP-M02, EP-M05, EP-M06. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: Không bổ sung. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: services/ai/, apps/api/, apps/web/, database/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- Brief keyword/intent/audience/angle/unique value/facts/sources
- CTA/destination/format/channel, edit/review/version

## Acceptance criteria

- [ ] EP-M07-AC-01: Brief chuyển từ opportunity giữ IDs, source references và CTA.
- [ ] EP-M07-AC-02: Facts chưa xác minh có flag, thiếu context không tự bịa facts.
- [ ] EP-M07-AC-03: Người dùng sửa và duyệt brief trước generation; BE kiểm tra approved brief version.
- [ ] EP-M07-AC-04: Edit/save/reload và field validation đúng contract/AC.

## Ngoài phạm vi epic

- Generation không có brief được duyệt

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
