# BE — Public API và domain

Owner: Thiệu Quang/Mỹ (BE), chia core/domain theo [TEAM](../../docs/coordination/TEAM.md). Vùng sửa: `apps/api/**`; BE cũng sở hữu worker/database/infra. Skeleton chưa chạy; bắt đầu W1-BE-01–W1-BE-05 trong [TODO](../../TODO.md).

## Cách làm độc lập

1. Nhận role matrix, data/state rules và AC từ BA; chốt OpenAPI với FE/QA2.
2. Tạo database local riêng, migration/seed tenant A/B; không dùng staging chung để thử migration.
3. Tạo API và durable job enqueue; dùng worker AI stub/fake external integrations.
4. Chạy API/unit/RLS tests trực tiếp không cần FE hoặc LLM.
5. Tích hợp FE/AI thật trên staging và đối chiếu contract/AC.

## Source

- `src/app/`: Next.js API routes; authentication/validation/routing, không nhồi toàn bộ business logic.
- `src/modules/<domain>/`: identity/workspaces/business/goals/knowledge/research/opportunities/strategies/tasks/briefs/contents/seo/approval/publishing/community/tracking/metrics/reports/experiments/learning/integrations/audit.
- `src/integrations/`: OAuth và integration configuration, secrets phía server.
- `src/lib/`: DB/queue/session/tenant/logger/env adapters.
- `tests/`: unit/API/contract tests do BE duy trì; independent security/API suite ở QA2.

API sở hữu persistence và authorization. Không trả credentials cho FE; workspace_id từ client phải được xác minh; RLS không thay thế validation API. AI không tự ghi domain tables. LLM/CMS công việc dài đi qua worker.

## Bootstrap phải bàn giao

Manifest/lockfile riêng, runtime pin, port dự kiến 4000, env loader, health endpoint, database/queue setup và lệnh install/dev/lint/typecheck/test/build đã kiểm chứng. Thêm lệnh migration/seed rõ target local và README troubleshooting.

## Trước merge

AC/schema đạt, tenant/role negative cases đạt, stale version trả conflict, migrations từ DB trống và nâng phiên bản đạt, error/log không lộ secrets. API changes có consumer review. Không tự tăng scope để đáp ứng mọi module PRD.


Ngôn ngữ đã chốt: TypeScript + SQL; CMS tối giản dùng Next.js API. Thiệu Quang sở hữu core/contracts/approval, Mỹ sở hữu publishing/metrics/tracking và form submission domain; Thiệu Quang review auth/public boundary và migrations. Public read chỉ published content; form persisted/idempotent success là conversion. [TEAM](../../docs/coordination/TEAM.md) và [PILOT](../../docs/coordination/PILOT.md) là phân công hiện hành; cách bootstrap runtime/queue còn ở W1-BE-01.


Cân bằng BE ở W1-PM-02: Mỹ nhận M03 goals và business-profile slice M01; Thiệu Quang giữ review auth/contracts/migrations. Database baseline PostgreSQL/pgvector local; không tự tạo paid Supabase project. [TEAM](../../docs/coordination/TEAM.md).
