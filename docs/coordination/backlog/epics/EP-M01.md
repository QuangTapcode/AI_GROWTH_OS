# EP-M01 — Workspace

- Trạng thái: planned; chỉ scope/AC baseline, chưa code, chưa Ready trước estimate/contract/design.
- Owner bàn giao: **Thiệu Quang (BE)**. Reviewers: **Dương, Tiến, Huyền, Thanh, Mỹ**. Nghiệm thu: **Quang Quang (PO)**; **Dương** điều phối AC/UAT; **Thanh** cung cấp QA evidence.
- Contributors: Thiệu Quang, Mỹ, Tiến, Huyền, Quang Quang, Trường, Thanh, Dương; vai trò: BE, FE, AI, UI/UX, Tester 1, Tester 2, BA. Thanh làm cả hai lane; Quang Quang dùng chung thời gian AI/PM/PO.
- Tuần: 1; ngày bắt đầu: 1; hạn mục tiêu: ngày 5 tính từ kickoff, chưa là ngày lịch.
- Milestones: Ngày 3–4 tích hợp; ngày 5 W1 gate.
- Effort: chưa estimate; owner cung cấp vào W1-PM-02, PM kiểm tra capacity từng vị trí.
- Tasks liên quan: W1-FE-02, W1-BE-02, W1-AI-02, W1-QA1-02, W1-QA2-01; chi tiết trong [TODO](../../../../TODO.md).

## Phụ thuộc và ranh giới

- Phụ thuộc triển khai: EP-FOUNDATION. Chỉ chờ lát interface/DB/auth cần thiết, không chờ epic nền tảng hoàn tất release ngày 20.
- Phụ thuộc đối chiếu/tích hợp: Không bổ sung. Có thể build với schema/mock trước, chưa nghiệm thu live khi dependency chưa sẵn sàng.
- Khu vực source: apps/web/, apps/api/, database/, services/ai/. Mỗi role chỉ sửa vùng mình theo [README](../../../../README.md).
- Next.js/TypeScript website và CMS đã được chọn; runtime versions, provider limits và contract freeze do W1-BE-01/W1-BE-03 chốt; không tự coi đã cấu hình.

## Đầu ra

- Login/session/workspace/profile/brand/audience/language/products/members
- RBAC Owner/Editor/Viewer, tenant policies và audit
- Business context/Growth Map suggestion chờ duyệt

## Acceptance criteria

- [ ] EP-M01-AC-01: Owner tạo/sửa business profile, lưu và mở lại đúng dữ liệu.
- [ ] EP-M01-AC-02: Viewer không sửa; các quyền Editor/Owner được BA/PO định nghĩa và BE kiểm tra phía server.
- [ ] EP-M01-AC-03: Người thuộc workspace A không đọc/sửa dữ liệu B qua API/DB/storage.
- [ ] EP-M01-AC-04: AI Growth Map chỉ là đề xuất, người dùng duyệt mới áp dụng; UI có loading/empty/error/permission.

## Ngoài phạm vi epic

- Role sản phẩm ngoài Owner/Editor/Viewer
- SSO Enterprise

## Bàn giao và bằng chứng

- BA phân rã story/field rules/negative cases, UI/UX tạo spec trước 1–2 ngày; owner phân việc FE/BE/AI theo contract.
- Developer tự kiểm thử; Tester 1 xác minh UI/E2E/UAT, Tester 2 xác minh API/tenant/jobs/data/AI theo AC.
- Evidence phải có build/commit/environment/test IDs/contract version và dataset/source versions; AI thêm prompt/model/eval versions.
- Mock/stub evidence chỉ local_verified; Done cần staging thật, AC đạt, review/checks/docs và PO nghiệm thu theo gate.
- Evidence thực tế: chưa có. Story/estimate/contract/test IDs bổ sung ở task chuyên môn, không tự tick bởi file epic được tạo.

Baseline pilot: [PILOT](../../PILOT.md) · [dataset](../../PILOT_DATASET.json) · [nguồn](../../SOURCES.md). Quyết định website/form đã chốt; epic vẫn planned, chưa có evidence triển khai.
