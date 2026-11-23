import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Pool } from 'pg';
import { AppError } from '../../lib/errors';
import { siteForWorkspace, resolveSite } from '../../lib/sites';

export const experimentSchema = z.object({
  hypothesis: z.string().trim().min(5).max(500),
  content_slug: z.string().regex(/^[a-z0-9-]{1,160}$/).nullable().default(null),
  control_cta: z.string().trim().min(1).max(200), treatment_cta: z.string().trim().min(1).max(200),
  starts_at: z.string().datetime({ offset: true }), ends_at: z.string().datetime({ offset: true }),
  min_exposures: z.number().int().min(100).max(1000000).default(100),
}).strict().refine(v => v.control_cta !== v.treatment_cta && Date.parse(v.ends_at) > Date.parse(v.starts_at) &&
  Date.parse(v.ends_at) - Date.parse(v.starts_at) <= 90 * 86400000, 'Use distinct CTAs and an ordered period of at most 90 days');

export async function createExperiment(pool: Pool, workspace: string, raw: unknown) {
  const parsed = experimentSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(422, 'INVALID_EXPERIMENT', parsed.error.message);
  const site = siteForWorkspace(workspace), input = parsed.data;
  if (!site) throw new AppError(409, 'SITE_REQUIRED', 'Configure a public site before creating an experiment');
  if (Date.parse(input.ends_at) <= Date.now()) throw new AppError(422, 'INVALID_EXPERIMENT', 'A new experiment must end in the future');
  if (input.content_slug && !(await pool.query("SELECT 1 FROM contents WHERE workspace_id=$1 AND site_id=$2 AND slug=$3 AND status='published'", [workspace, site.site_id, input.content_slug])).rowCount) {
    throw new AppError(422, 'PUBLISHED_CONTENT_REQUIRED', 'Use a published article or the landing page');
  }
  return (await pool.query(`INSERT INTO performance_experiments(workspace_id,site_id,content_slug,hypothesis,control_cta,treatment_cta,starts_at,ends_at,min_exposures)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [workspace, site.site_id, input.content_slug, input.hypothesis,
    input.control_cta, input.treatment_cta, input.starts_at, input.ends_at, input.min_exposures])).rows[0];
}

/** Starting is the owner's explicit approval of both CTA variants. Copy and period are immutable thereafter. */
export async function changeExperiment(pool: Pool, workspace: string, id: string, actor: string, action: 'start' | 'stop') {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Serialize transitions per workspace, including expiration, before checking the unique page slot.
    const owner = await db.query(`SELECT w.id FROM workspaces w JOIN memberships m ON m.workspace_id=w.id
      WHERE w.id=$1 AND m.user_id=$2 AND m.role='owner' AND m.status='active' FOR UPDATE OF w`, [workspace, actor]);
    if (!owner.rowCount) throw new AppError(409, 'EXPERIMENT_STATE_CONFLICT', 'Experiment is absent or cannot make that transition');
    if (action === 'start') await db.query(`UPDATE performance_experiments e SET status='stopped',stopped_at=e.ends_at
      FROM performance_experiments target WHERE target.workspace_id=$1 AND target.id=$2 AND target.status='draft'
        AND e.workspace_id=target.workspace_id AND e.site_id=target.site_id
        AND e.content_slug IS NOT DISTINCT FROM target.content_slug AND e.status='running' AND e.ends_at<=now()`, [workspace, id]);
    const result = await db.query(action === 'start'
      ? "UPDATE performance_experiments SET status='running',approved_by=$3,approved_at=now() WHERE workspace_id=$1 AND id=$2 AND status='draft' AND ends_at>now() AND EXISTS(SELECT 1 FROM memberships WHERE workspace_id=$1 AND user_id=$3 AND role='owner' AND status='active') RETURNING *"
      : "UPDATE performance_experiments SET status='stopped',stopped_at=now() WHERE workspace_id=$1 AND id=$2 AND status='running' AND EXISTS(SELECT 1 FROM memberships WHERE workspace_id=$1 AND user_id=$3 AND role='owner' AND status='active') RETURNING *",
    [workspace, id, actor]);
    if (!result.rowCount) throw new AppError(409, 'EXPERIMENT_STATE_CONFLICT', 'Experiment is absent or cannot make that transition');
    await db.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await db.query('ROLLBACK');
    if ((error as { code?: string }).code === '23505') throw new AppError(409, 'EXPERIMENT_ALREADY_RUNNING', 'Stop the existing experiment on this page first');
    throw error;
  } finally { db.release(); }
}

export const assignmentSchema = z.object({ visitor_id: z.string().uuid(), content_slug: z.string().regex(/^[a-z0-9-]{1,160}$/).nullable().default(null),
  assignment_id: z.string().uuid().optional() }).strict();

export async function assignExperiment(pool: Pool, siteId: string, raw: unknown, internal: boolean) {
  const parsed = assignmentSchema.safeParse(raw), site = resolveSite(siteId);
  if (!parsed.success) throw new AppError(422, 'INVALID_ASSIGNMENT', 'Expected anonymous visitor_id and optional published content_slug');
  if (!site || site.status !== 'active') throw new AppError(404, 'SITE_NOT_FOUND', 'Unknown site');
  const input = parsed.data;
  const hash = createHash('sha256').update(`${siteId}:${input.visitor_id}`).digest('hex');
  if (input.assignment_id) {
    const exposed = await pool.query(`UPDATE performance_assignments a SET exposed_at=COALESCE(a.exposed_at,now())
      FROM performance_experiments e WHERE a.id=$1 AND a.visitor_hash=$2 AND e.id=a.experiment_id
        AND e.workspace_id=$3 AND e.site_id=$4 AND e.status='running' AND now()>=e.starts_at AND now()<e.ends_at
        AND e.content_slug IS NOT DISTINCT FROM $5 RETURNING a.id`, [input.assignment_id, hash, site.workspace_id, siteId, input.content_slug]);
    return { recorded: exposed.rowCount === 1 };
  }
  const result = await pool.query(`WITH active AS (
      SELECT * FROM performance_experiments WHERE workspace_id=$1 AND site_id=$2 AND content_slug IS NOT DISTINCT FROM $3
        AND status='running' AND now()>=starts_at AND now()<ends_at FOR SHARE
    ), assignment AS (
      INSERT INTO performance_assignments(experiment_id,visitor_hash,variant,internal)
      SELECT id,$4::text,CASE WHEN (('x'||substr(md5(id::text||':'||$4::text),1,8))::bit(32)::bigint % 2)=0 THEN 'control' ELSE 'treatment' END,$5::boolean FROM active
      ON CONFLICT(experiment_id,visitor_hash) DO UPDATE SET visitor_hash=EXCLUDED.visitor_hash
      RETURNING *
    ) SELECT a.id AS assignment_id,a.variant,CASE WHEN a.variant='control' THEN e.control_cta ELSE e.treatment_cta END AS cta
      FROM assignment a JOIN active e ON e.id=a.experiment_id`, [site.workspace_id, siteId, input.content_slug, hash, internal]);
  return result.rows[0] ?? null;
}

export function wilson(conversions: number, exposures: number) {
  if (!exposures) return { low: 0, high: 1 };
  const z = 1.959963984540054, p = conversions / exposures, denominator = 1 + z*z/exposures;
  const middle = (p + z*z/(2*exposures))/denominator;
  const spread = z * Math.sqrt(p*(1-p)/exposures + z*z/(4*exposures*exposures))/denominator;
  return { low: Math.max(0,middle-spread), high: Math.min(1,middle+spread) };
}

export function experimentVerdict(experiment: { ends_at: string | Date; stopped_at?: string | Date | null; min_exposures: number }, rows: { variant: string; exposures: number; conversions: number }[]) {
  const variants = ['control','treatment'].map(variant => {
    const row = rows.find(r => r.variant === variant), exposures = Number(row?.exposures ?? 0), conversions = Number(row?.conversions ?? 0);
    return { variant, exposures, conversions, conversion_rate: exposures ? conversions/exposures : null, interval_95: wilson(conversions, exposures) };
  });
  const end = new Date(experiment.ends_at).getTime();
  const status = experiment.stopped_at && new Date(experiment.stopped_at).getTime() < end ? 'stopped_early_no_verdict'
    : Date.now() < end ? 'running_no_verdict'
    : variants.some(v => v.exposures < experiment.min_exposures) ? 'insufficient_sample'
    : 'analyzed';
  const [control,treatment] = variants;
  const winner = status !== 'analyzed' ? null : treatment.interval_95.low > control.interval_95.high ? 'treatment'
    : control.interval_95.low > treatment.interval_95.high ? 'control' : null;
  return { variants, status, winner, method: 'fixed_horizon_non_overlapping_95pct_wilson_intervals', primary_metric: 'persisted_leads_per_exposed_visitor' };
}

export async function listExperiments(pool: Pool, workspace: string) {
  const experiments = (await pool.query<{ id: string; workspace_id: string; site_id: string; content_slug: string | null;
    hypothesis: string; control_cta: string; treatment_cta: string; status: string; starts_at: Date; ends_at: Date;
    stopped_at: Date | null; min_exposures: number }>('SELECT * FROM performance_experiments WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 50', [workspace])).rows;
  const output = [];
  for (const experiment of experiments) {
    const rows = (await pool.query(`SELECT a.variant,count(*)::int AS exposures,
        count(*) FILTER (WHERE EXISTS(SELECT 1 FROM leads l WHERE l.workspace_id=e.workspace_id AND l.site_id=e.site_id
          AND l.context->>'assignment_id'=a.id::text AND COALESCE(l.context->>'synthetic','false') <> 'true'
          AND l.captured_at >= a.exposed_at AND l.captured_at < e.ends_at
          AND (e.stopped_at IS NULL OR l.captured_at <= e.stopped_at)))::int AS conversions
      FROM performance_assignments a JOIN performance_experiments e ON e.id=a.experiment_id
      WHERE e.workspace_id=$1 AND e.id=$2 AND a.exposed_at IS NOT NULL AND NOT a.internal GROUP BY a.variant`, [workspace, experiment.id])).rows;
    output.push({ ...experiment, results: experimentVerdict(experiment, rows) });
  }
  return output;
}
