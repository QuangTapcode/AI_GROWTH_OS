# EP-M13 — Analytics Engine

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Mỹ (BE)**. Reviewers: **Dương, Tiến, Huyền, Thiệu, Thiệu Quang**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thiệu** cung cấp QA evidence.
- Contributors: Thiệu Quang, Mỹ, Tiến, Huyền, Quang Quang, Dương, Trường, Thiệu; vai trò: BE, FE, AI, BA, UI/UX, Tester 1, Tester 2. Thiệu làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 1–3; ngày bắt đầu: 1; hạn mục tiêu: ngày 14 tính từ kickoff, chưa là ngày lịch.
- Milestones: T1 probe/quyền/event; ngày 14 connector/dashboard/metric snapshots; QA ngày 15.
- Effort: S/M/L theo [W1-PM-02](../../W1-PM-02.md); không yêu cầu timesheet. Story estimate/technical checks bổ sung khi triển khai, epic vẫn planned.
- Tasks liên quan: W1-BE-04, W1-FE-03, W3-BE-04, W3-FE-03, W3-AI-03, W3-QA2-02; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: EP-FOUNDATION, EP-M01, EP-M03. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: EP-M12. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: apps/api/, apps/worker/, apps/web/, database/, services/ai/, apps/pilot/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- GA4/GSC limited OAuth/sync, properties/range/timezone và metric API
- Dashboard traffic/click/CTR/conversion, sync/delay/missing và snapshots

## Acceptance criteria

- [ ] EP-M13-AC-01: Connector dùng tài khoản/dữ liệu nguồn thật được cấp quyền, đối chiếu một range/property cụ thể khớp nguồn.
- [ ] EP-M13-AC-02: Metric zero khác missing/partial/delayed, hiển thị sync time/timezone/source provenance.
- [ ] EP-M13-AC-03: Expired/revoked OAuth có state rõ, credentials không trả FE hoặc log.
- [ ] EP-M13-AC-04: Metric snapshots có version/IDs/periods/units làm input M14–M16; không dùng bảng synthetic để nghiệm thu live connector.
- [ ] EP-M13-AC-05: GA4/UTM đối chiếu successful form submission với DB theo contract; không gửi tên/email vào analytics. GSC site mới không có dữ liệu phải hiện empty/delayed theo nguồn, không giả baseline tăng trưởng.

## Ngoài phạm vi epic

- CRM/social analytics suite
- Revenue attribution nâng cao

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
