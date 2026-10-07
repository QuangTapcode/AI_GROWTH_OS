# BE — Worker jobs

Owner: Mỹ (BE), Thiệu Quang peer-review; vùng sửa `apps/worker/**`. Package/lockfile và process riêng với API, job dài không nằm trong request web. W1-MY-01: đã có queue pg-boss baseline, job state/heartbeat/retry/kill-recovery + fake AI adapter (chưa có AI/CMS live).

`src/jobs/`: `JobState` (status/attempt/deadline/progress/result_ref/provider_calls), `JobStore` (Memory + File durable), `RetryPolicy`, `Heartbeat`, `JobRunner` (claim→heartbeat→persist→completed; timeout; recoverStale), `QueueConfig` (pg-boss v8), `operations`, `submit`. `src/adapters/`: `AiAdapter` (FakeAiAdapter), `QueueAdapter` (PgBoss/Memory), `StorageAdapter` (Memory/File result_ref); CMS/GA4/GSC placeholder. `tests/` và `tasks/` do BE quản.

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
