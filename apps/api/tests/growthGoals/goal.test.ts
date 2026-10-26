import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { goalContext, goalInputSchema, setGoal } from '../../src/modules/growthGoals/service';

const input = {
  title: 'Grow qualified expat traffic and lead requests', primary_conversion: 'generate_lead', period_days: 90, budget_usd: 0,
  target_qualified_visits: 300,
  kpis: [{ metric_name: 'qualified_visits', baseline_value: null, target_value: 300 }, { metric_name: 'leads', baseline_value: null, target_value: 15 }],
};

describe('growth goal', () => {
  it('validates measurable goals and keeps unknown baselines as null', () => {
    expect(goalInputSchema.safeParse(input).success).toBe(true);
    expect(goalInputSchema.safeParse({ ...input, kpis: [] }).success).toBe(false);
    expect(goalInputSchema.safeParse({ ...input, extra: 1 }).success).toBe(false);
  });

  it('maps the first KPI to the AI GoalContext', () => {
    const ctx = goalContext({ id: 'g', workspace_id: 'w', title: input.title, status: 'active', primary_conversion: 'generate_lead',
      period_days: 90, budget_usd: 0, target_qualified_visits: 300, target_traffic_pct: null,
      kpis: [{ metric_name: 'leads', baseline_value: null, target_value: 15, current_value: null }] } as never);
    expect(ctx).toMatchObject({ objective: input.title, primary_metric: 'leads', baseline: null, target_value: 15, period_days: 90 });
    expect(goalContext(null)).toBeNull();
  });

  it('archives the previous goal and inserts KPIs atomically', async () => {
    const sql: string[] = [];
    const query = vi.fn(async (text: string) => {
      sql.push(text);
      if (text.includes('INSERT INTO growth_goals')) return { rows: [{ id: 'goal-1' }] };
      if (text.includes('FROM growth_goals')) return { rows: [{ id: 'goal-1', workspace_id: 'w', title: input.title, status: 'active', budget_usd: '0.00', target_traffic_pct: null }] };
      return { rows: [] };
    });
    const pool = { query, connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
    const goal = await setGoal(pool, 'w', input);
    expect(sql.findIndex((s) => s.includes("SET status='archived'"))).toBeLessThan(sql.findIndex((s) => s.includes('INSERT INTO growth_goals')));
    expect(sql.filter((s) => s.includes('INSERT INTO growth_kpis'))).toHaveLength(2);
    expect(sql).toContain('COMMIT');
    expect(goal?.budget_usd).toBe(0);
  });
});
