import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { expect, it, vi } from 'vitest';
import type { AiAdapter } from '../src/adapters/AiAdapter';
import { PlanOutboxRunner } from '../src/workflow/PlanOutboxRunner';

const ws = randomUUID(), oldCtx = randomUUID(), newCtx = randomUUID(), taskId = randomUUID(), outboxId = randomUUID();

function runner(operation: string, ai: Partial<AiAdapter>) {
  const updates: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('UPDATE')) updates.push({ sql, params });
    if (sql.includes("SET status='claimed'") && sql.includes('RETURNING *')) return { rows: [{ id: outboxId, workspace_id: ws, task_id: taskId, attempts: 1, operation }] };
    if (sql.includes('SET context_snapshot_id')) return { rows: [{ id: taskId, role: 'community', operation, status: 'queued', input_version: 2, context_snapshot_id: newCtx, payload: { input: { question: 'Where should I live?' } } }] };
    if (sql.includes('SELECT * FROM workflow_tasks')) return { rows: [{ id: taskId, role: 'community', operation, status: 'queued', input_version: 1, context_snapshot_id: oldCtx, payload: { input: { question: 'Where should I live?' } } }] };
    if (sql.includes('SELECT * FROM knowledge_contexts')) return { rows: sql.includes('snapshot_id=$2') ? [] : [{ snapshot_id: newCtx, profile_version: 1, profile: {}, snapshot: { sources: [] }, goal: null }] };
    if (sql.includes('SELECT version FROM business_profiles')) return { rows: [{ version: 1 }] };
    if (sql.includes('RETURNING task_id')) return { rows: [{ task_id: taskId }], rowCount: 1 };
    if (sql.includes('SELECT id FROM plan_task_outbox')) return { rows: [{ id: 'lease' }] };
    if (sql.includes('SELECT workspace_id,content_hash FROM content_artifacts')) return { rows: [{ workspace_id: ws, content_hash: hashOf() }] };
    return { rows: [], rowCount: 1 };
  });
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  return { outbox: new PlanOutboxRunner(pool, ai as AiAdapter), updates };
}

const output = { workspace_id: ws, synthetic: false };
const hashOf = () => createHash('sha256').update(JSON.stringify({ evidence: [], result: { synthetic: false, workspace_id: ws } })).digest('hex');

it('answers a queued customer question from the current context when a new one was issued while it waited', async () => {
  const run = vi.fn().mockResolvedValue({ output, artifact: { artifact_id: randomUUID(), workspace_id: ws, version: 2, content_hash: hashOf(), context_snapshot_id: newCtx, role: 'community' }, evidence: [], model: 'm', run_id: 'r', prompt_version: 'p', provider_calls: 1 });
  const { outbox, updates } = runner('community.response', { run });
  await outbox.runOnce();
  const request = run.mock.calls[0][0];
  expect(request.context_snapshot_id).toBe(newCtx);
  expect(request.input_version).toBe(2);
  expect(updates.find(u => u.sql.includes('UPDATE plan_task_outbox SET input_version'))?.params).toEqual([outboxId, 2]);
  expect(updates.some(u => u.sql.includes('community_messages'))).toBe(false);
});

it('still rejects campaign work pinned to an older context', async () => {
  const run = vi.fn();
  const { outbox, updates } = runner('seo.local_draft', { run });
  await expect(outbox.runOnce()).rejects.toThrow('STALE_CONTEXT');
  expect(run).not.toHaveBeenCalled();
  expect(updates.some(u => u.sql.includes('SET context_snapshot_id'))).toBe(false);
});

it('hands a question the agents cannot answer to a person instead of leaving it queued', async () => {
  const run = vi.fn().mockRejectedValue(Object.assign(new Error('Draft contains an unsupported numeric/price claim'), { permanent: true }));
  const { outbox, updates } = runner('community.response', { run });
  await expect(outbox.runOnce()).rejects.toThrow('unsupported');
  expect(updates.find(u => u.sql.includes('community_messages'))?.params).toEqual([ws, taskId]);
  expect(updates.some(u => u.sql.includes("SET status='failed'"))).toBe(true);
});
