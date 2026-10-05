# EP-M05 — Opportunity Engine

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Quang Quang (AI)**. Reviewers: **Dương, Thiệu Quang, Mỹ, Thanh**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thanh** cung cấp QA evidence.
- Contributors: Quang Quang, Thiệu Quang, Mỹ, Tiến, Huyền, Dương, Trường, Thanh; vai trò: AI, BE, FE, BA, UI/UX, Tester 1, Tester 2. Thanh làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 2; ngày bắt đầu: 6; hạn mục tiêu: ngày 7 tính từ kickoff, chưa là ngày lịch.
- Milestones: Board/score cùng research ngày 6–7; lineage kiểm tra ngày 10.
- Effort: chưa estimate; owner cung cấp vào W1-PM-02, PM kiểm tra capacity từng vị trí.
- Tasks liên quan: W2-BA-01, W2-AI-01, W2-BE-01, W2-FE-01, W2-QA2-01; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: EP-FOUNDATION, EP-M03, EP-M04. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: EP-M06, EP-M07. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: services/ai/, apps/api/, apps/web/, database/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- Opportunity board/detail/filter và keyword/topic/intent
- Rubric/components/rationale/evidence/missing flags và priority

## Acceptance criteria

- [ ] EP-M05-AC-01: Score tính lại khớp rubric đã công khai và ghi rubric version/components.
- [ ] EP-M05-AC-02: Opportunity có goal/research/source links, filter/select hoạt động và dữ liệu lưu thật.
- [ ] EP-M05-AC-03: Chọn sang strategy/brief giữ opportunity ID và nguồn.
- [ ] EP-M05-AC-04: Heuristic score không gắn nhãn search volume thật, trường thiếu metric hiện missing.

## Ngoài phạm vi epic

- Search-volume database hoặc rank tracker riêng

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
