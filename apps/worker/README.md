# BE — Worker jobs

Owner: Mỹ (BE), Thiệu Quang peer-review; vùng sửa `apps/worker/**`. Package/lockfile và process riêng với API, job dài không nằm trong request web. W1-MY-01: đã có queue pg-boss baseline, job state/heartbeat/retry/kill-recovery + fake AI adapter. **MY-01 (D3): đã nối AI HTTP adapter (CR-001) và typed job routing** — xem mục riêng dưới đây.

`src/jobs/`: `JobState` (status/attempt/deadline/progress/result_ref/provider_calls), `JobStore` (Memory + File durable), `RetryPolicy`, `Heartbeat`, `JobRunner` (claim→heartbeat→persist→completed; timeout; recoverStale), `QueueConfig` (pg-boss v8), `operations` (typed routing), `submit`. `src/adapters/`: `AiAdapter` (Fake + Http), `QueueAdapter` (PgBoss/Memory), `StorageAdapter` (Memory/File result_ref); CMS/GA4/GSC placeholder. `src/workflow/`: `WorkflowRunner` (dependency dispatch + human wait + dedup + resume + requeueFailed), `WorkflowStore` (Memory + File), `DbWorkflowStore` (Postgres, nối migration 002). `tests/` và `tasks/` do BE quản.

## AI HTTP adapter và typed routing (MY-01)

- `AI_PROVIDER_MODE=live` → `HttpAiAdapter` (`src/adapters/HttpAiAdapter.ts`): POST `{AI_SERVICE_BASE_URL}/internal/v1/runs` với JobRequest đầy đủ (job_id/workspace_id UUID, operation đã map, input_version, trace_id, payload), poll `GET /internal/v1/runs/{run_id}` tới terminal, auth `Authorization: Bearer {INTERNAL_AI_AUTH_TOKEN}`.
- Idempotency theo CR-001: worker resend **cùng request** (không nhúng attempt) → AI service resume run cũ; khóa định danh là `job_id + operation + input_version`.
- Phân loại lỗi: envelope 4xx (INVALID_PAYLOAD, IDEMPOTENCY_CONFLICT, UNAUTHORIZED…) → permanent (không retry, `error_code` giữ mã AI); 429/5xx/network/poll-timeout → retryable; run failed đọc cờ `retryable` từ AI service. Lỗi ghi vào `JobState.error_code`.
- Cancel: contract chưa có AI-side cancel endpoint → `HttpAiAdapter.cancel(runId)` ngừng poll local (`RUN_CANCELLED`); run vẫn hoàn tất bên AI và nằm trong AI run store.
- Typed routing (`src/jobs/operations.ts`): `ingest→knowledge.ingest`, `research→research.run`, `score→opportunity.score`, `strategy→strategy.generate`, `content→content.generate`. **publish/lead/metrics/integrations đã wiring executor (MY-04/05/06)** — publish qua `PublishJobProcessor + defaultRegistry (MockCmsPublisher)`, lead qua `LeadIntakeService`, metrics qua `MetricsIngestionStub (insufficient_data)`, integrations passthrough manual/insufficient; chỉ `ingest_revoke/ingest_delete` còn fail `OPERATION_NOT_WIRED` chờ snapshot scoping (TQ-02).
- Env: `AI_SERVICE_BASE_URL`, `INTERNAL_AI_AUTH_TOKEN`, `AI_HTTP_POLL_INTERVAL_MS` (1000), `AI_HTTP_POLL_TIMEOUT_MS` (600000), `AI_HTTP_REQUEST_TIMEOUT_MS` (30000).
- Job result của operation AI-backed gồm `ai_run_id` + `artifact` (CR-002) persist qua `result_ref`.
- Test: `tests/httpAiAdapter.test.ts` (submit/poll/idempotency/error envelope/cancel, stub fetch — không cần service thật), `tests/operationsRouting.test.ts` (mapping + không-LLM ops). Chạy: `npm test`.

## Workflow runner durable (MY-03 — hoàn thiện tuần 1)

- `WorkflowRunner` (`src/workflow/WorkflowRunner.ts`): dependency dispatch đúng thứ tự DAG, dừng ở human wait (`awaiting_approval`), event dedup exactly-once, `resume()` sau restart chỉ chạy step cần, `requeueFailed()` retry step lỗi không chạy lại toàn campaign.
- `DbWorkflowStore` (`src/workflow/DbWorkflowStore.ts`, mới): pg Pool raw SQL theo pattern `apps/api/src/lib/db.ts`, nối migration 002 của TQ-02 — Workflow → hàng `workflow_tasks` operation=`__workflow__`; Task → hàng `workflow_tasks` + cạnh `task_dependencies` (đọc dependencies từ bảng, nguồn sự thật cho dispatch); Event → hàng `content_artifacts` (`artifact_type='workflow_event'`, content_hash = sha256(workflow_id|dedup_key), dedup read-before-write trong transaction vì 002 chưa có unique (workspace_id, content_hash)). `'blocked'` hạ xuống `'failed'` + error_code=`DEPENDENCY_FAILED` (map ngược khi đọc) vì CHECK của 002 không có `'blocked'`.
- Test: `tests/workflow.test.ts` 5/5 (Memory/File store), `tests/dbWorkflow.test.ts` (tích hợp Postgres thật, tự skip khi không có DB — cần `DATABASE_URL` trỏ Postgres đã migrate 001+002).
- Hạn chế môi trường hiện tại: Docker Desktop chưa chạy trên máy Mỹ nên evidence DB thật + live run MY-01 chưa có — chạy lại `npx vitest run tests/dbWorkflow.test.ts` và smoke `AI_PROVIDER_MODE=live` khi có Postgres + AI service.

Giới hạn: chỉ 1 AI process (concurrency 1); workspace_id phải là UUID thật từ BE — test nội bộ dùng FakeAiAdapter; publish/lead/metrics đã wiring executor, còn `ingest_revoke/ingest_delete` chờ snapshot scoping (TQ-02).

## Lead persistence PG (MY-06 — thay in-memory)

- `src/leads/PgLeadStore.ts` (mới): implements `LeadStore` bằng pg Pool raw SQL theo pattern `DbWorkflowStore`, bảng `leads` (migration 003). `insertLead` chạy transaction `BEGIN` → check idempotency read-before-write → `INSERT` → `COMMIT`, lỗi giữa chừng `ROLLBACK` (không half-write). `findByKey/listByWorkspace/updateStatus` cùng DB. `close()` kết thúc Pool.
- `LeadIntakeService(pgStore?)`: nếu truyền store thì dùng PG, ngược lại `autoPgStore()` — có `DATABASE_URL` thì tự tạo `PgLeadStore`, không thì in-memory như cũ. Test cũ không set `DATABASE_URL` nên vẫn in-memory, không đổi hành vi.
- Smoke PG thật (tay, không CI): `cd apps/worker && DATABASE_URL=... npx tsx tasks/pgLeadSmoke.ts` → intake 2 lần cùng payload: lần 2 `duplicate=true`, cùng `leadId`, row trong `leads`. Cần workspace UUID có thật (FK `workspace_id` → `workspaces.id`); thiếu FK thì intake trả `LEAD_PERSIST_FAILED`.
- Env: `DATABASE_URL` (Postgres đã migrate 001–004).

## Chạy & kiểm thử (W1-MY-01)

```bash
cd apps/worker
npm install        # cài deps (lockfile riêng)
npm run check      # tsc --noEmit kể cả tests
npm test           # vitest: retry/store/runner + kill -9 recovery (không cần DB/API ngoài)
npm run dev        # chạy worker (cần Postgres cho pg-boss; env xem .env.example)
npm run build      # tsc emit src/ → dist/
```

- Env mặc định qua zod (`src/config/EnvSchema.ts`); `AI_PROVIDER_MODE=fake` (mặc định), `INTEGRATION_MODE=fake`.
- Job state bền vững ở `WORKER_STATE_DIR` (mặc định `.worker-state/`) — đủ sống sót qua kill/restart; store DB (kysely) thay thế khi `database/migrations` (W1-BE-01) sẵn sàng, mọi nơi chỉ phụ thuộc interface `JobStore`.
- Recovery: `JobRunner.recoverStale()` (cron sweep trong `main.ts`) requeue job mất lease sau kill; budget provider-call persist qua restart, không reset khi retry.

## Làm độc lập

- Seed jobs/context synthetic vào DB local; dùng `AI_PROVIDER_MODE=fake`, `INTEGRATION_MODE=fake`.
- Kiểm tra progress/complete/cancel/timeout/retry/restart bằng fake xác định (đã có test: `tests/jobRunner.test.ts`, `tests/killRecovery.test.ts`).
- Job bền vững có lease/heartbeat/attempt/result refs; nối lại AI run cũ theo idempotency.
- CMS timeout không rõ kết quả: reconciliation trước retry, không tạo post mới mù quáng.
- Publish recheck tenant/permission/source/approved version/hash tại execution.

Live mode dùng AI nội bộ và adapter credentials server-side; AI không giữ CMS/OAuth keys. Secrets/private content không vào logs.

W1-BE-01 bootstrap/run/check commands; W2-BE-03 durable AI queue; W3-BE-02 CMS scheduler; W3-BE-04 GA4/GSC snapshots; W4-BE-04 deploy/recovery/restore. Schedule lưu UTC, hiển thị theo một timezone pilot.


Ngôn ngữ: TypeScript; owner Mỹ, Thiệu Quang peer-review. CMS pilot là Next.js tối giản, publish job kiểm tra human approval/version và ghi mapping URL/idempotency. AI Python giao tiếp HTTP/JSON, không chạy chung runtime hay import source. [TEAM](../../docs/coordination/TEAM.md).
