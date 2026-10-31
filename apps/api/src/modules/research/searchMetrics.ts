import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import { canonicalJson, sha256Hex } from '../../lib/hash';
import { fetchGscResearchQueries } from '../integrations/liveMetrics';

const rowSchema = z.object({ keys: z.tuple([z.string().min(1).max(200)]), clicks: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative(), ctr: z.number().finite().min(0).max(1), position: z.number().finite().nonnegative() });
const responseSchema = z.object({ rows: z.array(rowSchema).max(100).default([]) });

export function researchMetricsRange(now = new Date()) {
  // Final data can lag. End three calendar days ago; GSC dates use Pacific time.
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const end = new Date(Date.parse(`${date}T00:00:00Z`) - 3 * 86400000);
  return { from: new Date(end.getTime() - 27 * 86400000).toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

/** Credentials remain server-side. An existing verified workspace/property binding is required. */
export async function syncResearchSearchMetrics(pool: Pool, workspaceId: string, contextId: string, range = researchMetricsRange(), maxAgeHours = 24) {
  const unavailable = (reason: string) => ({ status: 'unavailable' as const, reason });
  if (process.env.INTEGRATION_MODE !== 'production' || !process.env.GSC_SITE_URL ||
      !(process.env.GSC_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON)) return unavailable('gsc_not_configured');
  const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  if (!validDate(range.from) || !validDate(range.to) || range.from > range.to || range.to > researchMetricsRange().to)
    throw new AppError(422, 'INVALID_GSC_WINDOW', 'Use valid completed dates ending at least three Pacific calendar days ago');
  const context = (await pool.query('SELECT snapshot_id FROM knowledge_contexts WHERE workspace_id=$1 AND snapshot_id=$2 AND current', [workspaceId, contextId])).rows[0];
  if (!context) throw new AppError(409, 'STALE_CONTEXT', 'A current workspace context is required');
  const connection = (await pool.query("SELECT account_ref FROM integration_connections WHERE workspace_id=$1 AND provider='gsc' AND account_ref=$2 AND status='connected' AND verified_at IS NOT NULL", [workspaceId, process.env.GSC_SITE_URL])).rows[0];
  if (!connection) return unavailable('gsc_property_not_verified_for_workspace');
  const cached = (await pool.query(`SELECT id FROM content_artifacts WHERE workspace_id=$1 AND context_snapshot_id=$2 AND operation='research.search_metrics'
    AND payload->'result'->>'site_url'=$3 AND payload->'result'->>'window_start'=$4 AND payload->'result'->>'window_end'=$5
    AND created_at>now()-make_interval(hours=>$6) ORDER BY created_at DESC LIMIT 1`, [workspaceId, contextId, connection.account_ref, range.from, range.to, maxAgeHours])).rows[0];
  if (cached) return { status: 'available' as const, artifact_id: cached.id, cached: true };
  const parsed = responseSchema.safeParse(await fetchGscResearchQueries(connection.account_ref, range.from, range.to));
  if (!parsed.success) throw new AppError(502, 'INVALID_GSC_RESPONSE', 'GSC returned invalid query measurements');
  const result = { workspace_id: workspaceId, version: 1, snapshot_id: randomUUID(), site_url: connection.account_ref,
    window_start: range.from, window_end: range.to, observed_at: new Date().toISOString(), timezone: 'America/Los_Angeles',
    scope: 'website_property_only', coverage: 'top_queries_not_exhaustive', synthetic: false,
    rows: parsed.data.rows.map(r => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })) };
  const id = randomUUID(), hash = sha256Hex(canonicalJson({ result, evidence: [] }));
  const artifact = { artifact_id: id, workspace_id: workspaceId, context_snapshot_id: contextId, version: 1, content_hash: hash, role: 'research', storage: 'postgres_ledger' };
  await pool.query(`INSERT INTO content_artifacts(id,workspace_id,context_snapshot_id,version,content_hash,role,operation,artifact_type,title,storage,payload,evidence)
    VALUES($1,$2,$3,1,$4,'research','research.search_metrics','measurement','Website query measurements','postgres_ledger',$5,'[]')`,
    [id, workspaceId, contextId, hash, JSON.stringify({ artifact, result })]);
  return { status: 'available' as const, artifact_id: id, cached: false, rows: result.rows.length };
}
