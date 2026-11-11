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
  const action = { metric_name: 'leads', reason: 'Investigate the measured decline', report_artifact_id: randomUUID() };
  const hash = createHash('sha256').update(JSON.stringify({ evidence: [], result: { synthetic: true, workspace_id: ws } })).digest('hex');
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("SET status='claimed'") && sql.includes('RETURNING *')) return { rows: [{ id: randomUUID(), workspace_id: ws, task_id: taskId, attempts: 1 }] };
    if (sql.includes('SELECT * FROM workflow_tasks')) return { rows: [{ id: taskId, role: 'research', operation: 'research.run', context_snapshot_id: ctx,
      status: 'queued', input_version: 1, payload: hasMetrics
        ? { input: { operation: 'research.run', performance_action: action }, synthetic: true }
        : { input: { operation: 'research.run' }, performance_action: { ...action, approved_by: randomUUID() }, synthetic: true }, created_at: new Date() }] };
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
  expect(request.input.performance_action).toEqual(action);
  if (hasMetrics) expect(request.input.search_metrics).toEqual({ ...measured, evidence: [] });
  else expect(request.input.search_metrics_missing_reason).toBe('gsc_snapshot_missing_or_stale');
  const scopedQueries = query.mock.calls.filter(([sql]) => sql.includes('JOIN integration_connections'));
  expect(scopedQueries[0][0]).toContain('a.workspace_id=$1');
  expect(scopedQueries[0][0]).toContain("c.status='connected'");
});

it('social posts are not articles: Research dedups against articles only', async () => {
  // Real run: 90 of the 100 inventory rows were Facebook posts titled "content".
  const ws = randomUUID(), ctx = randomUUID();
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("SET status='claimed'") && sql.includes('RETURNING *')) return { rows: [{ id: randomUUID(), workspace_id: ws, task_id: randomUUID() }] };
    if (sql.includes('SELECT * FROM workflow_tasks')) return { rows: [{ id: randomUUID(), role: 'research', operation: 'research.run', context_snapshot_id: ctx,
      status: 'queued', input_version: 1, payload: { input: { operation: 'research.run' } }, created_at: new Date() }] };
    if (sql.includes('SELECT * FROM knowledge_contexts')) return { rows: [{ snapshot_id: ctx, profile_version: 1, profile: { version: 1 }, snapshot: { sources: [] }, goal: null }] };
    if (sql.includes('SELECT version FROM business_profiles')) return { rows: [{ version: 1 }] };
    return { rows: [], rowCount: 1 };
  });
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  await new PlanOutboxRunner(pool, { run: vi.fn().mockRejectedValue(new Error('stop after building the input')) } as unknown as AiAdapter).runOnce().catch(() => undefined);
  const inventory = query.mock.calls.find(([sql]) => sql.includes('FROM (') && sql.includes('inventory'));
  expect(inventory?.[0]).toContain("FROM contents WHERE workspace_id=$1 AND type <> 'social_post'");
});

it('Growth Lead receives the latest measured window, so the plan can respond to it', async () => {
  const ws = randomUUID(), ctx = randomUUID(), researchId = randomUUID();
  const metrics = { artifact: { artifact_id: randomUUID(), workspace_id: ws }, result: { leads: 0 } };
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("SET status='claimed'") && sql.includes('RETURNING *')) return { rows: [{ id: randomUUID(), workspace_id: ws, task_id: randomUUID() }] };
    if (sql.includes('SELECT * FROM workflow_tasks')) return { rows: [{ id: randomUUID(), role: 'growth_lead', operation: 'strategy.generate', context_snapshot_id: ctx,
      status: 'queued', input_version: 1, payload: { input: { operation: 'strategy.generate', research_artifact_id: researchId, cta: 'Ask TripC' } }, created_at: new Date() }] };
    if (sql.includes('SELECT * FROM knowledge_contexts')) return { rows: [{ snapshot_id: ctx, profile_version: 1, profile: { version: 1 }, snapshot: { sources: [] }, goal: null }] };
    if (sql.includes('SELECT version FROM business_profiles')) return { rows: [{ version: 1 }] };
    if (sql.includes("operation='metrics.snapshot'")) return { rows: [{ payload: metrics, evidence: [] }] };
    if (sql.includes('SELECT payload,evidence FROM content_artifacts')) return { rows: [{ payload: { artifact: { artifact_id: researchId }, result: { findings: [] } }, evidence: [] }] };
    return { rows: [], rowCount: 1 };
  });
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  const run = vi.fn().mockRejectedValue(new Error('stop after building the input'));
  await new PlanOutboxRunner(pool, { run } as unknown as AiAdapter).runOnce().catch(() => undefined);
  expect(run.mock.calls[0][0].input.latest_metrics).toEqual({ ...metrics, evidence: [] });
  const lookup = query.mock.calls.find(([sql]) => sql.includes("operation='metrics.snapshot'"));
  // Baseline windows are stored later but cover older dates: the newest window decides, not the newest row.
  expect(lookup?.[0]).toContain("window_end");
});

it('a Research round opened by Learning receives its lessons', async () => {
  const ws = randomUUID(), ctx = randomUUID();
  const lessons = { promising_titles: ['Street Food in Da Nang'], weak_titles: [] };
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("SET status='claimed'") && sql.includes('RETURNING *')) return { rows: [{ id: randomUUID(), workspace_id: ws, task_id: randomUUID() }] };
    if (sql.includes('SELECT * FROM workflow_tasks')) return { rows: [{ id: randomUUID(), role: 'research', operation: 'research.run', context_snapshot_id: ctx,
      status: 'queued', input_version: 1, payload: { dedup_key: 'k', lessons }, created_at: new Date() }] };
    if (sql.includes('SELECT * FROM knowledge_contexts')) return { rows: [{ snapshot_id: ctx, profile_version: 1, profile: { version: 1 }, snapshot: { sources: [] }, goal: null }] };
    if (sql.includes('SELECT version FROM business_profiles')) return { rows: [{ version: 1 }] };
    return { rows: [], rowCount: 1 };
  });
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  const run = vi.fn().mockRejectedValue(new Error('stop after building the input'));
  await new PlanOutboxRunner(pool, { run } as unknown as AiAdapter).runOnce().catch(() => undefined);
  expect(run.mock.calls[0][0].input.lessons).toEqual(lessons);
});

it.each([
  { autoPublish: true, autoApprove: true, script: true, channels: ['facebook'], aiImage: false },
  { autoPublish: false, autoApprove: false, script: undefined, channels: ['facebook', 'tiktok'], aiImage: undefined },
])('autopilot posts to Facebook alone with a TikTok script for the reviewer, and generates no image nobody would look at (auto publish=$autoPublish)', async ({ autoPublish, autoApprove, script, channels, aiImage }) => {
  const ws = randomUUID(), ctx = randomUUID(), articleId = randomUUID();
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("SET status='claimed'") && sql.includes('RETURNING *')) return { rows: [{ id: randomUUID(), workspace_id: ws, task_id: randomUUID(), attempts: 1 }] };
    if (sql.includes('SELECT * FROM workflow_tasks')) return { rows: [{ id: randomUUID(), role: 'content', operation: 'content.generate', context_snapshot_id: ctx,
      status: 'queued', input_version: 1, payload: { input: { operation: 'content.generate', cta: 'Ask TripC', source_article_id: articleId, target_channels: ['facebook', 'tiktok'] } }, created_at: new Date() }] };
    if (sql.includes('SELECT * FROM knowledge_contexts')) return { rows: [{ snapshot_id: ctx, profile_version: 1, profile: { version: 1 }, snapshot: { sources: [] }, assets: [] }] };
    if (sql.includes('SELECT version FROM business_profiles')) return { rows: [{ version: 1 }] };
    if (sql.includes('SELECT payload,evidence FROM content_artifacts')) return { rows: [{ payload: { artifact: { artifact_id: articleId }, result: {} }, evidence: [] }] };
    if (sql.includes('FROM agent_automation')) return { rows: [{ auto_publish_facebook: autoPublish, auto_approve_outputs: autoApprove }] };
    return { rows: [], rowCount: 1 };
  });
  const pool = { query, connect: async () => ({ query, release() {} }) } as unknown as Pool;
  const run = vi.fn().mockRejectedValue(new Error('stop after building the input'));
  await new PlanOutboxRunner(pool, { run } as unknown as AiAdapter).runOnce().catch(() => undefined);
  expect(run.mock.calls[0][0].input.target_channels).toEqual(channels);
  expect(run.mock.calls[0][0].input.draft_tiktok_script).toBe(script);
  expect(run.mock.calls[0][0].input.allow_ai_image).toBe(aiImage);
});
