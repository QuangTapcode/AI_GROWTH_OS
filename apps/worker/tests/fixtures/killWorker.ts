/**
 * Fixture chạy trong child process riêng (W1-MY-01 kill test):
 * claim job → ghi progress 30 → gọi provider 1 lần → treo vô hạn.
 * Test cha sẽ SIGKILL process này để mô phỏng worker chết giữa chừng.
 *
 * Usage: tsx killWorker.ts <stateDir> <jobId>
 */
import { FileJobStore } from '../../src/jobs/JobStore';
import { JobRunner } from '../../src/jobs/JobRunner';
import { FileResultStorage } from '../../src/adapters/StorageAdapter';
import { FakeAiAdapter } from '../../src/adapters/AiAdapter';

async function main(): Promise<void> {
  const [stateDir, jobId] = process.argv.slice(2);
  if (!stateDir || !jobId) {
    console.error('usage: killWorker <stateDir> <jobId>');
    process.exit(2);
  }
  const store = new FileJobStore(stateDir);
  const runner = new JobRunner({
    store,
    storage: new FileResultStorage(stateDir),
    ai: new FakeAiAdapter(),
    heartbeatIntervalMs: 30,
    leaseTtlMs: 3_600_000, // con này không tự recover; cha lo phần đó
    executionTimeoutMs: 3_600_000,
    maxProviderCallsPerJob: 2,
  });

  // Không enqueue: chạy thẳng job đã được cha tạo trong store.
  void runner.run(jobId, async (ctx) => {
    await ctx.progress(30);
    await ctx.ai.run({ operation: ctx.job.operation, input: ctx.job.payload });
    console.log('KILL_FIXTURE_READY');
    await new Promise(() => {}); // treo vô hạn — chờ SIGKILL từ test cha
    return { unreachable: true };
  });
}

void main();