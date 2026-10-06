# FE — Website pilot TripC

Owner: Tiến; Huyền peer-review, Trường design review, Thanh QA. **TypeScript/Next.js**, tách package/manifest/lockfile/env khỏi app quản trị. Đã có bootstrap local với trang English TripC và kiểm tra kết nối API; blog/form/CMS chưa triển khai. [PILOT](../../docs/coordination/PILOT.md) · [TEAM](../../docs/coordination/TEAM.md) · [TODO](../../TODO.md).

## Chạy bootstrap local — 06/10/2026

Yêu cầu Node.js 24; runtime `24.14.1`. Next.js `16.3.8`, React `19.3.0`, TypeScript `5.9.3`; dependencies được pin bằng manifest và lockfile riêng.

Từ thư mục này:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Mở `http://localhost:3001`. API phải chạy tại `http://localhost:4000` để thẻ trạng thái hiển thị `API connected`. `NEXT_PUBLIC_API_BASE_URL` được Next.js đọc khi build, vì vậy cần build lại sau khi đổi URL.

Chạy cả ba app bằng [start.ps1](../../infra/staging/start.ps1); hướng dẫn và lệnh dừng ở [infra/staging](../../infra/staging/README.md).

Các lệnh: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd start`. Khi app đang chạy, `npm.cmd test` kiểm tra trang chủ và `/health`; test trình duyệt cho cả pilot/web ở `apps/web` bằng `npm.cmd run test:e2e`.

`src/features/staging/api-status.tsx` hiển thị connected/unavailable/retry; `src/lib/api.ts` là HTTP client kiểm tra response của `/v1/health`. Không import source BE hoặc truy cập database. `/health` chỉ xác nhận tiến trình pilot chạy.

Bootstrap không bật GA4 trên localhost. GA4 `G-8LQN27Y8QQ` hiện được gắn vào trang thông báo công khai trên Cloudflare Pages; nó chưa đo frontend local này.

## Phạm vi và boundary

- Blog tiếng Anh cho expat Đà Nẵng: danh sách, bài viết theo slug; landing page kèm form nhận thông tin.
- Public API chỉ trả nội dung đã published; draft/preview và CMS mutation cần quyền quản trị. App quản trị ở `apps/web/`, nghiệp vụ CMS ở `apps/api/`; human approval gắn version trước publish.
- Form gọi API server, lưu thành công mới hiển thị confirmation và ghi conversion; retry có idempotency, không tính click nút là conversion.
- UTM/source/campaign/content được giữ theo contract; GA4/GSC cấu hình thật ở W1-BE-04. Không gửi email/tên vào analytics. M15 chỉ hai title/CTA variants trên một landing page.

## Làm độc lập và bàn giao

Tiến tạo routes trong `src/app/`, blog/landing/form trong `src/features/`, client trong `src/lib/`, contract mock trong `src/mocks/`. Mock có published/draft exclusion, form success/error/retry và missing metrics; không cần AI/DB thật để dựng UI. Dự kiến port 3001, mock/live mode và lệnh install/dev/lint/typecheck/test/build phải được kiểm chứng khi bootstrap W1-FE-01.

Done cần API/staging thật, không lộ draft, form lưu/dedup đúng, UTM/GA4 event evidence và human approval/publish E2E. Domain, deploy và properties chưa được tạo trong W1-PM-01.
