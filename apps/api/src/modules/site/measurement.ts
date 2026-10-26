import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { canonicalJson, sha256Hex } from '../../lib/hash';
import { siteForWorkspace } from '../../lib/sites';

const WINDOW_DAYS = 7;
const NOT_CONNECTED = 'search_console_not_connected';

/**
 * First-party measurement for the learning loop, pinned to the current knowledge context.
 *
 * - qualified_visits: non-internal sessions that viewed a published post AND clicked its CTA in
 *   the window (PILOT.md qualifier: topic page + CTA signal; a behavioural proxy, not identity).
 * - leads: successful lead submissions for the site in the window, synthetic fixtures excluded.
 * - impressions/clicks: search metrics need Search Console; declared unavailable, never 0.
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

  const site = siteForWorkspace(workspaceId);
  const end = new Date(Math.floor(Date.now() / 60_000) * 60_000);
  const start = new Date(end.getTime() - WINDOW_DAYS * 86_400_000);
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

  const metricsResult = {
    workspace_id: workspaceId, snapshot_id: randomUUID(), version: 1,
    window_start: start.toISOString(), window_end: end.toISOString(),
    qualified_visits: counts.qualified_visits, leads: counts.leads, impressions: null, clicks: null,
    synthetic: false, source: 'first_party', unavailable: { impressions: NOT_CONNECTED, clicks: NOT_CONNECTED },
  };
  const leadResult = { workspace_id: workspaceId, version: 1, count: counts.leads, synthetic: false };
  const metricsId = await ledgerArtifact(pool, workspaceId, contextSnapshotId, 'metrics.snapshot', 'First-party site metrics', metricsResult,
    { page_views: counts.page_views, internal_page_views: counts.internal_page_views, site_id: site?.site_id ?? null });
  const leadId = await ledgerArtifact(pool, workspaceId, contextSnapshotId, 'lead.aggregate', 'Lead count (aggregate only)', leadResult,
    { window_start: metricsResult.window_start, window_end: metricsResult.window_end });
  return { metrics_artifact_id: metricsId, lead_aggregate_id: leadId, created: true, counts };
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
