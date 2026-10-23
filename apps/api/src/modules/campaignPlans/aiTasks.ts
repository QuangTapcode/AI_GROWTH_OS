import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { canonicalJson } from '../../lib/hash';
import { PlanError } from './service';

const id = z.string().uuid();
const factors = z.object(Object.fromEntries(['demand', 'business_relevance', 'growth_potential', 'content_gap', 'freshness', 'conversion_potential'].map(k => [k, z.number().min(0).max(5).nullable()]))).strict();
const experiment = z.object({
  hypothesis: z.string().min(1).max(500),
  control_variant: z.string().min(1).max(200),
  treatment_variant: z.string().min(1).max(200),
  primary_metric: z.string().min(1).max(100),
  period: z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) }).strict(),
  grouping: z.string().min(1).max(100),
}).strict();
const input = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('research.run') }).strict(),
  z.object({ operation: z.literal('strategy.generate'), research_artifact_id: id, cta: z.string().min(1).max(200), deadline: z.string().datetime({ offset: true }), score_factors: factors.optional() }).strict(),
  z.object({ operation: z.literal('community.response'), question: z.string().min(1).max(1000) }).strict(),
  z.object({ operation: z.literal('analytics.report'), metrics_artifact_id: id.optional() }).strict(),
  z.object({ operation: z.literal('experiment.hypothesis'), metrics_artifact_id: id.optional(), experiment }).strict(),
  z.object({ operation: z.literal('learning.analyze'), performance_artifact_id: id.optional(), lead_summary_artifact_id: id.optional(), iteration: z.number().int().min(0).max(3).default(0), max_iterations: z.number().int().min(1).max(3).default(3), task_quota: z.number().int().min(0).max(1).default(1) }).strict(),
]);
const schema = z.object({ task_id: id.optional(), context_snapshot_id: id, synthetic: z.boolean().default(false), input }).strict();

/** Scoped draft jobs. SEO/social are only opened by validated campaign/dependency approval. */
export async function enqueueAiTask(pool: Pool, workspaceId: string, actorId: string, raw: unknown) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new PlanError('INVALID_AI_TASK', 'Unsupported draft operation/input');
  const body = parsed.data, taskId = body.task_id ?? randomUUID();
  if (body.input.operation === 'strategy.generate' && Date.parse(body.input.deadline) <= Date.now()) throw new PlanError('INVALID_DEADLINE', 'Future deadline required');
  if (body.input.operation === 'experiment.hypothesis' && (Date.parse(body.input.experiment.period.end) > Date.now() || Date.parse(body.input.experiment.period.end) <= Date.parse(body.input.experiment.period.start))) throw new PlanError('INVALID_PERIOD', 'Experiment period must be ordered and not in the future');
  const roles: Record<string, string> = { 'research.run': 'research', 'strategy.generate': 'growth_lead', 'community.response': 'community', 'analytics.report': 'performance', 'experiment.hypothesis': 'performance', 'learning.analyze': 'growth_lead' };
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspaceId]);
    const member = (await db.query("SELECT role FROM memberships WHERE workspace_id=$1 AND user_id=$2 AND status='active' FOR SHARE", [workspaceId, actorId])).rows[0];
    if (!['owner', 'editor'].includes(member?.role)) throw new PlanError('PERMISSION_DENIED', 'Active owner/editor required', 403);
    const context = (await db.query('SELECT snapshot_id FROM knowledge_contexts WHERE workspace_id=$1 AND snapshot_id=$2 AND current FOR SHARE', [workspaceId, body.context_snapshot_id])).rows[0];
    if (!context) throw new PlanError('STALE_CONTEXT', 'Backend-issued current context required');
    // Reference ownership is checked before enqueue and content/hash is rechecked by AI.
    for (const [key, value] of Object.entries(body.input)) if (key.endsWith('_artifact_id') && value) {
      const artifact = (await db.query('SELECT id FROM content_artifacts WHERE workspace_id=$1 AND id=$2 AND context_snapshot_id=$3 FOR SHARE', [workspaceId, value, body.context_snapshot_id])).rows[0];
      if (!artifact) throw new PlanError('ARTIFACT_MISMATCH', 'Input artifact is missing, foreign or stale');
    }
    const payload = { input: body.input, synthetic: body.synthetic, requires_human_approval: true };
    const old = (await db.query('SELECT workspace_id,context_snapshot_id,payload FROM workflow_tasks WHERE id=$1', [taskId])).rows[0];
    if (old) {
      if (old.workspace_id !== workspaceId || old.context_snapshot_id !== body.context_snapshot_id || canonicalJson(old.payload) !== canonicalJson(payload)) throw new PlanError('TASK_CONFLICT', 'Task ID content changed', 409);
      await db.query('COMMIT'); return { task_id: taskId, deduplicated: true };
    }
    await db.query("INSERT INTO workflow_tasks(id,workspace_id,role,operation,status,input_version,context_snapshot_id,payload) VALUES($1,$2,$3,$4,'queued',1,$5,$6)", [taskId, workspaceId, roles[body.input.operation], body.input.operation, body.context_snapshot_id, JSON.stringify(payload)]);
    await db.query('INSERT INTO plan_task_outbox(workspace_id,task_id,input_version,operation) VALUES($1,$2,1,$3)', [workspaceId, taskId, body.input.operation]);
    await db.query('COMMIT'); return { task_id: taskId, deduplicated: false };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
