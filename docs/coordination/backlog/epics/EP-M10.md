# EP-M10 — Distribution Engine

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Mỹ (BE)**. Reviewers: **Dương, Tiến, Huyền, Thanh, Thiệu Quang**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thanh** cung cấp QA evidence.
- Contributors: Thiệu Quang, Mỹ, Tiến, Huyền, Quang Quang, Dương, Trường, Thanh; vai trò: BE, FE, AI, BA, UI/UX, Tester 1, Tester 2. Thanh làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 3; ngày bắt đầu: 11; hạn mục tiêu: ngày 12 tính từ kickoff, chưa là ngày lịch.
- Milestones: Ngày 11 approval; ngày 12 CMS publish thật; regression ngày 15.
- Effort: chưa estimate; owner cung cấp vào W1-PM-02, PM kiểm tra capacity từng vị trí.
- Tasks liên quan: W3-BE-02, W3-FE-01, W3-AI-02, W3-QA1-01, W3-QA2-01; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: EP-FOUNDATION, EP-M08, EP-M09. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: EP-M12. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: apps/api/, apps/worker/, apps/web/, database/, services/ai/, apps/pilot/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- Approval/reject/resubmit gắn content version/hash
- Calendar/schedule và CMS Next.js tối giản, URL/status/errors/idempotent retry

## Acceptance criteria

- [ ] EP-M10-AC-01: Chỉ approved version được publish; BE kiểm tra lại quyền/source/approval lúc execution.
- [ ] EP-M10-AC-02: Edit sau duyệt hủy hiệu lực approval và xử lý job lịch cũ; reject/edit/resubmit chạy đúng.
- [ ] EP-M10-AC-03: Publish thật có URL; retry/timeout/restart không đăng trùng, unknown outcome có reconciliation.
- [ ] EP-M10-AC-04: Một timezone pilot, timestamps UTC; social ngoài CMS được ghi draft/export/handoff thủ công.
- [ ] EP-M10-AC-05: Public TripC blog/landing chỉ đọc published content; draft/preview và CMS mutation cần auth. Human approval gắn version/hash trước xuất bản; AI không tự duyệt.

## Ngoài phạm vi epic

- Nhiều CMS
- Autonomous social publishing

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
