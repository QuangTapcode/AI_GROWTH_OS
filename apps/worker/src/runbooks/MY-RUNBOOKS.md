# Runbooks — Worker / Integration (MY-09 preparation)

> **Status:** Skeleton for MY-09. Contains procedures for start/stop, backup/restore, credential rotation, retry/resume, manual fallback, and support matrix.
> **Owner:** Mỹ (BE worker + tích hợp). Reviewer: Thiệu Quang + Quang Quang.

---

## 1. Start / Stop

### Start worker (local)
```powershell
cd apps/worker
npm.cmd ci
Copy-Item .env.example .env.local
# Required env:
# DATABASE_URL=postgres://... (for pg-boss / DbWorkflowStore)
# AI_SERVICE_BASE_URL=http://127.0.0.1:5000
# INTERNAL_AI_AUTH_TOKEN=...
# AI_PROVIDER_MODE=fake (default) or live
npm.cmd run dev
```

### Start all three apps (staging)
```powershell
.\infra\staging\start.ps1
```

### Stop
```powershell
.\infra\staging\stop.ps1
```

### Health check
```
GET http://localhost:4000/v1/health
```
Returns `scope: process_only` — does **not** confirm DB, queue, or AI connection.

---

## 2. Backup / Restore

### Database backup (PostgreSQL)
```bash
pg_dump -h localhost -p 15432 -U ai_growth_dev ai_growth_db > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Database restore
```bash
psql -h localhost -p 15432 -U ai_growth_dev ai_growth_db < backup_file.sql
```

### Migration rollback (003 down only)
```bash
cd apps/api
npm.cmd run migrate -- --rollback 003
```
> Only drops tables/columns added by migration 003. Does not touch 001 or 002.

---

## 3. Credential Rotation

### Internal AI auth token
- Env var: `INTERNAL_AI_AUTH_TOKEN`
- Rotate: update `.env.local`, restart AI service and worker.
- Never commit token to git. `.env` is git-ignored.

### CMS / social connector credentials
- Stored in `connectors.encrypted_credentials` (server-side only).
- Rotation: update encrypted value via API, mark `connection_status = 'configured'`, then verify → `'verified'`.
- Never put credentials in AI prompt or logs.

---

## 4. Retry / Resume

### Job retry policy
- Max 2 attempts per run (CR-001).
- Max 2 LLM calls per job_id (persisted across restart).
- Retry only recoverable errors: 429, 5xx, network, poll timeout.
- Non-recoverable: 4xx (INVALID_PAYLOAD, IDEMPOTENCY_CONFLICT, UNAUTHORIZED, etc.).

### Manual resume
Worker `WorkflowRunner.resume()` runs only failed steps, not entire campaign.
Use `requeueFailed()` for step-level retry.

---

## 5. Manual Fallback

### Social publish (FB/IG) — manual pack
Per MY-02 connector spike: FB/IG/GA4/GSC/Meta Ads have no real credentials.
When live publish fails, `MockCmsPublisher` generates a **manual pack** labeled `manual-pack`.
Editor copies caption → posts manually → records external post ID in dashboard.

### Lead intake — form fallback
If webhook/DB is down, store lead submission in file queue and replay when DB recovers.
Idempotency key prevents duplicate leads on replay.

---

## 6. Support Matrix (real, not faked)

| Connector | Status | Credentials | Notes |
|-----------|--------|-------------|-------|
| Website (Next.js CMS) | Verified | N/A | Internal CMS, full control |
| Facebook | Missing | Not configured | Manual pack only |
| Instagram | Missing | Not configured | Manual pack only |
| GA4 | Missing | Property ID not provided | `insufficient_data` label |
| GSC | Missing | Site not verified | `insufficient_data` label |
| Meta Ads | Missing | No ad account | Read-only, no spend |

> **Rule:** Missing data is labeled `insufficient_data`, never faked. No synthetic numbers in production.

---

## 7. Escalation Contacts

| Role | Name | Area |
|------|------|------|
| BE Lead | Thiệu Quang | API, contracts, migrations |
| Worker Lead | Mỹ | Worker, publisher, connectors |
| AI Lead | Quang Quang | AI service, prompts, eval |
| QA | Thiệu | Test evidence, UAT verdict |
| BA | Dương | AC, business rules, facts |

---

## 8. Known Limitations (pilot)

- One AI process only (concurrency = 1).
- No paid cloud fallback; Ollama local only.
- No video render, CRM/calendar, live spend, rich editor.
- Domain/GA4/GSC properties not yet provisioned.
- Social live publish not available; manual pack fallback.