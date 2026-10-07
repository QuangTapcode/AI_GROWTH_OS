# EP-FOUNDATION — Nền tảng dùng chung và tích hợp

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Thiệu Quang (BE)**. Reviewers: **Tiến, Huyền, Quang Quang, Thiệu, Mỹ**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thiệu** cung cấp QA evidence.
- Contributors: Thiệu Quang, Mỹ, Tiến, Huyền, Quang Quang, Dương, Trường, Thiệu; vai trò: BE, FE, AI, BA, UI/UX, Tester 1, Tester 2. Thiệu làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 1–4; ngày bắt đầu: 1; hạn mục tiêu: ngày 20 tính từ kickoff, chưa là ngày lịch.
- Milestones: Ngày 2: quyết định/contracts/estimates; ngày 5: staging/CI/jobs/tracking; ngày 20: restore/rollback/handover.
- Effort: S/M/L theo [W1-PM-02](../../W1-PM-02.md); không yêu cầu timesheet. Story estimate/technical checks bổ sung khi triển khai, epic vẫn planned.
- Tasks liên quan: W1-BE-01, W1-BE-03, W1-BE-05, W4-BE-04; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: Không. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: Không bổ sung. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: apps/api/, apps/worker/, database/, infra/, contracts/, .github/, docs/runbooks/, apps/pilot/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- Auth/tenant/audit và DB/storage/jobs interfaces dùng chung
- Staging/CI, secret/env strategy, API/job contracts liên ngôn ngữ
- Tracing/quotas/cost logs và bộ quality gates; release runbooks

## Acceptance criteria

- [ ] EP-FOUNDATION-AC-01: FE TypeScript, BE/worker TypeScript và AI Python giao tiếp qua HTTP/JSON theo contract chung; fake/mock modes chạy độc lập sau bootstrap.
- [ ] EP-FOUNDATION-AC-02: Local/staging tách biệt, migration/seed hai tenants có kiểm thử; CI checks chạy theo source và mọi consumer khi contract đổi.
- [ ] EP-FOUNDATION-AC-03: Jobs bền vững có trạng thái/attempt/timeout/retry/cancel/recovery theo contract, không chạy pipeline dài trong request web.
- [ ] EP-FOUNDATION-AC-04: Secrets không xuất vào client/log/evidence; trước release backup/restore/rollback/monitoring có bằng chứng.

## Ngoài phạm vi epic

- Thiệu toán production/billing suite
- Hệ đa agent độc lập, custom LLM hoặc Enterprise infrastructure

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
