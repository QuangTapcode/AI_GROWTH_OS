import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { FileJobStore } from '../src/jobs/JobStore';
import { JobRunner } from '../src/jobs/JobRunner';
import { MemoryResultStorage, FileResultStorage } from '../src/adapters/StorageAdapter';
import { FakeAiAdapter } from '../src/adapters/AiAdapter';
import { createJobState } from '../src/jobs/JobState';
import { waitFor, sleep } from './helpers/waitFor';

/**
 * W1-MY-01 — kịch bản worker bị kill/dừng giữa chừng, KHÔNG cần API/schema ngoài:
 * A) in-process: trạng thái "chết" (running + heartbeat hết hạn) → recover → chạy lại.
 * B) process thật: spawn fixture → SIGKILL → state còn dở → recover → chạy lại.
 */

describe('kill/stop giữa chừng — recovery in-process', () => {
  it('job running với lease hết hạn → recoverStale requeue (attempt+1) rồi chạy lại thành công', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kill-rec-'));
    try {
      const store = new FileJobStore(dir);
      const ai = new FakeAiAdapter();
      const runner = new JobRunner({
        store,
        storage: new MemoryResultStorage(),
        ai,
        heartbeatIntervalMs: 10,
        leaseTtlMs: 1_000,
        executionTimeoutMs: 1_000,
        maxProviderCallsPerJob: 2,
        retry: { baseDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 },
      });

    // Mô phỏng worker chết giữa chừng: running, progress 30, đã tốn 1 provider call,
    // heartbeat cuối cách đây 10s (lease hết hạn).
    const job = createJobState({
      workspace_id: 'ws-1',
      organization_id: 'org-1',
      operation: 'research',
      payload: { q: 'housing' },
      max_attempts: 3,
    });
    await store.insert(job);
    const stale = new Date(Date.now() - 10_000);
    await store.update(job.id, {
      status: 'running',
      progress_percent: 30,
      provider_calls: 1,
      last_heartbeat_at: stale,
      updated_at: stale,
    });

    const recovered = await runner.recoverStale(1_000);
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      status: 'retrying',
      attempt: 2,
      error_code: 'WORKER_INTERRUPTED',
      result_ref: null,
    });

    // Chạy attempt 2 với handler thành công — budget còn 1 call (cap 2).
    const outcome = await runner.run(job.id, async (ctx) => {
      await ctx.ai.run({ operation: ctx.job.operation, input: ctx.job.payload });
      return { done: true };
    });
    expect(outcome.claimed).toBe(true);
    expect(outcome.status).toBe('completed');
    expect(outcome.attempt).toBe(2);
    const final = await store.get(job.id);
    expect(final!.result_ref).toBeTruthy();
    expect(final!.progress_percent).toBe(100);
    expect(final!.provider_calls).toBe(2); // 1 trước kill + 1 sau recovery
    expect(ai.calls).toHaveLength(1); // provider gọi đúng 1 lần sau recovery
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('attempt hết mà worker chết → failed WORKER_INTERRUPTED, không chạy lại', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'kill-rec-'));
    const store = new FileJobStore(dir);
    const runner = new JobRunner({
      store,
      storage: new MemoryResultStorage(),
      ai: new FakeAiAdapter(),
      heartbeatIntervalMs: 10,
      leaseTtlMs: 1_000,
      executionTimeoutMs: 1_000,
      maxProviderCallsPerJob: 2,
    });
    const job = createJobState({
      workspace_id: 'ws-1',
      organization_id: 'org-1',
      operation: 'research',
      max_attempts: 2,
      attempt: 2,
    });
    await store.insert(job);
    const stale = new Date(Date.now() - 10_000);
    await store.update(job.id, { status: 'running', last_heartbeat_at: stale, updated_at: stale });

    const recovered = await runner.recoverStale(1_000);
    expect(recovered[0]).toMatchObject({ status: 'failed', error_code: 'WORKER_INTERRUPTED', attempt: 2 });

    let called = 0;
    const outcome = await runner.run(job.id, async () => {
      called += 1;
      return 'x';
    });
    expect(called).toBe(0);
    expect(outcome.claimed).toBe(false);
    expect(outcome.status).toBe('failed');
    await rm(dir, { recursive: true, force: true });
  });
});

describe('kill -9 process thật (W1-MY-01)', () => {
  it(
    'SIGKILL giữa chừng → state còn running/progress → recover → chạy attempt sau completed',
    async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'kill-real-'));
      const store = new FileJobStore(dir);
      const job = createJobState({
        workspace_id: 'ws-1',
        organization_id: 'org-1',
        operation: 'research',
        payload: { q: 'housing' },
        max_attempts: 3,
      });
      await store.insert(job);

      const tsxCli = path.resolve(process.cwd(), 'node_modules/tsx/dist/cli.mjs');
      const fixture = path.resolve(process.cwd(), 'tests/fixtures/killWorker.ts');
      const child = spawn(process.execPath, [tsxCli, fixture, dir, job.id], {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });
      let childOutput = '';
      child.stdout.on('data', (d) => (childOutput += String(d)));
      child.stderr.on('data', (d) => (childOutput += String(d)));

      try {
        // Đợi fixture claim job + ghi progress 30 + tốn 1 provider call
        await waitFor(async () => {
          const j = await store.get(job.id);
          return !!j && j.status === 'running' && j.progress_percent >= 30 && j.provider_calls === 1;
        }, 30_000);

        // Giết process như worker bị kill thật — không có cleanup nào chạy
        child.kill('SIGKILL');
        await new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolve();
          child.once('exit', () => resolve());
        });

        // State dở dang được giữ nguyên: KHÔNG completed, KHÔNG result_ref
        const killed = await store.get(job.id);
        expect(killed).toMatchObject({
          status: 'running',
          attempt: 1,
          progress_percent: 30,
          result_ref: null,
          error_code: null,
        });
        expect(killed!.provider_calls).toBe(1);

        // Worker mới (process khác) recover job mất lease → retrying attempt 2
        await sleep(30); // vượt heartbeat cuối
        const ai = new FakeAiAdapter();
        const runner = new JobRunner({
          store,
          storage: new FileResultStorage(dir),
          ai,
          heartbeatIntervalMs: 10,
          leaseTtlMs: 1_000,
          executionTimeoutMs: 5_000,
          maxProviderCallsPerJob: 2,
          retry: { baseDelayMs: 0, maxDelayMs: 0, backoffFactor: 1 },
        });
        const recovered = await runner.recoverStale(1);
        expect(recovered).toHaveLength(1);
        expect(recovered[0]).toMatchObject({
          status: 'retrying',
          attempt: 2,
          error_code: 'WORKER_INTERRUPTED',
          result_ref: null,
        });

        // Chạy attempt 2 đến nơi: persist result rồi mới completed
        const outcome = await runner.run(job.id, async (ctx) => {
          await ctx.progress(80);
          await ctx.ai.run({ operation: ctx.job.operation, input: ctx.job.payload });
          return { recovered: true };
        });
        expect(outcome.claimed).toBe(true);
        expect(outcome.status).toBe('completed');

        const final = await store.get(job.id);
        expect(final).toMatchObject({ status: 'completed', attempt: 2, progress_percent: 100 });
        expect(final!.result_ref).toBeTruthy();
        expect(final!.provider_calls).toBe(2); // budget 1 (trước kill) + 1 (sau) ≤ cap 2
        expect(ai.calls).toHaveLength(1);
        const stored = await new FileResultStorage(dir).get(final!.result_ref!);
        expect(stored).toEqual({ recovered: true });
      } finally {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        await rm(dir, { recursive: true, force: true });
      }
    },
    60_000,
  );
});
