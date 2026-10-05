# EP-M14 — AI Growth Analyst

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Quang Quang (AI)**. Reviewers: **Dương, Thiệu Quang, Mỹ, Thanh**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thanh** cung cấp QA evidence.
- Contributors: Quang Quang, Thiệu Quang, Mỹ, Tiến, Huyền, Dương, Trường, Thanh; vai trò: AI, BE, FE, BA, UI/UX, Tester 1, Tester 2. Thanh làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 4; ngày bắt đầu: 16; hạn mục tiêu: ngày 16 tính từ kickoff, chưa là ngày lịch.
- Milestones: Ngày 16 integrated report; UAT ngày 19.
- Effort: chưa estimate; owner cung cấp vào W1-PM-02, PM kiểm tra capacity từng vị trí.
- Tasks liên quan: W4-AI-01, W4-BE-01, W4-FE-01, W4-QA1-01, W4-QA2-01; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: EP-FOUNDATION, EP-M03, EP-M06, EP-M13. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: Không bổ sung. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: services/ai/, apps/api/, apps/web/, database/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- On-demand Growth Brief hai kỳ/metric/source/evidence
- Recommended actions cần duyệt trước tạo task

## Acceptance criteria

- [ ] EP-M14-AC-01: Số và % trong report khớp snapshot input, số học tính xác định trước diễn đạt.
- [ ] EP-M14-AC-02: Baseline zero/missing không chia sai hoặc kết luận growth giả; không đủ dữ liệu thì nói rõ.
- [ ] EP-M14-AC-03: Nhận xét truy về source/metric/content và nêu giới hạn, không khẳng định nhân quả thiếu bằng chứng.
- [ ] EP-M14-AC-04: User duyệt action mới tạo task liên kết goal/strategy, retry approval không tạo trùng.

## Ngoài phạm vi epic

- Daily scheduled growth jobs
- Cam kết outcome tăng trưởng

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
