import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { expect, it } from 'vitest';
import { goalContext, goalInputSchema, setGoal } from '../../src/modules/growthGoals/service';
import { baselineMetricArtifact } from '../../src/modules/site/measurement';

// Connection-local TEMP tables shadow public tables and disappear on disconnect.
// This checks real PostgreSQL SQL without modifying business goals or artifacts.
it.skipIf(process.env.RUN_KPI_DB_TESTS !== '1')('persists KPI metadata and selects only comparable historical artifacts in PostgreSQL', async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:15432/ai_growth_os', connectionTimeoutMillis: 3000 });
  const db = await pool.connect();
  try {
    await db.query('CREATE TEMP TABLE workspaces(id uuid)');
    await db.query('CREATE TEMP TABLE growth_goals (LIKE public.growth_goals INCLUDING DEFAULTS)');
    await db.query('CREATE TEMP TABLE growth_kpis (LIKE public.growth_kpis INCLUDING DEFAULTS)');
    await db.query('CREATE TEMP TABLE content_artifacts(id uuid, workspace_id uuid, context_snapshot_id uuid, operation text, payload jsonb, created_at timestamptz DEFAULT now())');
    const workspace = randomUUID(), context = randomUUID();
    await db.query('INSERT INTO workspaces(id) VALUES($1)', [workspace]);
    const scoped = { query: db.query.bind(db), connect: async () => ({ query: db.query.bind(db), release() {} }) } as unknown as Pool;
    const measurement = { definition: 'Non-synthetic lead submissions captured in the window', unit: 'count', source: 'first_party', scope: `workspace:${workspace}` };
    const goal = await setGoal(scoped, workspace, goalInputSchema.parse({ title: 'Measure qualified leads', primary_conversion: 'generate_lead', period_days: 30, budget_usd: 0,
      kpis: [{ metric_name: 'leads', baseline_value: null, target_value: 15, measurement }] }));
    expect(goalContext(goal)?.kpis[0]).toMatchObject({ measurement, baseline_value: null, baseline_status: 'missing', target_value: 15 });
    const current = randomUUID(), baseline = randomUUID();
    const definitions = { leads: measurement };
    const insert = async (id: string, ws: string, start: string, end: string, defs = definitions) => db.query(
      "INSERT INTO content_artifacts VALUES($1,$2,$3,'metrics.snapshot',$4,now())",
      [id, ws, context, JSON.stringify({ result: { window_start: start, window_end: end, metric_definitions: defs, timezone: 'UTC', synthetic: true } })]);
    await insert(current, workspace, '2026-10-08T00:00:00Z', '2026-10-15T00:00:00Z');
    await insert(randomUUID(), workspace, '2026-10-07T00:00:00Z', '2026-10-14T00:00:00Z'); // Overlaps.
    await insert(randomUUID(), randomUUID(), '2026-09-01T00:00:00Z', '2026-09-08T00:00:00Z'); // Foreign tenant.
    await insert(randomUUID(), workspace, '2026-09-01T00:00:00Z', '2026-09-08T00:00:00Z', { leads: { ...measurement, scope: 'other' } });
    expect(await baselineMetricArtifact(scoped, workspace, context, current)).toBeUndefined();
    await insert(baseline, workspace, '2026-10-01T00:00:00Z', '2026-10-08T00:00:00Z');
    expect(await baselineMetricArtifact(scoped, workspace, context, current)).toBe(baseline);
    expect(await baselineMetricArtifact(scoped, workspace, randomUUID(), current)).toBeUndefined();
  } finally {
    db.release(true);
    await pool.end();
  }
});
