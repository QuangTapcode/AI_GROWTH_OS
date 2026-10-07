# EP-M15 — Experiment Engine

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Mỹ (BE)**. Reviewers: **Dương, Tiến, Huyền, Quang Quang, Thiệu, Thiệu Quang**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thiệu** cung cấp QA evidence.
- Contributors: Thiệu Quang, Mỹ, Tiến, Huyền, Quang Quang, Dương, Trường, Thiệu; vai trò: BE, FE, AI, BA, UI/UX, Tester 1, Tester 2. Thiệu làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 4; ngày bắt đầu: 17; hạn mục tiêu: ngày 17 tính từ kickoff, chưa là ngày lịch.
- Milestones: Ngày 17 one-page assignment/exposure/outcome; UAT ngày 19.
- Effort: S/M/L theo [W1-PM-02](../../W1-PM-02.md); không yêu cầu timesheet. Story estimate/technical checks bổ sung khi triển khai, epic vẫn planned.
- Tasks liên quan: W3-FE-03, W4-BE-02, W4-FE-02, W4-AI-02, W4-QA1-02, W4-QA2-01; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: EP-FOUNDATION, EP-M08, EP-M10, EP-M12, EP-M13. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: Không bổ sung. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: apps/api/, apps/web/, database/, services/ai/, apps/pilot/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- Hypothesis/two title hoặc CTA variants/primary metric/period/grouping
- Một website page widget + stable assignment + dedup exposures/outcomes/results

## Acceptance criteria

- [ ] EP-M15-AC-01: Experiment đăng ký được giả thuyết/hai variants/metric/period/method; config lưu thật.
- [ ] EP-M15-AC-02: Một visitor giữ cùng variant theo policy đã chốt; widget dùng visitor-scoped API, không token Owner.
- [ ] EP-M15-AC-03: Events không đếm trùng và truy được assignment→exposure→outcome, result tách variant.
- [ ] EP-M15-AC-04: Mẫu ít hiện chưa đủ bằng chứng, không tự tuyên bố winner hoặc statistically significant.
- [ ] EP-M15-AC-05: Hai title/CTA variants trên một TripC landing page dùng primary metric form thành công; outcome truy được persisted submission và assignment, không coi click CTA hoặc lỗi form là conversion.

## Ngoài phạm vi epic

- Statistical engine nâng cao
- Multi-page experiment platform

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
