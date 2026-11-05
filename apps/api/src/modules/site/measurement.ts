import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { canonicalJson, sha256Hex } from '../../lib/hash';
import { siteForWorkspace } from '../../lib/sites';
import { fetchGscTotals } from '../integrations/liveMetrics';

const WINDOW_DAYS = 7;
const NOT_CONNECTED = 'search_console_not_connected';
const SEARCH_SETTLE_DAYS = 3;

/** Pin one measured historical window, not the latest overlapping rolling snapshot.
 * Old contexts are deliberately excluded; scope/definition/timezone are checked again by AI.
 */
export async function baselineMetricArtifact(pool: Pool, workspaceId: string, contextSnapshotId: string, currentId: string) {
  const row = (await pool.query(
    `SELECT b.id FROM content_artifacts b JOIN content_artifacts c
       ON c.workspace_id=b.workspace_id AND c.context_snapshot_id=b.context_snapshot_id
     WHERE c.workspace_id=$1 AND c.context_snapshot_id=$2 AND c.id=$3 AND b.id<>c.id
       AND b.operation='metrics.snapshot' AND c.operation='metrics.snapshot'
       AND (b.payload->'result'->>'window_end')::timestamptz <= (c.payload->'result'->>'window_start')::timestamptz
       AND (b.payload->'result'->>'window_end')::timestamptz - (b.payload->'result'->>'window_start')::timestamptz
         = (c.payload->'result'->>'window_end')::timestamptz - (c.payload->'result'->>'window_start')::timestamptz
       AND b.payload->'result'->'metric_definitions' = c.payload->'result'->'metric_definitions'
       AND b.payload->'result'->>'timezone' = c.payload->'result'->>'timezone'
       AND b.payload->'result'->>'synthetic' = c.payload->'result'->>'synthetic'
     ORDER BY (b.payload->'result'->>'window_start')::timestamptz, b.created_at, b.id LIMIT 1`,
    [workspaceId, contextSnapshotId, currentId],
  )).rows[0];
  return row?.id as string | undefined;
}

/**
 * First-party measurement for the learning loop, pinned to the current knowledge context.
 *
 * - qualified_visits: non-internal sessions that viewed a published post AND clicked its CTA in
 *   the window (PILOT.md qualifier: topic page + CTA signal; a behavioural proxy, not identity).
 * - leads: successful lead submissions for the site in the window, synthetic fixtures excluded.
 * - impressions/clicks: Search Console totals when the property is connected; otherwise declared unavailable, never 0.
 *
 * Results are stored as backend ledger artifacts (storage=postgres_ledger) whose content hash
 * is verified by the AI service like any other upstream artifact.
 */
export async function ensureMeasurementArtifacts(pool: Pool, workspaceId: string, contextSnapshotId: string, maxAgeHours = 1) {
  const fresh = (await pool.query(
    `SELECT operation, id FROM content_artifacts WHERE workspace_id=$1 AND context_snapshot_id=$2
       AND operation IN ('metrics.snapshot','lead.aggregate') AND created_at > now() - make_interval(hours => $3)
     ORDER BY created_at DESC`, [workspaceId, contextSnapshotId, maxAgeHours],
  )).rows;
  const metric = fresh.find((r) => r.operation === 'metrics.snapshot');
  const leadAgg = fresh.find((r) => r.operation === 'lead.aggregate');
  if (metric && leadAgg) return { metrics_artifact_id: metric.id as string, lead_aggregate_id: leadAgg.id as string, created: false };

  const end = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const start = new Date(end.getTime() - WINDOW_DAYS * 86_400_000);
  const { result: metricsResult, counts, measurement } = await measureWindow(pool, workspaceId, start, end);
  const leadResult = { workspace_id: workspaceId, version: 1, count: counts.leads, synthetic: false };
  const metricsId = await ledgerArtifact(pool, workspaceId, contextSnapshotId, 'metrics.snapshot', 'First-party site metrics', metricsResult, measurement);
  const leadId = await ledgerArtifact(pool, workspaceId, contextSnapshotId, 'lead.aggregate', 'Lead count (aggregate only)', leadResult,
    { window_start: metricsResult.window_start, window_end: metricsResult.window_end });
  return { metrics_artifact_id: metricsId, lead_aggregate_id: leadId, created: true, counts };
}

/** Definitions shared by every first-party snapshot and by KPIs measured from them; they must match exactly. */
export function firstPartyMetricDefinitions(workspaceId: string) {
  const scope = `workspace:${workspaceId}:site:${siteForWorkspace(workspaceId)?.site_id ?? 'none'}`;
  return {
    qualified_visits: { definition: 'Non-internal sessions viewing a published post and clicking a CTA in the window', unit: 'count', source: 'first_party' as const, scope },
    leads: { definition: 'Non-synthetic lead submissions captured in the window', unit: 'count', source: 'first_party' as const, scope },
  };
}

/**
 * KPI comparison needs an earlier, non-overlapping window of the same length. With a new goal none
 * exists for a week, so measure the window right before the current snapshot from the same
 * first-party events and leads (real history, not an assumed zero).
 */
export async function ensureBaselineArtifact(pool: Pool, workspaceId: string, contextSnapshotId: string, currentId: string) {
  const existing = await baselineMetricArtifact(pool, workspaceId, contextSnapshotId, currentId);
  if (existing) return existing;
  const current = (await pool.query(
    "SELECT payload->'result' AS result FROM content_artifacts WHERE workspace_id=$1 AND context_snapshot_id=$2 AND id=$3 AND operation='metrics.snapshot'",
    [workspaceId, contextSnapshotId, currentId],
  )).rows[0]?.result;
  if (!current || current.synthetic !== false || current.source !== 'first_party') return undefined;
  const end = new Date(current.window_start);
  const start = new Date(end.getTime() - (Date.parse(current.window_end) - end.getTime()));
  const { result, measurement } = await measureWindow(pool, workspaceId, start, end);
  return ledgerArtifact(pool, workspaceId, contextSnapshotId, 'metrics.snapshot', 'First-party site metrics (baseline window)', result, measurement);
}

async function measureWindow(pool: Pool, workspaceId: string, start: Date, end: Date) {
  const site = siteForWorkspace(workspaceId);
  const counts = (await pool.query(
    `SELECT
       (SELECT count(DISTINCT v.session_id) FROM site_events v WHERE v.workspace_id=$1 AND v.event_type='page_view'
          AND v.content_id IS NOT NULL AND NOT v.internal AND v.occurred_at >= $2 AND v.occurred_at < $3
          AND EXISTS (SELECT 1 FROM site_events c WHERE c.workspace_id=v.workspace_id AND c.session_id=v.session_id
            AND c.event_type='cta_click' AND NOT c.internal AND c.occurred_at >= $2 AND c.occurred_at < $3))::int AS qualified_visits,
       (SELECT count(*) FROM site_events WHERE workspace_id=$1 AND event_type='page_view' AND NOT internal
          AND occurred_at >= $2 AND occurred_at < $3)::int AS page_views,
       (SELECT count(*) FROM site_events WHERE workspace_id=$1 AND event_type='page_view' AND internal
          AND occurred_at >= $2 AND occurred_at < $3)::int AS internal_page_views,
       (SELECT count(*) FROM leads WHERE workspace_id=$1 AND ($4::text IS NULL OR site_id=$4)
          AND captured_at >= $2 AND captured_at < $3
          AND COALESCE(context->>'synthetic', 'false') <> 'true')::int AS leads`,
    [workspaceId, start, end, site?.site_id ?? null],
  )).rows[0];
  const search = await searchTotals(pool, workspaceId, start, end);
  // Article titles and counts only: never a session, address or person.
  const articles = (await pool.query<{ slug: string; title: string; page_views: number; cta_clicks: number }>(
    `SELECT c.slug, c.title,
        count(*) FILTER (WHERE e.event_type='page_view')::int AS page_views,
        count(*) FILTER (WHERE e.event_type='cta_click')::int AS cta_clicks
       FROM site_events e JOIN contents c ON c.id=e.content_id AND c.workspace_id=e.workspace_id
      WHERE e.workspace_id=$1 AND NOT e.internal AND e.occurred_at >= $2 AND e.occurred_at < $3 AND c.slug IS NOT NULL
      GROUP BY c.id, c.slug, c.title ORDER BY cta_clicks DESC, page_views DESC, c.slug LIMIT 20`,
    [workspaceId, start, end],
  )).rows;
  const utmRows = (await pool.query<{ utm_source: string; leads: number }>(
    `SELECT COALESCE(NULLIF(trim(utm_source), ''), NULLIF(trim(context->>'source_channel'), ''), NULLIF(trim(context->>'platform'), ''), 'direct') AS utm_source,
            count(*)::int AS leads
       FROM leads
      WHERE workspace_id=$1 AND ($4::text IS NULL OR site_id=$4 OR site_id IS NULL)
        AND captured_at >= $2 AND captured_at < $3
        AND COALESCE(context->>'synthetic', 'false') <> 'true'
      GROUP BY 1 ORDER BY 2 DESC`,
    [workspaceId, start, end, site?.site_id ?? null],
  )).rows;
  const socialRows = (await pool.query<{ platform_name: string; published_count: number }>(
    `SELECT ch.platform_name, count(*)::int AS published_count
       FROM publishing_jobs pj
       JOIN channels ch ON ch.id = pj.channel_id AND ch.workspace_id = pj.workspace_id
      WHERE pj.workspace_id=$1 AND pj.status='published'
        AND pj.published_at >= $2 AND pj.published_at < $3
      GROUP BY 1`,
    [workspaceId, start, end],
  )).rows;
  const result = {
    workspace_id: workspaceId, snapshot_id: randomUUID(), version: 1,
    window_start: start.toISOString(), window_end: end.toISOString(),
    qualified_visits: counts.qualified_visits, leads: counts.leads,
    impressions: 'impressions' in search ? search.impressions : null, clicks: 'clicks' in search ? search.clicks : null,
    synthetic: false, source: 'first_party',
    unavailable: 'reason' in search ? { impressions: search.reason, clicks: search.reason } : {},
    captured_at: new Date().toISOString(), timezone: 'UTC',
    metric_definitions: firstPartyMetricDefinitions(workspaceId),
    content_metrics: articles,
  };
  return { result, counts, measurement: { page_views: counts.page_views, internal_page_views: counts.internal_page_views, site_id: site?.site_id ?? null,
    utm_sources: Object.fromEntries(utmRows.map((r) => [r.utm_source, r.leads])),
    published_social_posts: Object.fromEntries(socialRows.map((r) => [r.platform_name, r.published_count])),
    ...('coverage' in search ? { search_console: search.coverage } : {}) } };
}

/** Totals for the part of the window Search Console has settled; a missing or failed source is declared, never 0. */
async function searchTotals(pool: Pool, workspaceId: string, start: Date, end: Date) {
  if (process.env.INTEGRATION_MODE !== 'production' || !process.env.GSC_SITE_URL ||
      !(process.env.GSC_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON)) return { reason: NOT_CONNECTED };
  const connection = (await pool.query<{ account_ref: string }>(
    `SELECT account_ref FROM integration_connections WHERE workspace_id=$1 AND provider='gsc' AND account_ref=$2
       AND status='connected' AND verified_at IS NOT NULL`,
    [workspaceId, process.env.GSC_SITE_URL],
  )).rows[0];
  if (!connection) return { reason: NOT_CONNECTED };
  const from = start.toISOString().slice(0, 10);
  const settled = new Date(Date.now() - SEARCH_SETTLE_DAYS * 86_400_000).toISOString().slice(0, 10);
  const to = [end.toISOString().slice(0, 10), settled].sort()[0];
  if (from > to) return { reason: 'search_console_data_not_settled' };
  try {
    const totals = await fetchGscTotals(from, to);
    return { ...totals, coverage: { site_url: connection.account_ref, from, to } };
  } catch {
    return { reason: 'search_console_request_failed' };
  }
}

async function ledgerArtifact(pool: Pool, workspaceId: string, contextSnapshotId: string, operation: string, title: string,
  result: Record<string, unknown>, measurement: Record<string, unknown>) {
  const id = randomUUID();
  const hash = sha256Hex(canonicalJson({ result, evidence: [] }));
  const artifact = { artifact_id: id, workspace_id: workspaceId, version: 1, content_hash: hash, context_snapshot_id: contextSnapshotId,
    role: 'performance', storage: 'postgres_ledger' };
  await pool.query(
    `INSERT INTO content_artifacts (id, workspace_id, version, content_hash, context_snapshot_id, role, operation, artifact_type, title, storage, payload, evidence)
     VALUES ($1, $2, 1, $3, $4, 'performance', $5, 'measurement', $6, 'postgres_ledger', $7, '[]')`,
    [id, workspaceId, hash, contextSnapshotId, operation, title, JSON.stringify({ artifact, result, measurement })],
  );
  return id;
}
