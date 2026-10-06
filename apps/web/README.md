# FE — Web

Owner: Tiến/Huyền (FE), Tiến đầu mối shell/config/lockfile; Huyền content flows/mocks/tests theo [TEAM](../../docs/coordination/TEAM.md). TypeScript/Next.js; đây là app quản trị và CMS UI. Website công khai nằm riêng ở [apps/pilot](../pilot/README.md). Vùng sửa: `apps/web/**`. Đã có bootstrap shell và kiểm tra kết nối API; auth/CMS chưa triển khai. Phạm vi sản phẩm tiếp tục theo W1-FE-01/W1-FE-02 trong [TODO](../../TODO.md).

## Chạy bootstrap local — 06/10/2026

Node.js `24.14.1` (major 24), Next.js `16.3.8`, React `19.3.0`, TypeScript `5.9.3`; manifest/lockfile riêng cho app.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Mở `http://localhost:3000`. API cần chạy port 4000; `NEXT_PUBLIC_API_BASE_URL` mặc định là `http://localhost:4000/v1`. Đổi biến này cần build lại.

Lệnh kiểm tra: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`. Sau build dùng `npm.cmd start`; khi server chạy dùng `npm.cmd test` để kiểm tra HTTP.

Test trình duyệt kiểm tra cả hai frontend gọi API, hiển thị lỗi, thử lại thành công và không tràn màn hình mobile:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Test cần cả ba ứng dụng đang chạy. Dùng [start.ps1](../../infra/staging/start.ps1) và [stop.ps1](../../infra/staging/stop.ps1) theo [hướng dẫn staging](../../infra/staging/README.md).

`src/features/staging/api-status.tsx` là phần kiểm tra kết nối; `src/lib/api.ts` gọi HTTP API và kiểm tra response. `/health` chỉ đo tiến trình web. Bootstrap chưa cung cấp login, workspace, roles, CMS hay live Google API connector.

## Cách làm độc lập

1. Nhận story/AC từ BA và feature spec từ `design/specs/`.
2. Pin contract version đã chốt; tạo API client riêng, không import BE/AI source và không query DB.
3. Triển khai mock handlers trong `src/mocks/`, đọc canonical examples; hỗ trợ success/error/empty/permission/progress/cancel/stale version.
4. Làm UI/component tests bằng mock, không cần API/AI/DB thật.
5. Đổi `NEXT_PUBLIC_API_MODE` sang live và chạy staging flow; giữ mock evidence riêng với integration evidence.

## Tổ chức source khi bootstrap

- `src/app/`: routes/layout/auth shell; route page mỏng, gọi feature.
- `src/features/<feature>/`: UI, hooks, validation và API adapter theo workspace/onboarding/knowledge/goals/research/opportunities/strategy/briefs/content/seo/approval/calendar/community/traffic/analytics/reports/experiments/learning/settings.
- `src/components/`: component dùng chung do FE sở hữu; UI/UX review thiết kế.
- `src/lib/`: API client, session, env validation, generated contract client nếu cần.
- `tests/`: component/unit/consumer tests; QA E2E ở `qa/tester-1`.

FE tạo `package.json` và lockfile **trong thư mục này**, chốt runtime với BE/AI, viết lệnh install/dev/lint/typecheck/test/build đã chạy thật vào README. Dự kiến dev port 3000; mode mock không yêu cầu secret hoặc service khác.

## Điều kiện bàn giao

- Fields/states khớp contract/design; secret không ra browser.
- Token/workspace đổi đúng, permission UX đầy đủ; BE vẫn kiểm tra quyền phía server.
- Editor có concurrency recovery, trạng thái approval đúng version.
- UI tests/build đạt; QA1 có evidence; critical flow chạy với API thật trước Done.
- Đề nghị thay đổi API qua CR; đề nghị thay đổi tokens qua UI/UX, không sửa file họ sở hữu.

Task FE tách theo feature trong source hoặc liên kết tracker; không sửa TODO tổng đồng thời với cả đội.
