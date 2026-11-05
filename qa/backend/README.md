# Backend QA

Khu vực này tập trung hướng dẫn và theo dõi kiểm thử API, worker, database, contract và tích hợp.

## API

Các test của API nằm tại `apps/api/tests/`; chạy từ repo:

```powershell
npm.cmd --prefix apps/api test
npm.cmd --prefix apps/api run typecheck
```

Test tích hợp database cần Postgres local đã migrate/seed và cấu hình `DATABASE_URL`; xem [API README](../../apps/api/README.md).

## Worker và contract

Test worker nằm tại `apps/worker/tests/`; contract/schema và ví dụ chuẩn nằm trong `contracts/`. Các suite QA backend chuyên biệt hiện có được giữ tại `qa/tester-2/` và `qa/QQ_test/`; chưa di chuyển để giữ nguyên cấu hình và các tham chiếu hiện có.
