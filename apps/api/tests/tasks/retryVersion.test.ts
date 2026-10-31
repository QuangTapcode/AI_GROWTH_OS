import { describe, expect, it, vi } from 'vitest';

const calls: { sql: string; params: unknown[] }[] = [];
let planTask = true;
vi.mock('../../src/lib/db', () => ({
  query: vi.fn(),
  withTransaction: async (fn: (client: unknown) => unknown) => fn({
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM plan_task_outbox')) return { rowCount: planTask ? 1 : 0, rows: [] };
      if (sql.includes('UPDATE workflow_tasks')) return { rows: [{ id: 't1', workspace_id: 'w', status: 'queued', input_version: planTask ? 2 : 1,
        operation: 'seo.local_draft', retry_count: 0, payload: {}, created_at: new Date(), updated_at: new Date() }] };
      return { rows: [], rowCount: 1 };
    },
  }),
}));

describe('retry of a failed AI plan task', () => {
  it('queues a new input version so the AI service runs again instead of replaying the failure', async () => {
    const { requeueFailedTask } = await import('../../src/modules/tasks/repository');
    calls.length = 0; planTask = true;
    await requeueFailedTask('w', 't1', 'owner');
    const update = calls.find((c) => c.sql.includes('UPDATE workflow_tasks'))!;
    expect(update.sql).toContain('input_version = input_version + CASE WHEN $3 THEN 1 ELSE 0 END');
    expect(update.params[2]).toBe(true);
    const outbox = calls.find((c) => c.sql.includes('INSERT INTO plan_task_outbox'))!;
    expect(outbox.params).toEqual(['w', 't1', 2, 'seo.local_draft']);
  });

  it('keeps the version for tasks outside the plan outbox', async () => {
    const { requeueFailedTask } = await import('../../src/modules/tasks/repository');
    calls.length = 0; planTask = false;
    await requeueFailedTask('w', 't1', 'owner');
    expect(calls.find((c) => c.sql.includes('UPDATE workflow_tasks'))!.params[2]).toBe(false);
    expect(calls.some((c) => c.sql.includes('INSERT INTO plan_task_outbox'))).toBe(false);
  });
});
