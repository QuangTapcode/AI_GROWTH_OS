import { z } from 'zod';
import type { Pool, PoolClient } from 'pg';

/**
 * The workspace's active growth goal. Knowledge contexts embed it so Research and
 * Growth Lead plan against a measurable objective instead of a generic one.
 * Baselines stay null until a connector (GA4/GSC/leads) measures them; null is not zero.
 */
export const goalInputSchema = z.object({
  title: z.string().trim().min(5).max(255),
  primary_conversion: z.string().trim().min(1).max(50),
  period_days: z.number().int().min(7).max(366),
  budget_usd: z.number().min(0).max(1_000_000),
  target_qualified_visits: z.number().int().min(0).nullable().optional(),
  kpis: z.array(z.object({
    metric_name: z.string().trim().min(1).max(100),
    baseline_value: z.number().min(0).nullable(),
    target_value: z.number().min(0),
  }).strict()).min(1).max(5),
}).strict();

export type GoalInput = z.infer<typeof goalInputSchema>;
type Db = Pool | PoolClient;

export async function activeGoal(db: Db, workspaceId: string) {
  const goal = (await db.query(
    "SELECT * FROM growth_goals WHERE workspace_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1", [workspaceId],
  )).rows[0];
  if (!goal) return null;
  const kpis = (await db.query(
    'SELECT metric_name, baseline_value, target_value, current_value FROM growth_kpis WHERE goal_id=$1 ORDER BY metric_name', [goal.id],
  )).rows.map((k) => ({ metric_name: k.metric_name, baseline_value: num(k.baseline_value), target_value: num(k.target_value),
    current_value: num(k.current_value) }));
  return { ...goal, budget_usd: num(goal.budget_usd), target_traffic_pct: num(goal.target_traffic_pct), kpis };
}

/** GoalContext for AI jobs: the first KPI (ordered by metric name) is the primary metric. */
export function goalContext(goal: Awaited<ReturnType<typeof activeGoal>>) {
  if (!goal) return null;
  const primary = goal.kpis[0];
  return {
    id: goal.id, workspace_id: goal.workspace_id, objective: goal.title, status: goal.status,
    primary_conversion: goal.primary_conversion, period_days: goal.period_days, budget_usd: goal.budget_usd,
    target_qualified_visits: goal.target_qualified_visits ?? null,
    primary_metric: primary?.metric_name ?? null, baseline: primary?.baseline_value ?? null, target_value: primary?.target_value ?? null,
  };
}

/** Replace the active goal atomically; the previous one is archived, never deleted. */
export async function setGoal(pool: Pool, workspaceId: string, input: GoalInput) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspaceId]);
    await db.query("UPDATE growth_goals SET status='archived' WHERE workspace_id=$1 AND status='active'", [workspaceId]);
    const goal = (await db.query(
      `INSERT INTO growth_goals (workspace_id, title, target_qualified_visits, period_days, primary_conversion, budget_usd, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id`,
      [workspaceId, input.title, input.target_qualified_visits ?? null, input.period_days, input.primary_conversion, input.budget_usd],
    )).rows[0];
    for (const kpi of input.kpis) {
      await db.query('INSERT INTO growth_kpis (goal_id, metric_name, baseline_value, target_value, current_value) VALUES ($1, $2, $3, $4, NULL)',
        [goal.id, kpi.metric_name, kpi.baseline_value, kpi.target_value]);
    }
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
  return activeGoal(pool, workspaceId);
}

function num(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}
