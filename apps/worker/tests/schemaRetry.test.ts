import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { expect, it, vi } from 'vitest';
import type { AiAdapter } from '../src/adapters/AiAdapter';
import { AiHttpError } from '../src/adapters/HttpAiAdapter';
import { PlanOutboxRunner } from '../src/workflow/PlanOutboxRunner';

const ws = randomUUID(), ctx = randomUUID(), taskId = randomUUID(), outboxId = randomUUID();

function runner(attempts: number, run: AiAdapter['run']) {
  const updates: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('UPDATE')) updates.push({ sql, params });
    if (sql.includes("SET status='claimed'") && sql.includes('RETURNING *')) return { rows: [{ id: outboxId, workspace_id: ws, task_id: taskId, attempts, operation: 'community.response' }] };
    if (sql.includes('SELECT * FROM workflow_tasks')) return { rows: [{ id: taskId, role: 'community', operation: 'community.response', status: 'queued', input_version: attempts, context_snapshot_id: ctx, payload: { input: { question: 'Where should I live?' } } }] };
    if (sql.includes('SELECT * FROM knowledge_contexts')) return { rows: [{ snapshot_id: ctx, profile_version: 1, profile: {}, snapshot: { sources: [] }, goal: null }] };
    if (sql.includes('SELECT version FROM business_profiles')) return { rows: [{ version: 1 }] };
    if (sql.includes('RETURNING task_id')) return { rows: [{ task_id: taskId }], rowCount: 1 };
    if (sql.includes('RETURNING input_version')) return { rows: [{ input_version: attempts + 1 }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  return { outbox: new PlanOutboxRunner(pool, { run } as AiAdapter), updates };
}

const malformed = () => new AiHttpError('INVALID_STRUCTURED_OUTPUT', 'Model output did not match schema', { permanent: true });

it('runs a malformed model reply once more under a new input version', async () => {
  const { outbox, updates } = runner(1, vi.fn().mockRejectedValue(malformed()));
  await expect(outbox.runOnce()).rejects.toThrow('did not match schema');
  expect(updates.find(u => u.sql.includes('RETURNING task_id'))?.params[1]).toBe('pending');
  expect(updates.some(u => u.sql.includes('input_version=input_version+1'))).toBe(true);
  expect(updates.find(u => u.sql.includes('UPDATE plan_task_outbox SET input_version'))?.params).toEqual([outboxId, 2]);
  expect(updates.some(u => u.sql.includes("SET status='failed'"))).toBe(false);
  expect(updates.some(u => u.sql.includes('community_messages'))).toBe(false);
});

it('gives up after that one extra run', async () => {
  const { outbox, updates } = runner(2, vi.fn().mockRejectedValue(malformed()));
  await expect(outbox.runOnce()).rejects.toThrow('did not match schema');
  expect(updates.find(u => u.sql.includes('RETURNING task_id'))?.params[1]).toBe('failed');
  expect(updates.some(u => u.sql.includes('input_version=input_version+1'))).toBe(false);
  expect(updates.some(u => u.sql.includes("SET status='failed'"))).toBe(true);
});

it('does not run any other permanent AI failure again', async () => {
  const refused = new AiHttpError('UNSUPPORTED_CONTENT_CLAIM', 'Unsupported claim', { permanent: true });
  const { outbox, updates } = runner(1, vi.fn().mockRejectedValue(refused));
  await expect(outbox.runOnce()).rejects.toThrow('Unsupported claim');
  expect(updates.find(u => u.sql.includes('RETURNING task_id'))?.params[1]).toBe('failed');
  expect(updates.some(u => u.sql.includes('input_version=input_version+1'))).toBe(false);
});
