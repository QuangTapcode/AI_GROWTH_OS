import { describe, it, expect } from 'vitest';
import { JobRunner, PermanentJobError, JobTimeoutError, ProviderCallLimitError } from '../src/jobs/JobRunner';
import { MemoryJobStore } from '../src/jobs/JobStore';
import { createJobState, type JobState } from '../src/jobs/JobState';
import { MemoryResultStorage } from '../src/adapters/StorageAdapter';
import { FakeAiAdapter } from '../src/adapters/AiAdapter';
import { buildOperationHandlers } from '../src/jobs/operations';
import { sleep } from './helpers/waitFor';

interface Harness {
  store: MemoryJobStore;
  storage: MemoryResultStorage;
  ai: FakeAiAdapter;
  runner: JobRunner;
}

function makeHarness(
  over: Partial<ConstructorParameters<typeof JobRunner>[0]> = {},
  aiOver: ConstructorParameters<typeof FakeAiAdapter>[0] = {},
): Harness {
  const store = new MemoryJobStore();
  const storage = new MemoryResultStorage();
  const ai = new FakeAiAdapter(aiOver);
  const runner = new JobRunner({
    store,
    storage,
    ai,
    handlers: buildOperationHandlers(),
    heartbeatIntervalMs: 10,
    leaseTtlMs: 100,
    executionTimeoutMs: 1_000,
    maxProviderCallsPerJob: 2,
    retry: { baseDelayMs: 100, maxDelayMs: 500, backoffFactor: 2 },
    ...over,
  });
  return { store, storage, ai, runner };
}

async function insertJob(store: MemoryJobStore, over: Partial<Parameters<typeof createJobState>[0]> = {}): Promise<JobState> {
  const job = createJobState({
    workspace_id: 'ws-1',
    organization_id: 'org-1',
    operation: 'research',
    payload: { q: 'housing' },
    ...over,
  });
  await store.insert(job);
  return job;
}

/** Cho phép run() coi job là due (retry_after_ms > 0 chặn trước đó). */
async function makeDue(store: MemoryJobStore, id: string): Promise<void> {
  await store.update(id, { retry_after_ms: 0, updated_at: new Date() });
}

describe('JobRunner happy path (W1-MY-01)', () => {
  it('completed CHỈ sau khi result được persist (result_ref != null)', async () => {
    const h = makeHarness();
    const job = await insertJob(h.store);

    const outcome = await h.runner.run(job.id);

    expect(outcome.claimed).toBe(true);
    expect(outcome.status).toBe('completed');
    const final = await h.store.get(job.id);
    expect(final!.status).toBe('completed');
    expect(final!.result_ref).toBeTruthy();
    expect(final!.progress_percent).toBe(100);
    expect(final!.error_code).toBeNull();
    expect(h.storage.get(final!.result_ref!)).toMatchObject({ synthetic: true, operation: 'research' });
    expect(h.ai.calls).toHaveLength(1);
    expect(h.ai.calls[0].input).toEqual({ q: 'housing' });
  });

  it('progress được persist trong lúc chạy', async () => {
    const h = makeHarness();
    const job = await insertJob(h.store);

    let midProgress = -1;
    const outcome = await h.runner.run(job.id, async (ctx) => {
      await ctx.progress(45);
      midProgress = (await h.store.get(job.id))!.progress_percent;
      return { ok: true };
    });

    expect(midProgress).toBe(45);
    expect(outcome.status).toBe('completed');
    expect((await h.store.get(job.id))!.progress_percent).toBe(100);
  });
});

describe('JobRunner retry (W1-MY-01)', () => {
  it('handler lỗi → retrying với backoff; quá hạn chưa chạy; chạy lại thành công', async () => {
    const h = makeHarness();
    const job = await insertJob(h.store);

    const failOutcome = await h.runner.run(job.id, async () => {
      throw new Error('boom');
    });
    expect(failOutcome.status).toBe('retrying');
    expect(failOutcome.attempt).toBe(2);
    expect(failOutcome.retry_after_ms).toBe(100);
    expect(failOutcome.result_ref).toBeNull();
    const afterFail = await h.store.get(job.id);
    expect(afterFail!.error_code).toBe('JOB_EXECUTION_FAILED');
    expect(afterFail!.error_message).toBe('boom');
    expect(afterFail!.status).not.toBe('completed');

    // chưa đến hạn retry → skip, không chạy handler
    let called = 0;
    const notDue = await h.runner.run(job.id, async () => {
      called += 1;
      return 'x';
    });
    expect(notDue.claimed).toBe(false);
    expect(called).toBe(0);

    // qua hạn → chạy attempt 2 thành công
    await sleep(120);
    const okOutcome = await h.runner.run(job.id, async () => 'recovered');
    expect(okOutcome.claimed).toBe(true);
    expect(okOutcome.status).toBe('completed');
    expect(okOutcome.attempt).toBe(2);
    expect(okOutcome.result_ref).toBeTruthy();
  });

  it('lỗi permanent → failed ngay, không retry', async () => {
    const h = makeHarness();
    const job = await insertJob(h.store);

    const outcome = await h.runner.run(job.id, async () => {
      throw new PermanentJobError('bad input');
    });

    expect(outcome.status).toBe('failed');
    expect(outcome.attempt).toBe(1);
    expect(outcome.error_code).toBe('PERMANENT_FAILURE');
    expect((await h.store.get(job.id))!.status).toBe('failed');
  });

  it('hết max_attempts → failed, không tăng attempt vượt cap', async () => {
    const h = makeHarness();
    const job = await insertJob(h.store, { max_attempts: 2 });

    await h.runner.run(job.id, async () => {
      throw new Error('fail 1');
    });
    await makeDue(h.store, job.id);
    const last = await h.runner.run(job.id, async () => {
      throw new Error('fail 2');
    });

    expect(last.status).toBe('failed');
    expect(last.attempt).toBe(2); // attempt max là 2, không nhảy lên 3
    expect(last.error_code).toBe('JOB_EXECUTION_FAILED');
  });
});

describe('JobRunner budget/timeout/idempotency (W1-MY-01)', () => {
  it('budget provider-call persist qua retry: retry không reset và chặn call thứ 3', async () => {
    // adapter luôn fail để job phải retry nhiều lần
    const h = makeHarness({ maxProviderCallsPerJob: 2 }, { failuresBeforeSuccess: 99 });
    const job = await insertJob(h.store);

    const r1 = await h.runner.run(job.id, async (ctx) => {
      await ctx.ai.run({ operation: 'research', input: {} });
      return 'never';
    });
    expect(r1.status).toBe('retrying');
    expect((await h.store.get(job.id))!.provider_calls).toBe(1);
    expect(h.ai.calls).toHaveLength(1);

    await makeDue(h.store, job.id);
    const r2 = await h.runner.run(job.id, async (ctx) => {
      await ctx.ai.run({ operation: 'research', input: {} });
      return 'never';
    });
    expect(r2.status).toBe('retrying');
    expect((await h.store.get(job.id))!.provider_calls).toBe(2);
    expect(h.ai.calls).toHaveLength(2);

    // attempt 3: vượt budget → ProviderCallLimitError (permanent) KHÔNG gọi provider thứ 3
    await makeDue(h.store, job.id);
    const r3 = await h.runner.run(job.id, async (ctx) => {
      await ctx.ai.run({ operation: 'research', input: {} });
      return 'never';
    });
    expect(r3.status).toBe('failed');
    expect(r3.error_code).toBe('PROVIDER_CALL_LIMIT_EXCEEDED');
    expect(h.ai.calls).toHaveLength(2); // không có call thứ 3
    expect((await h.store.get(job.id))!.provider_calls).toBe(2);
  });

  it('handler treo quá JOB_EXECUTION_TIMEOUT → retry với JOB_TIMEOUT', async () => {
    const h = makeHarness({ executionTimeoutMs: 30 });
    const job = await insertJob(h.store);

    const outcome = await h.runner.run(job.id, async () => {
      await sleep(300); // > timeout
      return 'too late';
    });

    expect(outcome.status).toBe('retrying');
    expect(outcome.error_code).toBe('JOB_TIMEOUT');
    expect((await h.store.get(job.id))!.result_ref).toBeNull();
  });

  it('redelivery của job đã completed không chạy lại (idempotent)', async () => {
    const h = makeHarness();
    const job = await insertJob(h.store);

    const first = await h.runner.run(job.id);
    const refBefore = first.result_ref;

    let called = 0;
    const again = await h.runner.run(job.id, async () => {
      called += 1;
      return 'different';
    });

    expect(again.claimed).toBe(false);
    expect(again.status).toBe('completed');
    expect(called).toBe(0);
    expect(again.result_ref).toBe(refBefore);
  });

  it('quá deadline trước khi chạy → failed DEADLINE_EXCEEDED, handler không gọi', async () => {
    const h = makeHarness();
    const job = await insertJob(h.store, { deadline: new Date(Date.now() - 1_000) });

    let called = 0;
    const outcome = await h.runner.run(job.id, async () => {
      called += 1;
      return 'x';
    });

    expect(called).toBe(0);
    expect(outcome.status).toBe('failed');
    expect(outcome.error_code).toBe('DEADLINE_EXCEEDED');
  });

  it('job đang chạy bởi worker khác (lease còn sống) → bỏ qua, không double-run', async () => {
    const h = makeHarness({ leaseTtlMs: 5_000 });
    const job = await insertJob(h.store);
    await h.store.update(job.id, { status: 'running', last_heartbeat_at: new Date() });

    let called = 0;
    const outcome = await h.runner.run(job.id, async () => {
      called += 1;
      return 'x';
    });

    expect(called).toBe(0);
    expect(outcome.claimed).toBe(false);
    expect(outcome.status).toBe('running');
  });

  it('persist result thất bại → KHÔNG completed (vẫn retrying), result_ref null', async () => {
    const h = makeHarness();
    const job = await insertJob(h.store);
    // phá storage
    const failingStorage = {
      persist: async () => {
        throw new Error('storage down');
      },
    };
    const runner = new JobRunner({
      store: h.store,
      storage: failingStorage,
      ai: h.ai,
      heartbeatIntervalMs: 10,
      leaseTtlMs: 100,
      executionTimeoutMs: 1_000,
      maxProviderCallsPerJob: 2,
      retry: { baseDelayMs: 100, maxDelayMs: 500, backoffFactor: 2 },
    });

    const outcome = await runner.run(job.id, async () => ({ value: 1 }));

    expect(outcome.status).toBe('retrying');
    expect(outcome.result_ref).toBeNull();
    const state = await h.store.get(job.id);
    expect(state!.status).not.toBe('completed');
    expect(state!.error_code).toBe('JOB_EXECUTION_FAILED');
    expect(state!.error_message).toBe('storage down');
  });

  it('TimeoutError/ProviderCallLimitError có code đúng trong outcome', async () => {
    const h = makeHarness();
    const job = await insertJob(h.store);
    const outcome = await h.runner.run(job.id, async () => {
      const e: Error & { code: string } = Object.assign(new Error('custom'), { code: 'CUSTOM_CODE' });
      throw e;
    });
    expect(outcome.error_code).toBe('CUSTOM_CODE');
    // sanity: các class lỗi có code chuẩn
    expect(new ProviderCallLimitError(2).code).toBe('PROVIDER_CALL_LIMIT_EXCEEDED');
    expect(new JobTimeoutError(10).code).toBe('JOB_TIMEOUT');
  });
});
