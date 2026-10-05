# FE — Website pilot TripC

Owner: Tiến; Huyền peer-review, Trường design review, Thanh QA. **TypeScript/Next.js**, tách package/manifest/lockfile/env khỏi app quản trị. Đây là skeleton tài liệu, chưa có app chạy. [PILOT](../../docs/coordination/PILOT.md) · [TEAM](../../docs/coordination/TEAM.md) · [TODO](../../TODO.md).

## Phạm vi và boundary

- Blog tiếng Anh cho expat Đà Nẵng: danh sách, bài viết theo slug; landing page kèm form nhận thông tin.
- Public API chỉ trả nội dung đã published; draft/preview và CMS mutation cần quyền quản trị. App quản trị ở `apps/web/`, nghiệp vụ CMS ở `apps/api/`; human approval gắn version trước publish.
- Form gọi API server, lưu thành công mới hiển thị confirmation và ghi conversion; retry có idempotency, không tính click nút là conversion.
- UTM/source/campaign/content được giữ theo contract; GA4/GSC cấu hình thật ở W1-BE-04. Không gửi email/tên vào analytics. M15 chỉ hai title/CTA variants trên một landing page.

## Làm độc lập và bàn giao

Tiến tạo routes trong `src/app/`, blog/landing/form trong `src/features/`, client trong `src/lib/`, contract mock trong `src/mocks/`. Mock có published/draft exclusion, form success/error/retry và missing metrics; không cần AI/DB thật để dựng UI. Dự kiến port 3001, mock/live mode và lệnh install/dev/lint/typecheck/test/build phải được kiểm chứng khi bootstrap W1-FE-01.

Done cần API/staging thật, không lộ draft, form lưu/dedup đúng, UTM/GA4 event evidence và human approval/publish E2E. Domain, deploy và properties chưa được tạo trong W1-PM-01.