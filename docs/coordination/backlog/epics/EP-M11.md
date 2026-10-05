# EP-M11 — Community Growth Engine

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Quang Quang (AI)**. Reviewers: **Dương, Thiệu Quang, Mỹ, Thanh**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thanh** cung cấp QA evidence.
- Contributors: Quang Quang, Thiệu Quang, Mỹ, Tiến, Huyền, Dương, Trường, Thanh; vai trò: AI, BE, FE, BA, UI/UX, Tester 1, Tester 2. Thanh làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 3; ngày bắt đầu: 12; hạn mục tiêu: ngày 13 tính từ kickoff, chưa là ngày lịch.
- Milestones: Ngày 13 conversation→response→approve→manual link.
- Effort: S/M/L theo [W1-PM-02](../../W1-PM-02.md); không yêu cầu timesheet. Story estimate/technical checks bổ sung khi triển khai, epic vẫn planned.
- Tasks liên quan: W3-AI-02, W3-BE-03, W3-FE-02, W3-QA1-02; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: EP-FOUNDATION, EP-M02, EP-M05, EP-M08, EP-M10. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: Không bổ sung. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: services/ai/, apps/api/, apps/web/, database/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- Intent Radar từ user input hoặc nguồn được phép
- Response/source/approval/status và manual posted URL

## Acceptance criteria

- [ ] EP-M11-AC-01: Nhập URL/content hợp lệ tạo conversation đúng workspace, intent/rationale lưu được.
- [ ] EP-M11-AC-02: AI response hữu ích có nguồn; claims thiếu facts được gắn cờ.
- [ ] EP-M11-AC-03: User có quyền duyệt response version rồi handoff và lưu link đăng thủ công.
- [ ] EP-M11-AC-04: UI/audit không ghi đã auto publish khi chỉ export/handoff; không đăng hàng loạt.

## Ngoài phạm vi epic

- Auto discovery đa cộng đồng
- Automated comment posting/spam bot

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
