# FE — Web

Owner: Tiến/Huyền (FE), Tiến đầu mối shell/config/lockfile; Huyền content flows/mocks/tests theo [TEAM](../../docs/coordination/TEAM.md). TypeScript/Next.js; đây là app quản trị và CMS UI. Website công khai nằm riêng ở [apps/pilot](../pilot/README.md). Vùng sửa: `apps/web/**`. Đây là skeleton chưa có app/manifest/lockfile; bắt đầu W1-FE-01/W1-FE-02 trong [TODO](../../TODO.md).

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
