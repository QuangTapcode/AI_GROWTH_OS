import type { Pool } from 'pg';
import { AppError } from '../../lib/errors';
import { periodSchema } from '../metrics/period';

const metrics = ['reactions','comments','shares'] as const;
type Point = { value: number | null; captured_at: string; reason: string | null };
export type SocialHistoryRow = { publishing_job_id: string; content_id: string; artifact_id: string; artifact_version: number;
  content_hash: string; title: string; external_post_id: string; connection_status: string; last_error: string | null;
  baseline: Record<string, Point> | null; current: Record<string, Point> | null };

/** Differences of observed lifetime counts; never attributed conversions or exact period reach. */
export function compareSocialObservations(row: SocialHistoryRow) {
  return { ...row, comparisons: metrics.map(metric => {
    const before = row.baseline?.[metric], after = row.current?.[metric];
    const baseline = before?.value ?? null, current = after?.value ?? null;
    const change = baseline !== null && current !== null ? current-baseline : null;
    return { metric, baseline_value: baseline, current_value: current, absolute_change: change,
      relative_change_pct: change !== null && baseline !== null && baseline !== 0 ? Math.round(change/baseline*1000000)/10000 : null,
      baseline_captured_at: before?.captured_at ?? null, current_captured_at: after?.captured_at ?? null,
      missing_reason: after?.reason ?? before?.reason ?? null,
      status: current === null ? 'current_missing' : baseline === null ? 'baseline_missing' : baseline === 0 ? 'zero_baseline' : 'compared' };
  }) };
}

export async function facebookHistoryReport(pool: Pool, workspace: string, raw: unknown) {
  const parsed = periodSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(422,'INVALID_PERIOD','Use an ordered date range of at most 366 days');
  const start = `${parsed.data.from}T00:00:00Z`, end = new Date(Date.parse(`${parsed.data.to}T00:00:00Z`)+86400000).toISOString();
  const rows = (await pool.query<SocialHistoryRow>(`SELECT pj.id AS publishing_job_id,pj.content_id,pj.artifact_id,a.version AS artifact_version,
      a.content_hash,a.title,pj.external_post_id,c.status AS connection_status,c.last_error,
      observations.baseline,observations.current
    FROM publishing_jobs pj JOIN channels ch ON ch.id=pj.channel_id AND ch.workspace_id=pj.workspace_id
    JOIN content_artifacts a ON a.id=pj.artifact_id AND a.workspace_id=pj.workspace_id
    JOIN integration_connections c ON c.workspace_id=pj.workspace_id AND c.provider='facebook_page'
      AND c.account_ref=ch.channel_identifier AND c.verified_at IS NOT NULL AND c.status IN ('connected','error')
    CROSS JOIN LATERAL (
      SELECT jsonb_object_agg(metric,jsonb_build_object('value',value,'captured_at',captured_at,'reason',missing_reason)) FILTER(WHERE bucket='baseline') AS baseline,
        jsonb_object_agg(metric,jsonb_build_object('value',value,'captured_at',captured_at,'reason',missing_reason)) FILTER(WHERE bucket='current') AS current
      FROM (SELECT DISTINCT ON (s.metric_name,CASE WHEN s.captured_at<$2 THEN 'baseline' ELSE 'current' END)
          replace(s.metric_name,'facebook_','') AS metric,
          CASE WHEN s.availability='available' THEN s.metric_value ELSE NULL END AS value,
          s.captured_at,s.missing_reason,CASE WHEN s.captured_at<$2 THEN 'baseline' ELSE 'current' END AS bucket
        FROM metrics_snapshots s WHERE s.workspace_id=pj.workspace_id AND s.provider='facebook_page'
          AND s.captured_at<$3 AND s.captured_at<=now() AND s.captured_at>=pj.published_at AND s.metadata->>'scope'='post_lifetime'
          AND s.metadata->>'publishing_job_id'=pj.id::text AND s.metadata->>'account_ref'=c.account_ref
          AND s.metadata->>'external_post_id'=pj.external_post_id AND s.metadata->>'artifact_id'=a.id::text
          AND s.metadata->>'artifact_version'=a.version::text
          AND s.metric_name IN ('facebook_reactions','facebook_comments','facebook_shares')
        ORDER BY s.metric_name,CASE WHEN s.captured_at<$2 THEN 'baseline' ELSE 'current' END,s.captured_at DESC,s.id DESC) points
    ) observations
    WHERE pj.workspace_id=$1 AND pj.status='published' AND lower(ch.platform_name)='facebook' AND pj.published_at<$3
      AND (observations.current IS NOT NULL OR pj.published_at >= $2)
    ORDER BY pj.published_at DESC,pj.id LIMIT 21`,[workspace,start,end])).rows;
  if (rows.length > 20) throw new AppError(422,'SOCIAL_BATCH_TOO_LARGE','Narrow the reporting period to at most 20 posts');
  return { from: parsed.data.from, to: parsed.data.to, timezone: 'UTC', scope: 'observed_lifetime_counter_change',
    items: rows.map(compareSocialObservations) };
}
