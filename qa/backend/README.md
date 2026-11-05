# Backend QA

Khu vực này tập trung hướng dẫn và theo dõi kiểm thử API, worker, database, contract và tích hợp.

## API

Các test của API nằm tại `apps/api/tests/`; chạy từ repo:

```powershell
npm.cmd --prefix apps/api run test:qa-backend
npm.cmd --prefix apps/api run test:business-profile
npm.cmd --prefix apps/api test
npm.cmd --prefix apps/api run typecheck
```

`test:qa-backend` chạy các test API route trong `qa/backend/tests/`: đăng nhập và `/me`, business profile, danh sách lead theo workspace, health/CORS và contract lỗi (validation, lỗi PostgreSQL, response 500 đã được làm sạch). Các test dùng service mock khi phù hợp, không cần database và không gọi dịch vụ bên ngoài.

`qa/backend/tsconfig.json` cấu hình riêng import/type resolution cho các file QA trong VS Code, kế thừa cấu hình và dependencies từ API.

`test:business-profile` chạy bộ test service hồ sơ doanh nghiệp mới: membership, viewer permission, schema validation, chuẩn hóa input, version conflict và profile không tồn tại. Test này dùng mock repository, không cần database.

Lệnh `test` chạy toàn bộ unit/contract tests backend hiện có trong `apps/api/tests/` cùng test code tại `qa/backend/tests/`. Bộ này bao gồm auth/session, tenant và hardening, approvals, tasks/plans, leads/community, public content, research, reports, integrations và health/route contracts. Các test tích hợp database có thể bị skip mặc định; để chạy chúng cần Postgres test riêng đã migrate/seed và cấu hình `DATABASE_URL` cùng `RUN_DB_TESTS=1`. Không chạy test ghi dữ liệu trên database ứng dụng đang dùng. Xem [API README](../../apps/api/README.md).

## Worker và contract

Test worker nằm tại `apps/worker/tests/`; contract/schema và ví dụ chuẩn nằm trong `contracts/`. Các suite QA backend chuyên biệt hiện có được giữ tại `qa/tester-2/` và `qa/QQ_test/`; chưa di chuyển để giữ nguyên cấu hình và các tham chiếu hiện có.
