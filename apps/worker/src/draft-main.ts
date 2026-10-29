/**
 * Draft execution: AI task outbox and source ingest. Automation ticks and publishing run only with
 * AUTOPILOT=1; even then the owner's automation settings in the database decide what is approved
 * and published.
 */
import { Pool } from 'pg';
import { HttpAiAdapter } from './adapters/HttpAiAdapter';
import { PublishingOutboxRunner } from './publish/PublishingOutboxRunner';
import { PlanOutboxRunner } from './workflow/PlanOutboxRunner';
import { SourceIngestRunner } from './workflow/SourceIngestRunner';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const baseUrl = process.env.AI_SERVICE_BASE_URL || 'http://127.0.0.1:5000';
  const ready = await fetch(`${baseUrl}/readyz`, { signal: AbortSignal.timeout(10000) });
  if (!ready.ok) throw new Error('AI service is not ready; no queued task has been claimed');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('SELECT 1');
  const ai = new HttpAiAdapter({ baseUrl, token: process.env.INTERNAL_AI_AUTH_TOKEN || undefined,
    pollIntervalMs: 1000, pollTimeoutMs: 650000, requestTimeoutMs: 15000 });
  const plan = new PlanOutboxRunner(pool, ai), ingest = new SourceIngestRunner(pool, ai);
  let planBusy = false, ingestBusy = false;
  const timers = [setInterval(() => {
    if (planBusy) return;
    planBusy = true;
    void plan.runOnce().then(result => { if (result) console.log('[draft-worker] completed', result.task_id); })
      .catch(error => console.error('[draft-worker]', error.message)).finally(() => { planBusy = false; });
  }, 1000), setInterval(() => {
    if (ingestBusy) return;
    ingestBusy = true;
    void ingest.runOnce().then(result => { if (result) console.log('[draft-ingest]', result.source_id, result.status); })
      .catch(error => console.error('[draft-ingest]', error.message)).finally(() => { ingestBusy = false; });
  }, 5000)];

  const autopilot = process.env.AUTOPILOT === '1';
  if (autopilot) {
    const apiBase = process.env.API_BASE_URL?.replace(/\/v1\/?$/, '').replace(/\/$/, '');
    const token = process.env.AUTOMATION_INTERNAL_TOKEN;
    if (!apiBase || !token) throw new Error('AUTOPILOT=1 requires API_BASE_URL and AUTOMATION_INTERNAL_TOKEN');
    const publishing = new PublishingOutboxRunner(pool);
    let tickBusy = false, publishBusy = false;
    timers.push(setInterval(() => {
      if (tickBusy) return;
      tickBusy = true;
      void fetch(`${apiBase}/internal/automation/tick`, { method: 'POST', headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(25000) }).then(response => {
        if (!response.ok) throw new Error(`scheduler HTTP ${response.status}`);
      }).catch(error => console.error('[autopilot]', (error as Error).message)).finally(() => { tickBusy = false; });
    }, 30000), setInterval(() => {
      if (publishBusy) return;
      publishBusy = true;
      void publishing.runOnce().then(result => { if (result !== 'idle') console.log('[publishing-outbox]', result); })
        .catch(error => console.error('[publishing-outbox]', (error as Error).message)).finally(() => { publishBusy = false; });
    }, 5000));
  }
  const stop = () => { timers.forEach(clearInterval); void pool.end().finally(() => process.exit(0)); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  console.log(autopilot
    ? '[draft-worker] ready; AUTOPILOT: scheduler tick and publishing enabled, governed by workspace automation settings'
    : '[draft-worker] ready; automatic approval, automation scheduler and publishing are disabled in this process');
}
void main().catch(error => { console.error('[draft-worker] startup failed:', error.message); process.exit(1); });
