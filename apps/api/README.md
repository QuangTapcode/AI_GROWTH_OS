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

`src/lib/env.ts` kiểm tra `APP_ENV` (local/staging/test), `INTEGRATION_MODE` (`fake` hoặc `production`) và exact origins. Chỉ bật `production` sau khi OAuth/token của từng workspace đã được cấu hình ở server. Next.js tự đọc `.env.local` khi startup. CORS cho `/v1/*` (trừ `/v1/health`) nằm ở `src/middleware.ts`, dùng chung `CORS_ALLOWED_ORIGINS`.

### Database và đăng nhập

`.env.local` cần `DATABASE_URL` (Postgres local ở `infra/local`) và `AUTH_SECRET` ≥ 32 ký tự. Sau đó:

```powershell
npm.cmd run db:migrate      # áp database/migrations (idempotent)
npm.cmd run db:seed         # tenant TripC + Hoi An Homestays, user owner/editor/viewer (synthetic)
$env:NEW_PASSWORD = "..."; npm.cmd run user:set-password -- someone@gmail.com
$env:SEED_USER_PASSWORD = "TripC@2026!"; npm.cmd run db:seed
npm.cmd run db:seed-context  # synthetic approved source + current context for staging smoke tests
npm.cmd run db:demo-accounts
```

`db:seed` dùng mật khẩu fixture `TripC@2026!` cho local/staging nếu không truyền biến môi trường; truyền `SEED_USER_PASSWORD` hoặc `DEMO_LOGIN_PASSWORD` để đặt mật khẩu khác. `db:demo-accounts` trích xuất email, workspace, role và mật khẩu từ bảng `demo_login_accounts`. Bảng và lệnh này chỉ dành cho dữ liệu synthetic local/staging; seed từ chối chạy khi `NODE_ENV=production`.

`db:seed-context` tạo source synthetic có provenance, chunks/facts đã kiểm chứng và gọi backend để cấp một knowledge context hiện hành cho workspace TripC. Chỉ dùng để smoke test; dữ liệu kinh doanh thật phải đi qua ingest và human review.

- `POST /v1/auth/login` `{email, password}` → `{access_token, token_type: "Bearer", expires_at, user}`. Mật khẩu lưu scrypt (`src/lib/password.ts`); sai 10 lần trong 15 phút theo email hoặc IP → 429 `TOO_MANY_ATTEMPTS`. Sai email hay sai mật khẩu đều trả cùng 401 `INVALID_CREDENTIALS`.
- Access token là JWT HS256 ký bằng `AUTH_SECRET` (`src/lib/session-token.ts`), hết hạn sau `AUTH_TOKEN_TTL_SECONDS` (mặc định 8 giờ), được `authenticateUser` chấp nhận ở mọi môi trường. Token dev (`dev_owner`, `dev_user_<uuid>_<role>`) vẫn chỉ dùng ngoài production.
- `GET /v1/auth/me` → user và các workspace kèm role. `GET /v1/workspaces` cũng trả `role` của user hiện tại.
- Mỗi lần đăng nhập tạo một dòng `auth_sessions` (migration 006); token mang `sid`. `POST /v1/auth/logout` thu hồi phiên đó, `POST /v1/auth/password` `{current_password, new_password}` đổi mật khẩu và thu hồi các phiên khác. Phiên bị thu hồi/hết hạn → 401 `SESSION_REVOKED` (kiểm tra cùng truy vấn membership trong `lib/tenant.ts`).

### Endpoint bổ sung (19/10)

| Endpoint | Quyền | Ghi chú |
| --- | --- | --- |
| `GET/PUT /v1/workspaces/{id}/business-profile` | xem: mọi role · sửa: owner/editor | PUT cần `expected_version`; sai version → 409 `VERSION_CONFLICT`; ghi `audit_events` |
| `GET /v1/workspaces/{id}/integrations` | mọi role | Trạng thái GA4/GSC/Meta/CMS theo integration matrix + chế độ đăng (live/manual); không trả secret |
| `POST /v1/workspaces/{id}/metrics/sync` | owner/editor | Đồng bộ snapshot thật từ GA4, Search Console và Meta Ads; yêu cầu `INTEGRATION_MODE=production` và credential server-side |
| `GET/POST /v1/workspaces/{id}/channels` | xem: mọi role · tạo: owner | Kênh website/facebook/instagram/linkedin/email, kèm `publish_mode` |
| `GET/POST /v1/workspaces/{id}/publishing-jobs` | xem: mọi role · xếp lịch: owner/editor | Chỉ artifact có approval mới nhất `approved` khớp version + hash (409 `APPROVAL_REQUIRED`); trùng lịch → 409 `ALREADY_SCHEDULED`; ghi `outbox_events` `publishing.scheduled` |
| `PATCH /v1/workspaces/{id}/publishing-jobs/{job}` | owner/editor | `{action: "cancel"}` hoặc `{action: "mark_published", external_post_id?}` cho kênh manual |
| `GET/POST /v1/workspaces/{id}/metrics` | xem: mọi role · ghi: owner/editor | Chuỗi theo ngày từ `metrics_snapshots`; không có dữ liệu → `missing` + `missing_reason`. Report cộng snapshot ngày (đủ ngày → available, thiếu → partial) |
| `POST /v1/workspaces/{id}/tasks/{task}/retry` | owner/editor | Chỉ task `failed` → `queued`, ghi audit |

`POST /v1/workspaces/{id}/metrics/sync` gọi API GA4, Search Console và Meta Ads thật, sau đó ghi snapshot ngày. Đặt `INTEGRATION_MODE=production`, `GA4_PROPERTY_ID`, `GSC_SITE_URL`, `META_AD_ACCOUNT_ID` và credential server-only trước khi gọi; thiếu provider sẽ được trả về với `status=skipped`, không ghi số 0 giả.

Integration test với DB thật: `RUN_DB_TESTS=1 DATABASE_URL=<db vừa migrate+seed> npx vitest run tests/integration`.

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
