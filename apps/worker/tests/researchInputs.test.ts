import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { expect, it, vi } from 'vitest';
import type { AiAdapter } from '../src/adapters/AiAdapter';
import { PlanOutboxRunner } from '../src/workflow/PlanOutboxRunner';

it.each([true, false])('dispatches workspace inventory and verified GSC input to the real Research operation (GSC=%s)', async (hasMetrics) => {
  const ws = randomUUID(), ctx = randomUUID(), taskId = randomUUID(), artifactId = randomUUID();
  const goal = { kpis: [{ metric_name: 'clicks', baseline_value: null, target_value: 300 }] };
  const inventory = [{ content_id: randomUUID(), workspace_id: ws, version: 1, title: 'Coworking spaces for expats' }];
  const measured = { artifact: { artifact_id: randomUUID(), workspace_id: ws }, result: { site_url: 'sc-domain:tripc.ai' } };
  const output = { workspace_id: ws, synthetic: true };
  const hash = createHash('sha256').update(JSON.stringify({ evidence: [], result: { synthetic: true, workspace_id: ws } })).digest('hex');
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("SET status='claimed'") && sql.includes('RETURNING *')) return { rows: [{ id: randomUUID(), workspace_id: ws, task_id: taskId, attempts: 1 }] };
    if (sql.includes('SELECT * FROM workflow_tasks')) return { rows: [{ id: taskId, role: 'research', operation: 'research.run', context_snapshot_id: ctx,
      status: 'queued', input_version: 1, payload: { input: { operation: 'research.run' }, synthetic: true }, created_at: new Date() }] };
    if (sql.includes('SELECT * FROM knowledge_contexts')) return { rows: [{ snapshot_id: ctx, profile_version: 1, profile: { version: 1 }, snapshot: { sources: [] }, goal }] };
    if (sql.includes('SELECT version FROM business_profiles')) return { rows: [{ version: 1 }] };
    if (sql.includes('FROM (') && sql.includes('inventory')) return { rows: inventory };
    if (sql.includes('JOIN integration_connections')) return { rows: hasMetrics ? [{ payload: measured, evidence: [] }] : [] };
    if (sql.includes('SELECT id FROM plan_task_outbox')) return { rows: [{ id: 'lease' }] };
    if (sql.includes('SELECT workspace_id,content_hash FROM content_artifacts')) return { rows: [{ workspace_id: ws, content_hash: hash }] };
    return { rows: [], rowCount: 1 };
  });
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  const run = vi.fn().mockResolvedValue({ output, artifact: { artifact_id: artifactId, workspace_id: ws, version: 1, content_hash: hash, context_snapshot_id: ctx, role: 'research' }, evidence: [] });
  await new PlanOutboxRunner(pool, { run } as unknown as AiAdapter).runOnce();
  const request = run.mock.calls[0][0];
  expect(request.aiOperation).toBe('research.run');
  expect(request.input.content_inventory).toEqual(inventory);
  expect(request.input.goal_context).toEqual(goal);
  if (hasMetrics) expect(request.input.search_metrics).toEqual({ ...measured, evidence: [] });
  else expect(request.input.search_metrics_missing_reason).toBe('gsc_snapshot_missing_or_stale');
  const scopedQueries = query.mock.calls.filter(([sql]) => sql.includes('JOIN integration_connections'));
  expect(scopedQueries[0][0]).toContain('a.workspace_id=$1');
  expect(scopedQueries[0][0]).toContain("c.status='connected'");
});
