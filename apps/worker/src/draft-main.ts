/**
 * Draft execution: AI task outbox and source ingest. Automation ticks and publishing run only with
 * AUTOPILOT=1; even then the owner's automation settings in the database decide what is approved
 * and published.
 */
import './loadApiEnv';
import { Pool } from 'pg';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { HttpAiAdapter } from './adapters/HttpAiAdapter';
import { CommunityReplyRunner } from './publish/CommunityReplyRunner';
import { PublishingOutboxRunner } from './publish/PublishingOutboxRunner';
import { listLinksWithBrowser } from './workflow/BrowserRenderer';
import { FirstPartyBlogSync } from './workflow/FirstPartyBlogSync';
import { PlanOutboxRunner } from './workflow/PlanOutboxRunner';
import { SourceIngestRunner } from './workflow/SourceIngestRunner';
import { GroupMetricsScheduler,loadGroupSchedule,groupErrorCode } from './metrics/GroupMetricsScheduler';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const baseUrl = process.env.AI_SERVICE_BASE_URL || 'http://127.0.0.1:5000';
  const ready = await fetch(`${baseUrl}/readyz`, { signal: AbortSignal.timeout(10000) });
  if (!ready.ok) throw new Error('AI service is not ready; no queued task has been claimed');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.on('error', (err) => {
    console.warn('[pg-pool idle error caught]', err.message);
  });
  await pool.query('SELECT 1');
  const ai = new HttpAiAdapter({ baseUrl, token: process.env.INTERNAL_AI_AUTH_TOKEN || undefined,
    pollIntervalMs: 1000, pollTimeoutMs: 650000, requestTimeoutMs: 15000 });
  const plan = new PlanOutboxRunner(pool, ai), ingest = new SourceIngestRunner(pool, ai);
  let planBusy = false, ingestBusy = false;
  let triggerTick = () => {};
  const timers = [setInterval(() => {
    if (planBusy) return;
    planBusy = true;
    void plan.runOnce().then(result => {
      if (result) {
        console.log('[draft-worker] completed', result.task_id);
        triggerTick();
      }
    }).catch(error => console.error('[draft-worker]', error.message)).finally(() => { planBusy = false; });
  }, 1000), setInterval(() => {
    if (ingestBusy) return;
    ingestBusy = true;
    void ingest.runOnce().then(result => { if (result) console.log('[draft-ingest]', result.source_id, result.status); })
      .catch(error => console.error('[draft-ingest]', error.message)).finally(() => { ingestBusy = false; });
  }, 5000)];

  const localGroupConfig=resolve(__dirname,'../.fb-group-metrics.json');
  const groupConfig=process.env.FACEBOOK_GROUP_METRICS_CONFIG||(existsSync(localGroupConfig)?localGroupConfig:undefined);
  if(groupConfig){
    try{
      const config=loadGroupSchedule(groupConfig);
      const groups=new GroupMetricsScheduler(pool,config,process.env.API_BASE_URL||'http://127.0.0.1:4000',process.env.AUTOMATION_INTERNAL_TOKEN||'');
      const sync=()=>void groups.tick().catch(error=>console.warn('[group-metrics]',groupErrorCode(error)));
      sync();timers.push(setInterval(sync,30000));
      console.log('[group-metrics] enabled; interval minutes:',config.interval_minutes,'targets:',config.targets.length);
    }catch(error){console.warn('[group-metrics] disabled:',groupErrorCode(error));}
  }
  const autopilot = process.env.AUTOPILOT !== '0';
  if (autopilot) {
    const apiBase = (process.env.API_BASE_URL || 'http://127.0.0.1:4000').replace(/\/v1\/?$/, '').replace(/\/$/, '');
    const token = process.env.AUTOMATION_INTERNAL_TOKEN;
    if (!apiBase || !token) throw new Error('AUTOPILOT=1 requires API_BASE_URL and AUTOMATION_INTERNAL_TOKEN');
    const publishing = new PublishingOutboxRunner(pool);
    const replies = new CommunityReplyRunner(pool);
    let replyBusy = false;
    const runReplies = () => {
      if (replyBusy) return;
      replyBusy = true;
      void replies.runOnce().then((result) => { if (result !== 'idle') console.log('[community-reply]', result); })
        .catch((error) => console.error('[community-reply]', (error as Error).message)).finally(() => { replyBusy = false; });
    };
    timers.push(setInterval(runReplies, 2000));
    const blogSync = new FirstPartyBlogSync(pool, listLinksWithBrowser);
    const syncBlog = () => void blogSync.runOnce()
      .then((result) => { if (result.imported) console.log('[blog-sync] imported', result.imported); })
      .catch((error) => console.error('[blog-sync]', (error as Error).message));
    syncBlog();
    timers.push(setInterval(syncBlog, Number(process.env.BLOG_SYNC_HOURS ?? 6) * 3_600_000));
    let tickBusy = false, publishBusy = false;
    triggerTick = () => {
      if (tickBusy) return;
      tickBusy = true;
      void fetch(`${apiBase}/internal/automation/tick`, { method: 'POST', headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(25000) }).then(response => {
        if (!response.ok) throw new Error(`scheduler HTTP ${response.status}`);
        runReplies();
      }).catch(error => console.error('[autopilot]', (error as Error).message)).finally(() => { tickBusy = false; });
    };
    timers.push(setInterval(triggerTick, 10000), setInterval(() => {
      if (publishBusy) return;
      publishBusy = true;
      void publishing.runOnce().then(result => { if (result !== 'idle') console.log('[publishing-outbox]', result); })
        .catch(error => console.error('[publishing-outbox]', (error as Error).message)).finally(() => { publishBusy = false; });
    }, 3000));
  }
  const stop = () => { timers.forEach(clearInterval); void pool.end().finally(() => process.exit(0)); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  console.log(autopilot
    ? '[draft-worker] ready; AUTOPILOT: scheduler tick and publishing enabled, governed by workspace automation settings'
    : '[draft-worker] ready; automatic approval, automation scheduler and publishing are disabled in this process');
}
void main().catch(error => { console.error('[draft-worker] startup failed:', error?.stack || error); process.exit(1); });
