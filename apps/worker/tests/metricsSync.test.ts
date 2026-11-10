import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildOperationHandlers } from '../src/jobs/operations';
import { createJobState } from '../src/jobs/JobState';
import type { JobContext } from '../src/jobs/JobRunner';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('metrics worker HTTP boundary', () => {
  const run = () => buildOperationHandlers().metrics({
    job: createJobState({ workspace_id: '11111111-1111-4111-8111-111111111111', operation: 'metrics', organization_id: 'org', payload: {} }),
    progress: async () => undefined,
  } as unknown as JobContext);
  function live() {
    vi.stubEnv('INTEGRATION_MODE','production'); vi.stubEnv('API_BASE_URL','http://localhost:4000/v1');
    vi.stubEnv('AUTOMATION_INTERNAL_TOKEN','automation-token'); vi.stubEnv('WORKER_GATEWAY_TOKEN','different-token');
  }
  it('uses the automation token and root internal route, with a dedicated timeout', async () => {
    live();
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ points_saved: 1, results: [] })));
    vi.stubGlobal('fetch',fetch);
    await expect(run()).resolves.toMatchObject({ points_saved: 1 });
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:4000/internal/metrics/sync');
    expect((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).toMatchObject({ authorization: 'Bearer automation-token' });
  });
  it('fails closed without the internal token and leaves transient failures retryable', async () => {
    live(); vi.stubEnv('AUTOMATION_INTERNAL_TOKEN','');
    await expect(run()).rejects.toMatchObject({ code: 'METRICS_AUTH_MISSING' });
    vi.stubEnv('AUTOMATION_INTERNAL_TOKEN','token');
    vi.stubGlobal('fetch',vi.fn(async () => new Response('{}',{ status: 503 })));
    await expect(run()).rejects.toMatchObject({ name: 'Error' });
  });
});
