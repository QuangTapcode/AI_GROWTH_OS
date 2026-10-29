# Agent automation and monitoring

Dashboard: `http://localhost:3000/agents`. Requires a workspace login. Task state is read from PostgreSQL every five seconds; no simulated status or fake progress percentages.

## Start and stop

```powershell
.\infra\staging\setup-local.ps1
npm.cmd --prefix apps/worker ci
npm.cmd --prefix apps/web ci
npm.cmd --prefix apps/web run build
.\infra\staging\start-agents.ps1
# To stop only these recorded processes:
.\infra\staging\stop-agents.ps1
```

The launcher starts API development server (4000), production Web (3000), Python AI (5000) and Worker. It generates a private scheduler token in ignored API configuration. It does not configure Windows startup. Processes must remain running for scheduled work. Logs and process records are in `infra/staging/.runtime/`.

For the public Cloudflare staging domain, first stop these services, build the API with `npm.cmd --prefix apps/api run build`, then run `start-agents.ps1 -ProductionApi`. This uses `next start` and disables development bearer tokens. Deploy Web with `infra/staging/cloudflare-pages/deploy.ps1`; the existing Pages proxy forwards authenticated `/v1/*` requests to the API tunnel. The internal scheduler is not exposed by that Pages proxy. The local machine and tunnel must remain online.

`start-agents.ps1 -Mode fake` explicitly selects deterministic AI, while keeping the real HTTP/queue boundary. It does not create business data, approved sources, credentials or model downloads. The live default uses the installed `qwen3:8b`; pass `-Model` to select another installed model. The AI readiness endpoint also requires `embeddinggemma:latest`.

## Workspace prerequisites

Prepare a business profile, approved source documents/chunks, a backend-issued current knowledge context, approved assets and a campaign CTA. A source must contain real provenance. The scheduler never approves source data or manufactures missing business facts. Changing context invalidates stale jobs through existing worker validation.

For the TripC staging smoke fixture, run `npm.cmd --prefix apps/api run db:seed-context` once after migrations. It creates a clearly synthetic approved source, RAG chunks/facts and a current context. If API/Web are already running and only the plan worker is missing, use `.\infra\staging\start-worker-live.ps1 -Mode fake`; this keeps the real HTTP worker/AI boundary while the Python AI service returns deterministic fake outputs. After provider credentials are configured, use `-IntegrationMode production` so worker metrics jobs call the live internal sync endpoint.

The owner enables a 1–168 hour recurring schedule or clicks Run now. Every 30 seconds the worker calls the authenticated internal scheduler. A workspace advisory lock and deterministic task IDs prevent duplicate dispatch across concurrent ticks and restart. A suspended owner blocks automation. A cycle waits for outstanding work rather than opening overlapping campaigns.

## What runs automatically

1. Research is queued when a schedule is due.
2. A ready Research result queues Growth Lead strategy and Performance (using the latest `metrics.snapshot` artifact when available; otherwise the agent reports insufficient data).
3. A valid Growth Lead plan is validated by the existing campaign service and atomically opens SEO work.
4. SEO waits for the existing owner approval before Content opens. Publishing remains a separate owner-approved flow.
5. A usable Performance draft queues bounded learning using the latest `lead.aggregate`, if available. Missing data is reported, not invented. Applying learning recommendations still requires the existing explicit approval.
6. Community is event-driven: an authenticated connector posts a question. There is no live Facebook/Telegram connector bundled with this change.

Research without findings, a report without usable data and a plan the backend rejects are closed (the plan as `failed` with its code) so an unattended cycle never waits on them.

With the scheduler off, the Growth Lead page runs the same loop by hand: capture first-party metrics and run Performance, run Learning, then an owner approves the learning (on that page or in Review Queue) to open the next Research round. Rounds are capped at three and deduplicated per Performance/lead-aggregate pair.

### Autopilot (one request, no manual steps)

The owner enters a request once on Agent Operations ("Tự động 100% từ một yêu cầu"): objective, CTA, cycle, lead target and channels. `POST /v1/workspaces/:id/autopilot` makes the request the goal objective (issuing a new context when it changes), turns on the schedule with auto-approval and runs the first cycle. From then on, per cycle:

- grounded, non-synthetic SEO/Content drafts of the current context without missing facts are approved, the SEO article is published to the workspace site and Content to Facebook when those channels are on;
- learning that proposes a round is accepted automatically, at most three rounds per scheduled cycle;
- each artifact gets one automated publishing attempt; a failed post (e.g. missing Page permission) stays failed for a person to retry.

Anything with missing facts, synthetic data or no citation still waits in Review Queue, and the cycle resumes once it is handled. The worker must run in autopilot mode, which adds the scheduler tick and publishing outbox to the draft worker:

```powershell
Stop-ScheduledTask -TaskName 'AI-Growth-OS Draft Worker'   # then stop the running draft-worker process
.\infra\staging\agents-host.ps1 -Component draft-worker -Autopilot -InstallTask
```

Pause from the same page ("Tạm dừng lịch"). Reinstalling the task without `-Autopilot` returns to manual drafts.

Turning the schedule off stops future scheduler handoffs and research cycles. Already queued/running work continues. This is not an emergency cancellation mechanism.

## API

- `GET /v1/workspaces/:id/automation`: settings and most recent 100 tasks with queue attempts, timings and errors; any active member.
- `PUT /v1/workspaces/:id/automation`: owner only. `{enabled, interval_hours, cta, auto_approve_outputs?, auto_publish_facebook?, auto_publish_website?, run_now?}`.
- `POST /v1/workspaces/:id/autopilot`: owner only. `{request, cta, interval_hours?, publish_website?, publish_facebook?, lead_target?}`; `lead_target` is required when the workspace has no goal yet.
- `POST /v1/workspaces/:id/automation`: active owner/editor connector event, deduplicated by `event_id`:

```json
{"event_id":"inbox-message-123","input":{"operation":"community.response","question":"Which areas suit newcomers?"}}
```

Metrics events use `{"operation":"analytics.report","metrics_artifact_id":"<workspace-scoped UUID>"}` as input. The connector must persist and validate its snapshot before sending an event. Bearer tokens stay on the connector server.

- `POST /internal/automation/tick`: worker only, using `AUTOMATION_INTERNAL_TOKEN`. Never expose this token to the browser.
- `POST /v1/workspaces/:id/measurement`: owner/editor. Creates (or reuses, within one hour) the first-party `metrics.snapshot` and `lead.aggregate` for the current context.
- `POST /v1/workspaces/:id/learning-tasks`: active owner only; body is the learning artifact ref. Validates the artifact, opens the proposed Research round, decides the pending approval and completes the learning task in one transaction. Replays return the same task.

Existing artifact/approval pages show outputs. Task retries reset the failed durable outbox entry; original AI idempotency and provider budgets still apply.

## Verification

```powershell
npm.cmd --prefix apps/api test -- tests/campaignPlans/automation.test.ts
# From apps/api, against a local account permitted to create a disposable DB:
$env:RUN_AUTOMATION_DB='1'
node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/campaignPlans/automation.pg.test.ts
```

The PostgreSQL test creates and drops only its own `automation_test_*` database. It covers concurrent scheduling, exactly-once Research enqueue, Research-to-strategy handoff, disabled scheduling and revoked ownership. These tests do not certify model quality or external publishing.
