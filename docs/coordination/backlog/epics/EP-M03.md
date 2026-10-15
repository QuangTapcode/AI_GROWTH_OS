# EP-M03 — Growth Goal Manager

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Mỹ (BE)**. Reviewers: **Dương, Tiến, Huyền, Thiệu, Thiệu Quang**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thiệu** cung cấp QA evidence.
- Contributors: Thiệu Quang, Mỹ, Tiến, Huyền, Quang Quang, Dương, Trường, Thiệu; vai trò: BE, FE, AI, BA, UI/UX, Tester 1, Tester 2. Thiệu làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 1; ngày bắt đầu: 2; hạn mục tiêu: ngày 5 tính từ kickoff, chưa là ngày lịch.
- Milestones: Goal/KPI definition chốt ngày 2; lưu/open goal trước ngày 5.
- Effort: S/M/L theo [W1-PM-02](../../W1-PM-02.md); không yêu cầu timesheet. Story estimate/technical checks bổ sung khi triển khai, epic vẫn planned.
- Tasks liên quan: W1-BA-01, W1-BA-02, W1-FE-02, W1-BE-02, W1-AI-02; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: EP-FOUNDATION, EP-M01. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: EP-M13. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: apps/web/, apps/api/, services/ai/, database/, docs/ba/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- Goal/baseline/KPI/period/audience/conversion/budget/channels
- AI đề xuất objective/KPI chờ xác nhận, action links

## Acceptance criteria

- [ ] EP-M03-AC-01: Goal tạo/sửa/lưu/mở lại giữ đúng fields và có validation/quyền.
- [ ] EP-M03-AC-02: Thiếu baseline không hiện % tăng trưởng; baseline 0 không thực hiện phép chia sai.
- [ ] EP-M03-AC-03: Progress gắn metric đã chọn, phân biệt metric chưa có dữ liệu với zero; chưa có sync thì báo thiếu.
- [ ] EP-M03-AC-04: Objective/KPI do AI đề xuất cần người dùng xác nhận trước áp dụng.

## Ngoài phạm vi epic

- Cam kết traffic/revenue tăng trong pilot

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
