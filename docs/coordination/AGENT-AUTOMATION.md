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
6. Community is event-driven: an authenticated connector posts a question. There is no live Facebook/Telegram connector bundled with this change. The worker sends the vectors stored at ingest, so the AI service embeds only the question; if embedding fails or a corpus has no vectors, sources are found by keyword and the run carries a `RETRIEVAL_KEYWORDS_ONLY*` warning. The similarity thresholds were measured on one corpus (`embeddinggemma`, 430 chunks, 17 questions); re-measure them after changing the embedding model.

Research without findings, a report without usable data and a plan the backend rejects are closed (the plan as `failed` with its code) so an unattended cycle never waits on them.

With the scheduler off, the Growth Lead page runs the same loop by hand: capture first-party metrics and run Performance, run Learning, then an owner approves the learning (on that page or in Review Queue) to open the next Research round. Rounds are capped at three and deduplicated per Performance/lead-aggregate pair.

### Autopilot (one request, no manual steps)

The owner enters a request once on Agent Operations ("Tự động 100% từ một yêu cầu"): objective, CTA, cycle, lead target and channels. `POST /v1/workspaces/:id/autopilot` makes the request the goal objective (issuing a new context when it changes), turns on the schedule with auto-approval and runs the first cycle. From then on, per cycle:

- grounded, non-synthetic SEO/Content drafts of the current context without missing facts are approved, the SEO article is published to the workspace site and Content to Facebook when those channels are on;
- learning that proposes a round is accepted automatically, at most three rounds per scheduled cycle;
- each artifact gets one automated publishing attempt; a failed post (e.g. missing Page permission) stays failed for a person to retry.

Anything with missing facts, synthetic data or no citation still waits in Review Queue, and the cycle resumes once it is approved or rejected. A draft nobody reviews for one whole extra cycle expires (`REVIEW_TIMEOUT`): it stays readable, is never published, and the schedule moves on. The worker must run in autopilot mode, which adds the scheduler tick and publishing outbox to the draft worker:

```powershell
Stop-ScheduledTask -TaskName 'AI-Growth-OS Draft Worker'   # then stop the running draft-worker process
.\infra\staging\agents-host.ps1 -Component draft-worker -Autopilot -InstallTask
```

Pause from the same page ("Tạm dừng lịch"). Reinstalling the task without `-Autopilot` returns to manual drafts.

In autopilot mode the worker also:

- **Imports new first-party articles** every 6 hours (`BLOG_SYNC_HOURS`): it browses `https://tripc.ai/blog` and queues articles a workspace does not have yet, for workspaces that already use the blog; an article still listed whose render failed gets fresh attempts. Articles under `FIRST_PARTY_AUTO_APPROVE_PREFIXES` (default `https://tripc.ai/blog/`, owner decision 30/10) are approved on ingest; any other source still waits for the owner. A cycle that finds newly approved sources starts on a fresh context.
- **Sends approved Messenger and Telegram replies** queued as `community.reply` outbox events; a message becomes `replied` only after the platform accepted the reply, escalations are never sent and a refusal is recorded once, not resent.

Copy checks before approval: a cut-off copy of the CTA and sentences ending mid-word are removed, a location split by the model ("Da N-ang") is respelled as in the profile, and research coverage notes no longer make an SEO article `insufficient_data`. Learning opens at most one round per measurement snapshot, and none when nothing was measured (`no_measured_signal`); the next scheduled cycle runs as usual.

Measured priority: Growth Lead reads the latest metrics snapshot. No traffic: the plan goes for the topic people can find (`reach`); traffic below target: the topic closest to the offer (`conversion`); targets reached: `maintain`. The plan reports `priority` and `kpi_progress`.

Per-article numbers: the snapshot carries `content_metrics` (views and CTA clicks per published article, counts only). Learning turns them into `lessons` (articles readers acted on, articles they only read), which go to the Research round it opens.

Article length: a live draft under 250 words gets one more call asking for more of the source details, and the longer article is kept. One still under 150 words is `insufficient_data` with `article_too_short`, so it waits for a person instead of failing at publish. The publish gate stays for older drafts: such an article is approved but not published (`WEBSITE_NOT_PUBLISHED: ARTICLE_TOO_SHORT` appears as a scheduler warning); a refusal never stops the tick. Reviews on superseded contexts or finished tasks are closed automatically. Public sites come from `PUBLIC_SITES_JSON` in the API; the pilot site is `noindex` unless `SITE_INDEXABLE=true`, and `NEXT_PUBLIC_SITE_URL` enables its sitemap. Each post links up to three related posts.

Content: an image in the pack's `image_assets` goes out with the Facebook post, but nothing feeds that list yet: no route or screen supplies approved photos, so posts go out as text unless an AI illustration was approved. A pack targeting TikTok gets a model-written script (own provider call, never at the cost of the Facebook post); so does a Facebook-only pack on autopilot (`draft_tiktok_script`), for the reviewer. Filming and publishing stay manual. A job may make three model calls (CR-005); a call the job can do without is skipped when one slow call would no longer fit before the deadline. A pack without an approved image carries `image_suggestion`.

AI illustrations are off by default because each is paid for and stored publicly. `AI_IMAGE_GENERATION=on` also needs `REPLICATE_API_TOKEN`, the `R2_*` settings and Tesseract on the AI host; whatever is missing is named in `AI_IMAGE_SKIPPED:<code>` and the post is unaffected. An image with lettering on all three attempts is dropped (`AI_IMAGE_REJECTED:3`). A draft with `generated_image` always waits for a person, shows the image in Review Queue and is declared as AI when posted; runs with auto-approval on generate none. Replicate and R2 are tested against fake HTTP only until real keys exist.

Source faithfulness: besides the word-level check, a sentence tying two names together with a claim is removed unless one source entry holds both ("Quán Thảo serves mì quảng" when mì quảng belongs to another entry), and so is praise no source gives ("hidden gem"). Plain lists of names are kept, and places the business serves count for every entry. Content reads only the source entries about its article, so a post about one restaurant does not wander to the others on the page; a sentence of six or more content words needs half of them in what it read. These checks are lexical too: they catch these mix-ups and most padding, not every wrong reading (a short "classic dishes like banh mi" got through once in three real runs, and an SEO article can still add a comparison its sources never make). Keep a person reviewing until a stronger check exists.

TikTok length: the draft schema holds the model to four scenes of at least 170 characters while it writes, and code still accepts a shorter answer. On a thin source the checks above can leave the script under 120 words (108-111 on real runs); it is then flagged `TIKTOK_SCRIPT_LENGTH`, not padded.

Post links: a Facebook post links to the article it was written from, at `PUBLIC_SITE_URL/posts/<slug>` with UTM parameters. Without a public address or a published parent article it goes out with no link. The approved text is never edited to add one.

Community follow-ups: the last 3 messages of the same person on the same channel go to the model as history, with a reply only if it was really sent. History steers which source is read; whether a source answers is decided by the current question. A bare greeting is answered from the sources. A grounded reply to a lead is sent automatically when auto-approval is on, and that lead is stored as `consent_accepted=false` because nobody verified consent.

Customer signals: Research also receives up to 15 recent customer questions and website-lead topics, with e-mail addresses and phone numbers removed. They may suggest a need but are never evidence.

Extra task in a cycle: a Performance report with a measured window also queues `experiment.hypothesis`, which is not part of the Growth Lead plan. The scheduler queues no article beyond the plan's. `content.refresh` runs only when requested through the API, and one whose title matches a published article updates that article in place.

No newsletter exists: nothing sends e-mail to leads, so publishing an article changes no lead's status and records no send.

Goal focus: when the request names an offer (`goal.focus_offers`, e.g. food), Research reads excerpts about it first, drops ideas whose quote is about something else and reports `goal_focus_sources_exhausted:<offer>` instead of moving to another topic; Growth Lead ranks those findings first. An article on the offer does not retire it, only each excerpt it used. SEO writes from up to four approved excerpts about the topic. Community replies drop cut-off sentences, other scripts and unsupported claims, and go to a person when the answer is missing, guessed or about something no source mentions.

Agent Operations shows alerts derived from stored state: worker not ticking for 3 minutes, scheduler error, an overdue cycle waiting on a review, expired drafts, and failed publishing, Community replies or agent tasks in the last 24 hours.

### Messenger webhook

`GET/POST /v1/webhooks/facebook` (public URL `https://aigrowthos-staging.pages.dev/v1/webhooks/facebook`). Configure in `apps/api/.env.local`: `FACEBOOK_WEBHOOK_VERIFY_TOKEN` (any secret string also entered in the Meta app), `FACEBOOK_APP_SECRET` (signature check), `FACEBOOK_PAGE_ID`, `FACEBOOK_WEBHOOK_WORKSPACE_ID`, and a Page token with `pages_messaging`. Signed messages enter the Community inbox; echoes and unsigned requests are ignored.

### Telegram webhook

`POST /v1/webhooks/telegram` (public URL `https://aigrowthos-staging.pages.dev/v1/webhooks/telegram`). Configure in `apps/api/.env.local`: `TELEGRAM_BOT_TOKEN` (from @BotFather), `TELEGRAM_WEBHOOK_SECRET` (1-256 characters from `A-Za-z0-9_-`) and `TELEGRAM_WEBHOOK_WORKSPACE_ID`, apply `database/migrations/020_community_telegram.sql`, restart API and worker, then register the webhook once from `apps/api` with `npm run telegram:webhook`.

- People message the bot, or a Telegram account connected to it: enable Secretary Mode for the bot in @BotFather, then connect the bot from the account's Telegram settings with permission to reply. Replies to such a chat go out from that account.
- Private text messages enter the Community inbox and follow the same draft, approval and send path as Messenger. Commands, group chats, edits, non-text messages, other bots and what the connected account writes itself are ignored; a request without the secret gets 401.
- Sending runs only in the AUTOPILOT worker and needs `TELEGRAM_BOT_TOKEN` there; `infra/staging/start-agents.ps1` passes it from `apps/api/.env.local`.

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

The publishing outbox has the same kind of test (it claims any pending publishing event, so it only runs against its own `publish_test_*` database):

```powershell
# From apps/worker
$env:RUN_PUBLISH_DB='1'
node --env-file=../api/.env.local node_modules/vitest/vitest.mjs run tests/publishingOutbox.pg.test.ts
```

The PostgreSQL test creates and drops only its own `automation_test_*` database. It covers concurrent scheduling, exactly-once Research enqueue, Research-to-strategy handoff, disabled scheduling and revoked ownership. These tests do not certify model quality or external publishing.
