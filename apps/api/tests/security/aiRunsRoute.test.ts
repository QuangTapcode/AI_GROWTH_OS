import { describe, expect, it, vi } from 'vitest';

const enqueue = vi.fn();
vi.mock('@/lib/auth', () => ({ authenticateUser: () => ({ id: 'user-a' }) }));
vi.mock('@/lib/db', () => ({ default: { query: vi.fn(async () => ({ rows: [{ snapshot_id: 'ctx-a' }] })) } }));
vi.mock('@/modules/campaignPlans/aiTasks', () => ({ enqueueAiTask: (...args: unknown[]) => enqueue(...args) }));

describe('POST /ai-runs', () => {
  it('validates through enqueueAiTask with the URL workspace and its current context, never proxying the body', async () => {
    enqueue.mockResolvedValue({ task_id: 't1', deduplicated: false });
    const { POST } = await import('../../src/app/v1/workspaces/[workspace_id]/ai-runs/route');
    const body = { operation: 'research.run', workspace_id: 'workspace-b', payload: { anything: true } };
    const res = await POST(new Request('http://x/v1/workspaces/workspace-a/ai-runs', { method: 'POST', body: JSON.stringify(body) }) as never,
      { params: { workspace_id: 'workspace-a' } });
    expect(res.status).toBe(202);
    expect(enqueue).toHaveBeenCalledWith(expect.anything(), 'workspace-a', 'user-a', { context_snapshot_id: 'ctx-a', input: body });
  });
});
