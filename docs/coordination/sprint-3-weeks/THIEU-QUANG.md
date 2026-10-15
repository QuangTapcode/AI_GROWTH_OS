# TODO — Thiệu Quang / 3 tuần

Vai trò: **Backend API + dữ liệu + contracts**. Khu vực: `apps/api/; database/migrations/; database/policies/; contracts/; .github/; infra/`. [Kế hoạch chung](README.md) · [Kiến trúc](../../architecture/SIX-AGENT-RESTRUCTURE.md).

Baseline 14/10/2026; 15 ngày làm việc dự kiến 15/10–04/11/2026, thứ Hai–thứ Sáu, chưa tính nghỉ riêng. D1–D15 là mốc chính; đổi kickoff thì dịch lịch cùng nhau. Tất cả task dưới đây chưa nghiệm thu. Mỗi người giữ một task chính + lane sửa lỗi; công việc lớn tách PR nhỏ, review trong ngày.

Mỗi task cần cập nhật: trạng thái (`ready/in_progress/local_verified/integrated/done/blocked`), commit/build, evidence, blocker + owner + hạn gỡ. `[x]` chỉ khi AC đạt và reviewer xác nhận. Phụ thuộc là ID trong file người tương ứng. S/M/L là effort tương đối, cần estimate lại D2; không quy đổi thành cam kết giờ.

## Tuần 1 — 15–21/10/2026

### [ ] TQ-01 · D2 · M · Rà core API/auth và freeze contract lát đầu

- **Làm / đầu ra / Done:** Tái sử dụng workspace/source/RBAC/OCC; sửa lỗi build được tái hiện, auth server-side và tenant checks. Freeze contract/version/examples cho task/artifact/approval.
- **Phụ thuộc:** DU-01.
- **Reviewer:** Mỹ + Thiệu.
- **Theo dõi:** `local_verified` (chờ Mỹ + Thiệu review) · PR/build: next build exit 0, tsc --noEmit pass, vitest 33/33 pass · Evidence: contracts 1.1.0 (openapi.json, 3 canonical examples: task-run, artifact-evidence, approval-decision), next.config.mjs fix, auth/tenant checks hardened · Blocker: không.

### [ ] TQ-02 · D4 · L · Migration workflow và content ledger tối thiểu

- **Làm / đầu ra / Done:** Bổ sung workflow/task dependency, version/hash, approval, publication và snapshot refs; tenant constraints/index; migration/rollback. Chia PR workflow và ledger. Không sửa migration đã áp dụng.
- **Phụ thuộc:** TQ-01, DU-02.
- **Reviewer:** Mỹ + Thiệu.
- **Theo dõi:** `local_verified` (chờ Mỹ + Thiệu review) · PR/build: migration 002 UP & DOWN script sẵn sàng, migrate runner an toàn · Evidence: database/migrations/002_workflow_content_ledger.sql, 002_workflow_content_ledger.down.sql, apps/api/scripts/migrate.ts forward/down isolation · Blocker: không.

### [ ] TQ-03 · D5 · M · API campaign/task/artifact và handoff

- **Làm / đầu ra / Done:** CRUD tối thiểu + GET trạng thái/run output; context snapshot approved; validate task plan, enqueue qua transaction/outbox; reject unknown roles/tools.
- **Phụ thuộc:** TQ-02, MY-01.
- **Reviewer:** Mỹ + Quang Quang.
- **Theo dõi:** `local_verified` (chờ Mỹ + Quang Quang review) · PR/build: next build exit 0 (22 routes), tsc --noEmit pass, vitest 38/38 pass · Evidence: apps/api/src/modules/tasks, apps/api/src/modules/campaigns, apps/api/tests/tasks/tasksWorkflow.test.ts · Blocker: không.

## Tuần 2 — 22–28/10/2026

### [ ] TQ-04 · D7 · M · Approval/version API và public boundary

- **Làm / đầu ra / Done:** Duyệt/reject có actor/version/hash; sửa/thu hồi invalidate approval; public read chỉ published snapshot và field allowlist.
- **Phụ thuộc:** TQ-03, DU-04.
- **Reviewer:** Mỹ + Thiệu.
- **Theo dõi:** `local_verified` (chờ Mỹ + Thiệu review) · PR/build: next build exit 0 (24 routes), tsc --noEmit pass, vitest 46/46 pass · Evidence: apps/api/src/modules/approvals, apps/api/src/lib/public-boundary.ts, apps/api/tests/approvals/approvalsOcc.test.ts · Blocker: không.

### [ ] TQ-05 · D8 · M · Persistence lead và phân quyền

- **Làm / đầu ra / Done:** Migration/repository PostgreSQL thay in-memory; idempotency + contact dedup trong workspace; owner/status/note và source/UTM; transaction không báo success khi chưa commit.
- **Phụ thuộc:** TQ-02, DU-05.
- **Reviewer:** Mỹ + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TQ-06 · D10 · M · Tool gateway và connector authorization

- **Làm / đầu ra / Done:** Enforce workspace/role/tool/account/approval tại executor; tách read/draft/publish; ads mutation không được expose; audit denial và execution.
- **Phụ thuộc:** TQ-04, MY-05.
- **Reviewer:** Mỹ + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Tuần 3 — 29/10–04/11/2026

### [ ] TQ-07 · D12 · M · API report/metrics/exception và event consistency

- **Làm / đầu ra / Done:** Đọc snapshot thật, missing reason, time range/timezone/currency; exceptions có owner; outbox/dedup và atomic transitions cho task vòng tiếp.
- **Phụ thuộc:** TQ-06, MY-07.
- **Reviewer:** Mỹ + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TQ-08 · D13 · M · Hardening auth/tenant/version và migration

- **Làm / đầu ra / Done:** Sửa defects QA; kiểm cross-tenant cả relation IDs, concurrent approval và source revoke; rollback/restore trên dữ liệu thử có evidence.
- **Phụ thuộc:** TH-07, TQ-07.
- **Reviewer:** Mỹ + Thiệu.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

### [ ] TQ-09 · D15 · M · Release configuration và bàn giao API/DB

- **Làm / đầu ra / Done:** CI/checks đúng scope, env mẫu, migrations và OpenAPI khớp; deploy candidate, health/rollback và giới hạn auth; không release khi còn critical blocker.
- **Phụ thuộc:** TQ-08, TH-08.
- **Reviewer:** Mỹ + Quang Quang.
- **Theo dõi:** `ready` · PR/build: chưa có · Evidence: chưa có · Blocker: chưa ghi nhận (cập nhật khi nhận việc).

## Khi trễ

Báo blocker ngay với PM; giữ facts/tenant/version/approval/persistence/retry. Giảm độ sâu UI, nhiều kênh và media tự sinh trước. Không bỏ một trong sáu pipeline để đổi lấy giao diện đẹp. Nếu nền tảng chưa qua gate thì ghi rõ mốc bị ảnh hưởng, không tick hoàn thành.
