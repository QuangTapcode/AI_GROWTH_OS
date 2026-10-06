# BE — Public API và domain

Owner: Thiệu Quang/Mỹ (BE), chia core/domain theo [TEAM](../../docs/coordination/TEAM.md). Vùng sửa: `apps/api/**`; BE cũng sở hữu worker/database/infra. Đã có bootstrap Next.js API với process health và CORS local; các endpoint nghiệp vụ/DB/queue tiếp tục theo W1-BE-01–W1-BE-05 trong [TODO](../../TODO.md).

## Chạy bootstrap local — 06/10/2026

Runtime Node.js `24.14.1` (major 24), Next.js `16.3.8`, TypeScript `5.9.3`; package/lockfile riêng.

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Mở `http://localhost:4000`. Các lệnh: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd start`; `npm.cmd test` cần server đang chạy. Chạy cả ba app bằng [hướng dẫn staging](../../infra/staging/README.md).

### HTTP contract của bootstrap

`GET /health` và `GET /v1/health` không yêu cầu authentication, trả HTTP 200:

```json
{
  "status": "ok",
  "service": "ai-growth-os-api",
  "environment": "staging",
  "scope": "process_only",
  "checked_at": "2026-10-06T00:00:00.000Z"
}
```

`checked_at` được tạo khi gọi endpoint; timestamp trên chỉ là ví dụ. `scope: process_only` không xác nhận DB, queue hoặc AI đã kết nối. Không trả secret/config nội bộ. `/v1/health` là infrastructure endpoint, không thay baseline draft của hợp đồng nghiệp vụ.

`OPTIONS` trả 204 cho origins được cho phép. CORS mặc định chỉ cho frontend `localhost`/`127.0.0.1` ở port 3000 và 3001; origin khác nhận 403 với `{error: {code, message, request_id}}` và không có header cấp quyền CORS. Đây không phải cơ chế authentication.

`src/lib/env.ts` kiểm tra `APP_ENV` (local/staging/test), `INTEGRATION_MODE=fake` và exact origins. Next.js tự đọc `.env.local` khi startup. API không cần database credentials cho bootstrap; chưa có migration/seed/worker hoặc endpoint ghi dữ liệu.

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
