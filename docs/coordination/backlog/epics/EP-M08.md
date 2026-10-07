# EP-M08 — AI Content Factory

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Quang Quang (AI)**. Reviewers: **Thiệu Quang, Mỹ, Tiến, Huyền, Dương, Thiệu**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thiệu** cung cấp QA evidence.
- Contributors: Quang Quang, Thiệu Quang, Mỹ, Tiến, Huyền, Dương, Trường, Thiệu; vai trò: AI, BE, FE, BA, UI/UX, Tester 1, Tester 2. Thiệu làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 2; ngày bắt đầu: 8; hạn mục tiêu: ngày 10 tính từ kickoff, chưa là ngày lịch.
- Milestones: Ngày 9 article/editor/variant; ngày 10 integrated draft gate.
- Effort: S/M/L theo [W1-PM-02](../../W1-PM-02.md); không yêu cầu timesheet. Story estimate/technical checks bổ sung khi triển khai, epic vẫn planned.
- Tasks liên quan: W2-AI-03, W2-BE-02, W2-BE-03, W2-FE-03, W2-QA1-02, W2-QA2-02; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: EP-FOUNDATION, EP-M02, EP-M07. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: EP-M10. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: services/ai/, apps/api/, apps/worker/, apps/web/, database/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- SEO article/FAQ/meta/social draft và một variant từ source
- Editor/save/version/history/restore/regenerate và async status

## Acceptance criteria

- [ ] EP-M08-AC-01: Generation dùng approved brief/context/sources, schema hợp lệ và content có citations/CTA/brand checks.
- [ ] EP-M08-AC-02: Người dùng sinh/sửa/lưu/mở lại/khôi phục draft, restore tạo version mới; concurrent edits trả conflict.
- [ ] EP-M08-AC-03: Variant giữ source-content version/lineage; lỗi provider/cancel/cost cap hiển thị đúng.
- [ ] EP-M08-AC-04: Sửa approved content version vô hiệu approval, phải review lại qua M10 trước publish.

## Ngoài phạm vi epic

- Image/video generation: chỉ prompt/script
- Full video editor

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
