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
import { TelegramBotRunner } from './publish/TelegramBotRunner';
import { startGroupBotBridge } from './publish/GroupBotBridge';
import { defaultReelRunner } from './publish/ReelOutboxRunner';
import { defaultVideoBuilder } from './publish/VideoBuilder';
import { listLinksWithBrowser } from './workflow/BrowserRenderer';
import { FirstPartyBlogSync } from './workflow/FirstPartyBlogSync';
import { PlanOutboxRunner } from './workflow/PlanOutboxRunner';
import { SourceIngestRunner } from './workflow/SourceIngestRunner';
import { MerchantTikTokCarouselRunner } from './publish/MerchantTikTokCarouselRunner';
import { GroupMetricsScheduler,loadGroupSchedule,groupErrorCode } from './metrics/GroupMetricsScheduler';
import { GroupCommentWatcher } from './publish/GroupCommentWatcher';

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
    pollIntervalMs: 250, pollTimeoutMs: 650000, requestTimeoutMs: 15000 });
  const plan = new PlanOutboxRunner(pool, ai), ingest = new SourceIngestRunner(pool, ai);
  let planBusy = false, ingestBusy = false;
  let triggerTick = () => {};
  let groupWatcher: GroupCommentWatcher | undefined;
  const runPlan = () => {
    if (planBusy) return;
    planBusy = true;
    void plan.runOnce().then(result => {
      if (result) {
        console.log('[draft-worker] completed', result.task_id);
        triggerTick();
      }
    }).catch(error => console.error('[draft-worker]', error.message)).finally(() => { planBusy = false; });
  };
  const timers = [setInterval(runPlan, 500), setInterval(() => {
    if (ingestBusy) return;
    ingestBusy = true;
    void ingest.runOnce().then(result => { if (result) console.log('[draft-ingest]', result.source_id, result.status); })
      .catch(error => console.error('[draft-ingest]', error.message)).finally(() => { ingestBusy = false; });
  }, 5000)];

  // New first-party articles become Research sources in draft mode too: importing a source publishes nothing.
  const blogSync = new FirstPartyBlogSync(pool, listLinksWithBrowser);
  const syncBlog = () => void blogSync.runOnce()
    .then((result) => { if (result.imported) console.log('[blog-sync] imported', result.imported); })
    .catch((error) => console.error('[blog-sync]', (error as Error).message));
  syncBlog();
  timers.push(setInterval(syncBlog, Number(process.env.BLOG_SYNC_HOURS ?? 6) * 3_600_000));

  // Group metrics run only when a schedule file is configured (see GroupMetricsScheduler).
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
    timers.push(setInterval(runReplies, 1000));
    let tickBusy = false, publishBusy = false;
    triggerTick = () => {
      if (tickBusy) return;
      tickBusy = true;
      void fetch(`${apiBase}/internal/automation/tick`, { method: 'POST', headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(25000) }).then(response => {
        if (!response.ok) throw new Error(`scheduler HTTP ${response.status}`);
        runPlan();
        runReplies();
      }).catch(error => console.error('[autopilot]', (error as Error).message)).finally(() => { tickBusy = false; });
    };
    timers.push(setInterval(triggerTick, 2500), setInterval(() => {
      if (publishBusy) return;
      publishBusy = true;
      void publishing.runOnce().then(result => { if (result !== 'idle') console.log('[publishing-outbox]', result); })
        .catch(error => console.error('[publishing-outbox]', (error as Error).message)).finally(() => { publishBusy = false; });
    }, 3000));

    let communityAutopilotBusy = false;
    const triggerCommunityAutopilot = () => {
      if (communityAutopilotBusy) return;
      communityAutopilotBusy = true;
      void fetch(`${apiBase}/internal/community/autopilot`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        // Group scans visit the admins page and several posts in a browser; 150 s was too short.
        signal: AbortSignal.timeout(290_000),
      })
        .then((res) => {
          if (!res.ok) throw new Error(`community autopilot HTTP ${res.status}`);
          runReplies();
        })
        .catch((error) => console.error('[community-autopilot]', (error as Error).message))
        .finally(() => { communityAutopilotBusy = false; });
    };
    timers.push(setTimeout(triggerCommunityAutopilot, 15_000), setInterval(triggerCommunityAutopilot, 180_000));

    // Near-instant Group replies: watch the bot account's comment notifications (GROUP_COMMENT_WATCH=0 turns it off).
    if (process.env.GROUP_COMMENT_WATCH !== '0') {
      void pool
        .query<{ group_url: string }>(
          `SELECT s.group_url FROM community_hub_settings s
             JOIN agent_automation a ON a.workspace_id = s.workspace_id AND a.enabled = TRUE
            WHERE s.auto_reply_comments IS DISTINCT FROM FALSE AND s.group_url LIKE '%/groups/%' LIMIT 1`,
        )
        .then(({ rows }) => {
          const groupId = rows[0]?.group_url.match(/\/groups\/([^/?#]+)/)?.[1];
          if (!groupId) return;
          groupWatcher = new GroupCommentWatcher({
            apiBase,
            token,
            groupId,
            pollMs: Number(process.env.GROUP_COMMENT_WATCH_MS ?? 8000),
            onIngested: () => { runReplies(); triggerTick(); },
          });
          return groupWatcher.start().then(() => console.log('[group-comment-watch] watching notifications for group', groupId));
        })
        .catch((error) => console.error('[group-comment-watch]', (error as Error).message));
    }
    // 8 agent merchant: API quyết định agent nào tới lượt (Drive 20', Maps 3', lịch đăng 1', báo cáo tối...).
    let merchantBusy = false;
    const triggerMerchantTick = () => {
      if (merchantBusy) return;
      merchantBusy = true;
      void fetch(`${apiBase}/internal/merchant/tick`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(280_000) })
        .then((res) => {
          if (!res.ok) throw new Error(`merchant tick HTTP ${res.status}`);
          runReplies();
        })
        .catch((error) => console.error('[merchant-agents]', (error as Error).message))
        .finally(() => { merchantBusy = false; });
    };
    timers.push(setTimeout(triggerMerchantTick, 10_000), setInterval(triggerMerchantTick, 60_000));

    // Zero-touch Google Drive -> AI Agent writing -> Google Maps Bot auto-publish loop
    let gmapsDriveBusy = false;
    const gmapsDriveIntervalMs = Number(process.env.GMAPS_DRIVE_SYNC_SECONDS ?? 60) * 1_000;
    const triggerGmapsDriveAutopilot = () => {
      if (gmapsDriveBusy) return;
      gmapsDriveBusy = true;
      void fetch(`${apiBase}/internal/gmaps/autopilot`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(210_000),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`gmaps drive autopilot HTTP ${res.status}`);
          const data = (await res.json().catch(() => null)) as { results?: Array<Record<string, unknown>> } | null;
          if (data?.results && data.results.length > 0) {
            console.log('[gmaps-drive-autopilot]', JSON.stringify(data.results));
          }
        })
        .catch((error) => console.error('[gmaps-drive-autopilot]', (error as Error).message))
        .finally(() => { gmapsDriveBusy = false; });
    };
    timers.push(setTimeout(triggerGmapsDriveAutopilot, 12_000), setInterval(triggerGmapsDriveAutopilot, gmapsDriveIntervalMs));
    const tiktokCarousel = new MerchantTikTokCarouselRunner(pool);
    let carouselBusy = false;
    timers.push(setInterval(() => {
      if (carouselBusy) return;
      carouselBusy = true;
      void tiktokCarousel.runOnce().then((r) => { if (r !== 'idle') console.log('[tiktok-carousel]', r); })
        .catch((error) => console.error('[tiktok-carousel]', (error as Error).message)).finally(() => { carouselBusy = false; });
    }, 15_000));
    // Each published Facebook post's topic video follows as its own Reel.
    const reels = defaultReelRunner(pool);
    let reelBusy = false;
    timers.push(setInterval(() => {
      if (reelBusy) return;
      reelBusy = true;
      void reels.runOnce().then(result => { if (result !== 'idle') console.log('[reels]', result); })
        .catch(error => console.error('[reels]', (error as Error).message)).finally(() => { reelBusy = false; });
    }, 5000));
  }
  // Videos are rendered ahead of the calendar (one per tick), so each new post has its video ready (VIDEO_BUILDER_DIR).
  const videos = defaultVideoBuilder();
  if (videos) {
    const everyMs = Number(process.env.VIDEO_BUILDER_MINUTES ?? 10) * 60_000;
    setTimeout(() => videos.tick(), 60_000);
    timers.push(setInterval(() => videos.tick(), everyMs));
  }
  // The API container cannot drive Edge; it sends Group Bot commands to this host (loopback only).
  const bridgeToken = process.env.AUTOMATION_INTERNAL_TOKEN;
  const bridgePort = Number(process.env.GROUP_BOT_BRIDGE_PORT ?? 4105);
  const bridge = bridgeToken && bridgePort > 0
    ? await startGroupBotBridge({ port: bridgePort, token: bridgeToken, workerDir: resolve(__dirname, '..') })
      .then((server) => { console.log('[group-bot-bridge] listening on 127.0.0.1:' + bridgePort); return server; })
      .catch((error) => { console.warn('[group-bot-bridge] disabled:', (error as Error).message); return null; })
    : null;
  const telegramBot = new TelegramBotRunner(pool, {
    onMessageIngested: () => {
      if (autopilot) triggerTick();
    },
  });
  telegramBot.start();
  const stop = () => {
    void groupWatcher?.stop();
    telegramBot.stop();
    bridge?.close();
    timers.forEach(clearInterval);
    void pool.end().finally(() => process.exit(0));
  };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  console.log(autopilot
    ? '[draft-worker] ready; AUTOPILOT: scheduler tick and publishing enabled, governed by workspace automation settings'
    : '[draft-worker] ready; automatic approval, automation scheduler and publishing are disabled in this process');
}
void main().catch(error => { console.error('[draft-worker] startup failed:', error?.stack || error); process.exit(1); });
