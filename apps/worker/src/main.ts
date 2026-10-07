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
import { FakeAiAdapter } from './adapters/AiAdapter';
import { FileResultStorage } from './adapters/StorageAdapter';

async function main(): Promise<void> {
  const cfg = env();
  const store = new FileJobStore(cfg.WORKER_STATE_DIR);
  const storage = new FileResultStorage(cfg.WORKER_STATE_DIR);
  const runner = new JobRunner({
    store,
    storage,
    ai: new FakeAiAdapter(),
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
    console.log(`[worker] ${signal} received, stopping queue...`);
    await queue.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  console.log(
    `[worker] started queue=${cfg.QUEUE_NAME} state=${cfg.WORKER_STATE_DIR} provider=${cfg.AI_PROVIDER_MODE} hb=${cfg.HEARTBEAT_INTERVAL_MS}ms ttl=${cfg.HEARTBEAT_TTL_MS}ms`,
  );
}

export { submitJob } from './jobs';

if (require.main === module) {
  main().catch((err) => {
    console.error('[worker] fatal:', err);
    process.exit(1);
  });
}
