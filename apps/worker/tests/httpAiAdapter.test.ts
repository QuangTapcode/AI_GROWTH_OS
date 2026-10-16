import { describe, it, expect } from 'vitest';
import { HttpAiAdapter, AiHttpError } from '../src/adapters/HttpAiAdapter';
import type { AiRunRequest } from '../src/adapters/AiAdapter';
import { JobRunner } from '../src/jobs/JobRunner';
import { MemoryJobStore } from '../src/jobs/JobStore';
import { MemoryResultStorage } from '../src/adapters/StorageAdapter';
import { createJobState } from '../src/jobs/JobState';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const WS_ID = '22222222-2222-4222-8222-222222222222';
const RUN_ID = '33333333-3333-4333-8333-333333333333';

function baseReq(over: Partial<AiRunRequest> = {}): AiRunRequest {
  return {
    operation: 'research',
    aiOperation: 'research.run',
    input: { question: 'expat housing' },
    job_id: JOB_ID,
    workspace_id: WS_ID,
    input_version: 3,
    trace_id: 'trace-abc',
    ...over,
  };
}

function completedStatus() {
  return {
    run_id: RUN_ID,
    job_id: JOB_ID,
    workspace_id: WS_ID,
    operation: 'research.run',
    input_version: 3,
    status: 'completed',
    attempt: 1,
    provider_calls: 1,
    max_provider_calls: 2,
    retryable: false,
    result: {
      schema_version: '1.0.0',
      run_id: RUN_ID,
      operation: 'research.run',
      result: { brief_id: 'B-1' },
      evidence: [{ quote: 'excerpt' }],
      warnings: [],
      usage: { input_tokens: 1 },
      model_version: 'qwen3:4b-instruct',
      prompt_version: 'research-v1',
      input_version: 3,
      trace_id: 'trace-abc',
      artifact: {
        artifact_id: '44444444-4444-4444-8444-444444444444',
        workspace_id: WS_ID,
        version: 3,
        content_hash: 'a'.repeat(64),
        storage: 'ai_run_store',
      },
    },
    error_code: null,
    error_message: null,
    deadline_at: '2026-10-15T00:10:00Z',
    created_at: '2026-10-15T00:00:00Z',
    completed_at: '2026-10-15T00:01:00Z',
  };
}

interface StubCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Stub fetch: trả response theo thứ tự steps, ghi lại request để assert. */
function stubFetch(
  steps: Array<{ status: number; body: unknown }>,
  calls: StubCall[] = [],
): { impl: typeof fetch; calls: StubCall[] } {
  let i = 0;
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    const step = steps[Math.min(i, steps.length - 1)];
    i += 1;
    return new Response(JSON.stringify(step.body), {
      status: step.status,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
    });
  }) as typeof fetch;
  return { impl, calls };
}

describe('HttpAiAdapter — submit/poll theo CR-001 (MY-01)', () => {
  it('gửi POST JobRequest đúng contract, map research → research.run, poll tới completed', async () => {
    const { impl, calls } = stubFetch([
      { status: 202, body: { ...completedStatus(), status: 'queued', result: null } },
      { status: 200, body: { ...completedStatus(), status: 'running', result: null } },
      { status: 200, body: completedStatus() },
    ]);
    const adapter = new HttpAiAdapter({ baseUrl: 'http://ai.local:5000/', token: 'tok-1', fetchImpl: impl, pollIntervalMs: 1 });

    const result = await adapter.run(baseReq());

    expect(result.output).toEqual({ brief_id: 'B-1' });
    expect(result.model).toBe('qwen3:4b-instruct');
    expect(result.run_id).toBe(RUN_ID);
    expect(result.artifact).toMatchObject({ version: 3, storage: 'ai_run_store' });
    expect(result.provider_calls).toBe(1);

    const post = calls[0];
    expect(post.url).toBe('http://ai.local:5000/internal/v1/runs');
    expect(post.method).toBe('POST');
    expect(post.headers.authorization).toBe('Bearer tok-1');
    expect(post.body).toMatchObject({
      schema_version: '1.0.0',
      job_id: JOB_ID,
      workspace_id: WS_ID,
      operation: 'research.run',
      input_version: 3,
      trace_id: 'trace-abc',
      payload: { question: 'expat housing' },
    });
    expect(calls[1].url).toBe(`http://ai.local:5000/internal/v1/runs/${RUN_ID}`);
    expect(calls[1].method).toBe('GET');
  });

  it('idempotency: resend cùng request → body y hệt, không có attempt', async () => {
    const { impl, calls } = stubFetch([{ status: 200, body: completedStatus() }]);
    const adapter = new HttpAiAdapter({ baseUrl: 'http://ai.local', fetchImpl: impl });

    await adapter.run(baseReq());
    await adapter.run(baseReq());

    const [first, second] = calls.map((c) => c.body);
    expect(first).toEqual(second);
    expect(first).not.toHaveProperty('attempt');
  });

  it('lỗi envelope 422 → permanent với đúng code AI', async () => {
    const { impl } = stubFetch([
      {
        status: 422,
        body: { error: { code: 'INVALID_PAYLOAD', message: 'Payload does not match', request_id: 'r-9' } },
      },
    ]);
    const adapter = new HttpAiAdapter({ baseUrl: 'http://ai.local', fetchImpl: impl });

    const err = await adapter.run(baseReq()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiHttpError);
    // requestId lấy từ header X-Request-ID (AI service echo cả header và envelope).
    expect(err).toMatchObject({ code: 'INVALID_PAYLOAD', permanent: true, requestId: 'req-1' });
  });

  it('503 và 429 là retryable', async () => {
    for (const status of [503, 429]) {
      const { impl } = stubFetch([
        { status, body: { error: { code: 'PROVIDER_UNAVAILABLE', message: 'Ollama down', request_id: 'r-1' } } },
      ]);
      const adapter = new HttpAiAdapter({ baseUrl: 'http://ai.local', fetchImpl: impl });
      const err = await adapter.run(baseReq()).catch((e: unknown) => e);
      expect(err).toMatchObject({ permanent: false });
    }
  });

  it('run failed: retryable=true → retry; retryable=false → permanent', async () => {
    const failed = (retryable: boolean) => ({
      run_id: RUN_ID,
      status: 'failed',
      retryable,
      error_code: retryable ? 'PROVIDER_TIMEOUT' : 'MISSING_VERIFIED_FACTS',
      error_message: 'chi tiết lỗi',
      provider_calls: 2,
      max_provider_calls: 2,
    });
    const retryableAdapter = new HttpAiAdapter({
      baseUrl: 'http://ai.local',
      fetchImpl: stubFetch([{ status: 200, body: failed(true) }]).impl,
    });
    const err1 = await retryableAdapter.run(baseReq()).catch((e: unknown) => e);
    expect(err1).toMatchObject({ code: 'PROVIDER_TIMEOUT', permanent: false });

    const permanentAdapter = new HttpAiAdapter({
      baseUrl: 'http://ai.local',
      fetchImpl: stubFetch([{ status: 200, body: failed(false) }]).impl,
    });
    const err2 = await permanentAdapter.run(baseReq()).catch((e: unknown) => e);
    expect(err2).toMatchObject({ code: 'MISSING_VERIFIED_FACTS', permanent: true });
  });

  it('context sai (job_id không phải UUID) → permanent, không gọi network', async () => {
    const { impl, calls } = stubFetch([]);
    const adapter = new HttpAiAdapter({ baseUrl: 'http://ai.local', fetchImpl: impl });

    const err = await adapter.run(baseReq({ job_id: 'not-a-uuid' })).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'INVALID_JOB_ID', permanent: true });
    expect(calls).toHaveLength(0);
  });

  it('network lỗi → AI_UNREACHABLE retryable', async () => {
    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const adapter = new HttpAiAdapter({ baseUrl: 'http://ai.local', fetchImpl: failing });
    const err = await adapter.run(baseReq()).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'AI_UNREACHABLE', permanent: false });
  });

  it('cancel(runId) ngừng poll → RUN_CANCELLED permanent', async () => {
    const { impl } = stubFetch([
      { status: 202, body: { ...completedStatus(), status: 'running', result: null } },
      { status: 200, body: { ...completedStatus(), status: 'running', result: null } },
    ]);
    const adapter = new HttpAiAdapter({ baseUrl: 'http://ai.local', fetchImpl: impl, pollIntervalMs: 50 });

    const pending = adapter.run(baseReq());
    await new Promise((r) => setTimeout(r, 20));
    adapter.cancel(RUN_ID);

    const err = await pending.catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'RUN_CANCELLED', permanent: true });
  });
});

describe('JobRunner phân loại lỗi AI (MY-01)', () => {
  async function runWithAiError(err: Error & { permanent?: boolean }) {
    const store = new MemoryJobStore();
    const job = createJobState({ workspace_id: WS_ID, organization_id: 'org-1', operation: 'research' });
    await store.insert(job);
    const runner = new JobRunner({
      store,
      storage: new MemoryResultStorage(),
      ai: { run: async () => ({ output: {}, model: '', schema_version: '' }) },
      heartbeatIntervalMs: 10,
      leaseTtlMs: 100,
      executionTimeoutMs: 1_000,
      maxProviderCallsPerJob: 2,
      retry: { baseDelayMs: 1, maxDelayMs: 5, backoffFactor: 2 },
    });
    return runner.run(job.id, async () => {
      throw err;
    });
  }

  it('AiHttpError permanent → failed ngay, không retry', async () => {
    const outcome = await runWithAiError(
      new AiHttpError('INVALID_PAYLOAD', 'sai schema', { permanent: true }),
    );
    expect(outcome.status).toBe('failed');
    expect(outcome.error_code).toBe('INVALID_PAYLOAD');
    expect(outcome.attempt).toBe(1);
  });

  it('AiHttpError retryable → retrying có backoff', async () => {
    const outcome = await runWithAiError(
      new AiHttpError('PROVIDER_UNAVAILABLE', 'Ollama down', { permanent: false }),
    );
    expect(outcome.status).toBe('retrying');
    expect(outcome.error_code).toBe('PROVIDER_UNAVAILABLE');
  });
});