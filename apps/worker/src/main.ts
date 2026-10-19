#!/usr/bin/env node
/**
 * Worker entrypoint (W1-MY-01):
 * - pg-boss queue (Postgres) làm transport; JobStore làm nguồn sự thật.
 * - JobRunner: heartbeat + retry + budget + result_ref.
 * - Recovery sweep định kỳ cho job của worker đã bị kill.
 * - Graceful shutdown SIGINT/SIGTERM: dừng nhận message mới rồi stop queue.
 *
 * Lưu ý: FileJobStore/FileResultStorage sống trong WORKER_STATE_DIR; khi
 * database migrations (W1-BE-01, Thiệu Quang) sẵn sàng, thay bằng store DB.
 */
import { env } from './config';
import {
  createQueue,
  QueueJobs,
  JobRunner,
  FileJobStore,
  buildOperationHandlers,
  queueNameForOperation,
} from './jobs';
import { PgBossQueue, type QueueTransport } from './adapters/QueueAdapter';
import { FakeAiAdapter, type AiAdapter } from './adapters/AiAdapter';
import { HttpAiAdapter } from './adapters/HttpAiAdapter';
import { FileResultStorage } from './adapters/StorageAdapter';
import { DbWorkflowStore } from './workflow';
import { Pool } from 'pg';
import { PlanOutboxRunner } from './workflow/PlanOutboxRunner';

/** Workflow DB store (MY-03) — khởi tạo ở worker start để verify kết nối Postgres. */
let workflowStore: DbWorkflowStore | null = null;

/** Chọn AI adapter theo config: fake (mặc định) | live (HTTP CR-001). */
function buildAiAdapter(cfg: ReturnType<typeof env>): AiAdapter {
  if (cfg.AI_PROVIDER_MODE === 'live') {
    return new HttpAiAdapter({
      baseUrl: cfg.AI_SERVICE_BASE_URL,
      token: cfg.INTERNAL_AI_AUTH_TOKEN || undefined,
      pollIntervalMs: cfg.AI_HTTP_POLL_INTERVAL_MS,
      pollTimeoutMs: cfg.AI_HTTP_POLL_TIMEOUT_MS,
      requestTimeoutMs: cfg.AI_HTTP_REQUEST_TIMEOUT_MS,
    });
  }
  return new FakeAiAdapter();
}

async function main(): Promise<void> {
  const cfg = env();
  const planPool = new Pool({ host: cfg.QUEUE_HOST, port: cfg.QUEUE_PORT, user: cfg.QUEUE_USER,
    password: cfg.QUEUE_PASSWORD, database: cfg.QUEUE_DATABASE });
  const planOutbox = new PlanOutboxRunner(planPool, buildAiAdapter(cfg));
  let planRunning = false;
  const planTimer = setInterval(() => {
    // A fake echo adapter has no signed AI artifacts; only HTTP-backed workers consume plans.
    if (cfg.AI_PROVIDER_MODE !== 'live' || planRunning) return;
    planRunning = true;
    void planOutbox.runOnce().catch(error => console.error('[plan-outbox]', (error as Error).message))
      .finally(() => { planRunning = false; });
  }, 1000);
  planTimer.unref();
  let automationRunning = false;
  const automationTimer = setInterval(() => {
    if (automationRunning || !process.env.AUTOMATION_INTERNAL_TOKEN || !process.env.API_BASE_URL) return;
    automationRunning = true;
    const base = process.env.API_BASE_URL.replace(/\/v1\/?$/, '').replace(/\/$/, '');
    void fetch(`${base}/internal/automation/tick`, { method: 'POST',
      headers: { Authorization: `Bearer ${process.env.AUTOMATION_INTERNAL_TOKEN}` },
      signal: AbortSignal.timeout(25000) }).then(response => {
        if (!response.ok) throw new Error(`Automation scheduler HTTP ${response.status}`);
      }).catch(error => console.error('[automation]', (error as Error).message))
      .finally(() => { automationRunning = false; });
  }, 30000);
  automationTimer.unref();
  // Wire DbWorkflowStore (MY-03): verify Postgres connection at startup.
  workflowStore = new DbWorkflowStore();
  try {
    await workflowStore.getWorkflow('__worker_probe__');
    console.log('[worker] DbWorkflowStore connected OK');
  } catch (err) {
    console.warn('[worker] DbWorkflowStore not available:', err);
  }

  const store = new FileJobStore(cfg.WORKER_STATE_DIR);
  const storage = new FileResultStorage(cfg.WORKER_STATE_DIR);
  const runner = new JobRunner({
    store,
    storage,
    ai: buildAiAdapter(cfg),
    handlers: buildOperationHandlers(),
    heartbeatIntervalMs: cfg.HEARTBEAT_INTERVAL_MS,
    leaseTtlMs: cfg.HEARTBEAT_TTL_MS,
    executionTimeoutMs: cfg.JOB_EXECUTION_TIMEOUT_MS,
    maxProviderCallsPerJob: cfg.MAX_PROVIDER_CALLS_PER_JOB,
  });
  const queue = new PgBossQueue(createQueue());
  await queue.start();

  const handlers = buildOperationHandlers();
  const queueNames = Object.values(QueueJobs);
  for (const name of queueNames) {
    await queue.register(name, async (data) => {
      const jobId = typeof data.job_id === 'string' ? data.job_id : null;
      if (!jobId) throw new Error('MISSING_JOB_ID');
      const job = await store.get(jobId);
      if (!job) throw new Error('JOB_NOT_FOUND');
      const handler = handlers[job.operation];
      const outcome = await runner.run(jobId, handler);
      // Retry có delay → re-enqueue attempt kế tiếp
      if (outcome.status === 'retrying' && outcome.retry_after_ms !== null && outcome.retry_after_ms >= 0) {
        await queue.enqueue(queueNameForOperation(job.operation), { job_id: jobId }, {
          startAfterMs: outcome.retry_after_ms,
        });
      }
    });
  }

  // Recovery sweep: job của worker bị kill giữa chừng → requeue
  const sweep = setInterval(() => {
    void runner.recoverStale(cfg.HEARTBEAT_TTL_MS).then((recovered) => {
      for (const job of recovered) {
        if (job.status === 'retrying') {
          void queue.enqueue(queueNameForOperation(job.operation), { job_id: job.id }, {
            startAfterMs: job.retry_after_ms ?? 0,
          });
        }
      }
    });
  }, Math.max(cfg.HEARTBEAT_INTERVAL_MS, 1_000));
  sweep.unref();

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    clearInterval(sweep);
    clearInterval(planTimer);
    clearInterval(automationTimer);
    console.log(`[worker] ${signal} received, stopping queue...`);
    await queue.stop();
    await planPool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  console.log(
    `[worker] started queue=${cfg.QUEUE_NAME} state=${cfg.WORKER_STATE_DIR} provider=${cfg.AI_PROVIDER_MODE} hb=${cfg.HEARTBEAT_INTERVAL_MS}ms ttl=${cfg.HEARTBEAT_TTL_MS}ms`,
  );
}

export { submitJob } from './jobs';
export { workflowStore };

if (require.main === module) {
  main().catch((err) => {
    console.error('[worker] fatal:', err);
    process.exit(1);
  });
}
