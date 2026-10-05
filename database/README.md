# Database — BE sở hữu

`migrations/`: migration bất biến sau apply. `seed/`: dữ liệu synthetic tenant A/B và roles. `policies/`: RLS/storage policies. Chưa có schema hoặc Supabase project được tạo trong bộ khung.

Tuần 1 BE chốt domain schema, migration tool và vector retrieval access. Mỗi người dùng DB local riêng; shared staging chỉ chạy migration đã review qua deploy process.

Tenant/workspace binding cần thể hiện ở khóa và policy, có index và negative tests. Secrets chỉ server-side. AI nhận scoped retrieval/snapshots; FE qua API.

Mỗi migration PR cần thử DB trống, upgrade DB hiện tại, backfill/recovery và rollback app compatibility. Không tự viết down migration xóa dữ liệu để thay thế restore plan. Migration destructive tách release sau khi consumers chuyển xong.

Versioned entities tối thiểu: brand/context, source/chunks, brief/content/variants, approval, jobs/runs, publishing mapping, metric snapshots/report. Bảng chi tiết chốt theo stories, không tạo tất cả tables PRD trước nhu cầu MVP.
