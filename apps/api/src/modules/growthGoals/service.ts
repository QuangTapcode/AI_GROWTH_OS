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
    measurement: z.object({
      definition: z.string().trim().min(1).max(500),
      unit: z.string().trim().min(1).max(40),
      source: z.enum(['first_party', 'ga4', 'gsc', 'meta_ads']),
      scope: z.string().trim().min(1).max(300),
    }).strict().optional(),
  }).strict()).min(1).max(5),
}).strict();

export type GoalInput = z.infer<typeof goalInputSchema>;
type Db = Pool | PoolClient;
type StoredKpi = { metric_name: string; baseline_value: number | null; target_value: number | null; current_value: number | null; measurement: GoalInput['kpis'][number]['measurement'] | null };

export async function activeGoal(db: Db, workspaceId: string) {
  const goal = (await db.query(
    "SELECT * FROM growth_goals WHERE workspace_id=$1 AND status='active' ORDER BY created_at DESC LIMIT 1", [workspaceId],
  )).rows[0];
  if (!goal) return null;
  const kpis: StoredKpi[] = (await db.query(
    'SELECT metric_name, baseline_value, target_value, current_value, measurement FROM growth_kpis WHERE goal_id=$1 ORDER BY metric_name', [goal.id],
  )).rows.map((k) => ({ metric_name: k.metric_name, baseline_value: num(k.baseline_value), target_value: num(k.target_value),
    current_value: num(k.current_value), measurement: k.measurement ?? null }));
  return { ...goal, budget_usd: num(goal.budget_usd), target_traffic_pct: num(goal.target_traffic_pct), kpis };
}

/** Words an owner may use (Vietnamese or English) for each confirmed offer id in a request. */
const OFFER_TERMS: Record<string, string[]> = {
  food: ['food', 'cuisine', 'restaurant', 'street food', 'ẩm thực', 'món ăn', 'đồ ăn', 'quán ăn', 'nhà hàng'],
  housing: ['housing', 'apartment', 'accommodation', 'rental', 'nhà ở', 'căn hộ', 'thuê nhà', 'chỗ ở', 'lưu trú'],
  living_areas: ['living area', 'neighborhood', 'neighbourhood', 'khu vực sống', 'khu dân cư'],
  coworking: ['coworking', 'workspace', 'remote work', 'làm việc từ xa', 'không gian làm việc'],
  gym: ['gym', 'fitness', 'phòng tập', 'thể hình'],
  events: ['event', 'meetup', 'community', 'sự kiện', 'cộng đồng', 'giao lưu'],
};

/** The confirmed offers a request names; Research and discovery focus on them. Never adds an offer. */
export function focusOffers(request: string, offers: string[]): string[] {
  const text = request.normalize('NFC');
  const named = (term: string) => new RegExp(`(?<!\\p{L})${term.normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?(?!\\p{L})`, 'iu').test(text);
  return offers.filter((offer) => (OFFER_TERMS[offer] ?? [offer.replace(/_/g, ' ')]).some(named));
}

/** GoalContext for AI jobs: the first KPI (ordered by metric name) is the primary metric. */
export function goalContext(goal: Awaited<ReturnType<typeof activeGoal>>, offers: string[] = []) {
  if (!goal) return null;
  const primary = goal.kpis[0];
  return {
    id: goal.id, workspace_id: goal.workspace_id, objective: goal.title, status: goal.status,
    focus_offers: focusOffers(goal.title, offers),
    primary_conversion: goal.primary_conversion, period_days: goal.period_days, budget_usd: goal.budget_usd,
    target_qualified_visits: goal.target_qualified_visits ?? null,
    primary_metric: primary?.metric_name ?? null, baseline: primary?.baseline_value ?? null, target_value: primary?.target_value ?? null,
    // Owner-entered baselines are declarations. Performance verifies measured snapshot artifacts separately.
    kpis: goal.kpis.map((k: StoredKpi) => ({ ...k, baseline_status: k.baseline_value === null ? 'missing' : 'unverified' })),
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
      await db.query('INSERT INTO growth_kpis (goal_id, metric_name, baseline_value, target_value, current_value, measurement) VALUES ($1, $2, $3, $4, NULL, $5)',
        [goal.id, kpi.metric_name, kpi.baseline_value, kpi.target_value, JSON.stringify(kpi.measurement ?? null)]);
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
