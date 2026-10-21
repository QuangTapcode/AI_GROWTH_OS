# Database — BE sở hữu

`migrations/`: migration bất biến sau apply. `seed/`: dữ liệu synthetic tenant A/B và roles. `policies/`: RLS/storage policies (chưa có file). Chưa có Supabase project.

## Chạy local

Từ `apps/api` (cần `DATABASE_URL` trong `.env.local`, Postgres ở `infra/local`):

```powershell
npm.cmd run db:migrate   # áp toàn bộ *.sql theo thứ tự tên file, trong 1 transaction; các file dùng IF NOT EXISTS nên chạy lại được
npm.cmd run db:rollback  # chạy *.down.sql theo thứ tự ngược (001 không có down)
npm.cmd run db:seed      # apps/api/scripts/seed.ts: tenant TripC (10000000-…-0001) + Hoi An Homestays (20000000-…-0001)
```

Seed dùng ID cố định trùng `apps/api/src/lib/sites.ts` để form lead `tripc-pilot` ghi được vào DB. Script migrate chưa có bảng theo dõi migration đã chạy; mỗi lần chạy lại áp tất cả file.

Tuần 1 BE chốt domain schema, migration tool và vector retrieval access. Mỗi người dùng DB local riêng; shared staging chỉ chạy migration đã review qua deploy process.

Tenant/workspace binding cần thể hiện ở khóa và policy, có index và negative tests. Secrets chỉ server-side. AI nhận scoped retrieval/snapshots; FE qua API.

Mỗi migration PR cần thử DB trống, upgrade DB hiện tại, backfill/recovery và rollback app compatibility. Không tự viết down migration xóa dữ liệu để thay thế restore plan. Migration destructive tách release sau khi consumers chuyển xong.

Versioned entities tối thiểu: brand/context, source/chunks, brief/content/variants, approval, jobs/runs, publishing mapping, metric snapshots/report. Bảng chi tiết chốt theo stories, không tạo tất cả tables PRD trước nhu cầu MVP.

Migration `008_integration_connections.sql` thêm metadata connector theo tenant (provider, account ref, scopes, probe status). Token OAuth không lưu trong bảng; chỉ lưu `credential_ref` trỏ tới vault/secret manager.

Migration `009_demo_login_accounts.sql` thêm danh mục tài khoản synthetic local/staging (`email`, workspace, role, password). Mật khẩu đăng nhập thật vẫn lưu scrypt hash trong `users.password_hash`; bảng này chỉ để QA khôi phục fixture và tuyệt đối không dùng cho production. Dùng `npm.cmd --prefix apps/api run db:demo-accounts` để trích xuất danh mục.

Để kiểm tra agent trên staging, chạy `npm.cmd --prefix apps/api run db:seed-context`. Lệnh này tạo source synthetic đã approved, RAG chunks/facts và cấp context hiện hành; không dùng làm dữ liệu nghiệp vụ production.


Baseline W1-PM-02: PostgreSQL + pgvector tự host, không bắt buộc Supabase. Thiệu Quang quản migrations/policies/auth boundary; Mỹ quản seed/queue/metrics. embeddinggemma hiện trả vector 768 chiều trên workstation; pin model digest/dimension và reindex khi đổi model. Đây là lựa chọn thiết kế, DB/migrations chưa provision. [Local stack](../infra/local/README.md).
