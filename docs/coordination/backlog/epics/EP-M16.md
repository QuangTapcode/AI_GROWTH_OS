# EP-M16 — Learning Engine

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Quang Quang (AI)**. Reviewers: **Dương, Thiệu Quang, Mỹ, Thanh**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thanh** cung cấp QA evidence.
- Contributors: Quang Quang, Thiệu Quang, Mỹ, Tiến, Huyền, Dương, Trường, Thanh; vai trò: AI, BE, FE, BA, UI/UX, Tester 1, Tester 2. Thanh làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 4; ngày bắt đầu: 18; hạn mục tiêu: ngày 18 tính từ kickoff, chưa là ngày lịch.
- Milestones: Ngày 18 insight→approve→new strategy version, feature freeze; UAT ngày 19.
- Effort: S/M/L theo [W1-PM-02](../../W1-PM-02.md); không yêu cầu timesheet. Story estimate/technical checks bổ sung khi triển khai, epic vẫn planned.
- Tasks liên quan: W4-AI-02, W4-BE-03, W4-FE-03, W4-QA1-01, W4-QA2-01; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: EP-FOUNDATION, EP-M06, EP-M08, EP-M13, EP-M14, EP-M15. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: Không bổ sung. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: services/ai/, apps/api/, apps/web/, database/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- Content/channel/performance/experiment snapshots + rule-based insight
- Evidence/version review/approve→strategy update/tasks

## Acceptance criteria

- [ ] EP-M16-AC-01: Insight/ranking topic/format truy về content/metric/experiment snapshot và rule version.
- [ ] EP-M16-AC-02: Dữ liệu ít hoặc thiếu outcome hiện chưa đủ, không khẳng định nhân quả hoặc winner giả.
- [ ] EP-M16-AC-03: Chỉ approved insight mới cập nhật strategy thành version mới; stale strategy version trả conflict.
- [ ] EP-M16-AC-04: Insight→approval→strategy/task lineage có audit; không tự huấn luyện model hoặc autonomous update.

## Ngoài phạm vi epic

- Autonomous learning/strategy updates
- Model training hoặc advanced opportunity graph

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
