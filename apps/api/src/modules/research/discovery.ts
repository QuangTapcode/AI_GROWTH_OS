import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import { hostOf, policyFor, referenceUrls } from './sourcePolicy';

// docs/coordination/PILOT_LIMITS.md: <=3 queries/run, <=10 results/query, HTTP 30s, one SearXNG adapter.
export const MAX_QUERIES = 3;
export const MAX_RESULTS = 10;
const SEARCH_TIMEOUT_MS = 30_000;

export type DiscoveryProfile = { locations: string[]; audiences: string[]; products: string[] };
export type SearchResult = { url: string; title: string; engine: string | null };
export type Search = (query: string) => Promise<SearchResult[]>;

export class DiscoveryError extends Error {
  constructor(public code: string, message: string, public status = 422) { super(message); }
}

/** Deterministic queries from the confirmed profile: first location x first products, audience hint. */
export function buildDiscoveryQueries(profile: DiscoveryProfile): string[] {
  const location = profile.locations.map((x) => x.trim()).find(Boolean);
  if (!location) return [];
  const hint = profile.audiences.some((a) => /\bexpat/i.test(a)) ? ' expats' : '';
  const topics = [...new Set(profile.products.map((p) => p.replace(/_/g, ' ').trim()).filter(Boolean))];
  return topics.slice(0, MAX_QUERIES).map((topic) => `${location} ${topic}${hint}`.slice(0, 200));
}

export function searxngSearch(baseUrl: string): Search {
  return async (query) => {
    const url = new URL('/search', baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('language', 'en');
    const response = await fetch(url, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
    if (!response.ok) throw new DiscoveryError('SEARCH_UNAVAILABLE', `Search returned HTTP ${response.status}`, 502);
    const body = (await response.json()) as { results?: { url?: unknown; title?: unknown; engine?: unknown }[] };
    return (body.results ?? [])
      .filter((r) => typeof r.url === 'string' && hostOf(r.url) && typeof r.title === 'string' && r.title.trim())
      .slice(0, MAX_RESULTS)
      .map((r) => ({ url: r.url as string, title: (r.title as string).trim().slice(0, 300), engine: typeof r.engine === 'string' ? r.engine : null }));
  };
}

/**
 * Runs the bounded searches, records every result as a trend signal and queues
 * open/official pages (plus the location's open references) as URL sources.
 * New sources start as `imported`; the worker ingests them and the owner approves.
 */
export async function runDiscovery(pool: Pool, workspaceId: string, search: Search) {
  const profileRow = (await pool.query(
    'SELECT target_locations, target_audiences, products_services FROM business_profiles WHERE workspace_id=$1', [workspaceId],
  )).rows[0];
  if (!profileRow) throw new DiscoveryError('PROFILE_REQUIRED', 'Confirm the business profile before research discovery');
  const profile = { locations: profileRow.target_locations ?? [], audiences: profileRow.target_audiences ?? [], products: profileRow.products_services ?? [] };
  const queries = buildDiscoveryQueries(profile);
  if (!queries.length) throw new DiscoveryError('PROFILE_INCOMPLETE', 'Profile needs a target location and products/services');

  // Searches run sequentially and outside the transaction: they are slow and must not hold row locks.
  const results: { query: string; rank: number; result: SearchResult }[] = [];
  for (const query of queries) {
    (await search(query)).forEach((result, index) => results.push({ query, rank: index + 1, result }));
  }

  const runId = randomUUID();
  const candidates = new Map<string, string>();
  for (const url of referenceUrls(profile.locations[0])) candidates.set(url, decodeURIComponent(url.split('/wiki/')[1]).replace(/_/g, ' '));
  for (const { result } of results) if (policyFor(result.url) && !candidates.has(result.url)) candidates.set(result.url, result.title);

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspaceId]);
    const sourceIds = new Map<string, { id: string; created: boolean }>();
    for (const [url, title] of candidates) {
      const policy = policyFor(url)!;
      const existing = (await db.query(
        'SELECT id FROM sources WHERE workspace_id=$1 AND url_or_blob=$2 AND deleted_at IS NULL ORDER BY created_at LIMIT 1', [workspaceId, url],
      )).rows[0];
      if (existing) { sourceIds.set(url, { id: existing.id, created: false }); continue; }
      const inserted = (await db.query(
        `INSERT INTO sources (workspace_id, title, kind, url_or_blob, category, status, license, attribution, source_url)
         VALUES ($1, $2, 'url', $3, $4, 'imported', $5, $6, $3) RETURNING id`,
        [workspaceId, `${title} (${policy.domain})`.slice(0, 255), url, policy.category, policy.license, policy.attribution],
      )).rows[0];
      sourceIds.set(url, { id: inserted.id, created: true });
    }
    for (const { query, rank, result } of results) {
      await db.query(
        `INSERT INTO trend_signals (workspace_id, discovery_run_id, query, rank, title, url, domain, engine, source_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING`,
        [workspaceId, runId, query, rank, result.title, result.url, hostOf(result.url), result.engine, sourceIds.get(result.url)?.id ?? null],
      );
    }
    await db.query('COMMIT');
    const queued = [...sourceIds].filter(([, s]) => s.created).map(([url, s]) => ({ source_id: s.id, url }));
    return { discovery_run_id: runId, queries, signal_count: results.length, queued_sources: queued,
      existing_sources: [...sourceIds].filter(([, s]) => !s.created).map(([url, s]) => ({ source_id: s.id, url })) };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}

export const defaultSearch = () => searxngSearch(process.env.SEARXNG_URL || 'http://127.0.0.1:18081');

/**
 * Signals of the latest run (optionally observed before `before`) with their rank in the
 * previous run for the same query and URL, so Research sees what is new or rising.
 */
export async function loadSignals(pool: Pool, workspaceId: string, before: Date | null = null) {
  const runs = (await pool.query(
    `SELECT discovery_run_id FROM trend_signals WHERE workspace_id=$1 AND ($2::timestamptz IS NULL OR observed_at <= $2)
     GROUP BY discovery_run_id ORDER BY max(observed_at) DESC LIMIT 2`, [workspaceId, before],
  )).rows;
  if (!runs.length) return { discovery_run_id: null, previous_run_id: null, signals: [] };
  const [current, previous] = [runs[0].discovery_run_id, runs[1]?.discovery_run_id ?? null];
  const signals = (await pool.query(
    `SELECT s.id, s.query, s.rank, s.title, s.url, s.domain, s.source_id, s.observed_at, p.rank AS previous_rank,
            (p.id IS NULL AND EXISTS (SELECT 1 FROM trend_signals q WHERE q.workspace_id=s.workspace_id
              AND q.discovery_run_id=$3::uuid AND q.query=s.query)) AS is_new
     FROM trend_signals s LEFT JOIN trend_signals p ON p.workspace_id=s.workspace_id AND p.discovery_run_id=$3::uuid
       AND p.query=s.query AND p.url=s.url
     WHERE s.workspace_id=$1 AND s.discovery_run_id=$2 ORDER BY s.query, s.rank`, [workspaceId, current, previous],
  )).rows;
  return { discovery_run_id: current, previous_run_id: previous, signals };
}

/** Re-run discovery when the newest signals are older than `maxAgeHours` (used by the scheduler). */
export async function refreshDiscoveryIfStale(pool: Pool, workspaceId: string, search: Search, maxAgeHours: number) {
  const latest = (await pool.query('SELECT max(observed_at) AS at FROM trend_signals WHERE workspace_id=$1', [workspaceId])).rows[0]?.at;
  if (latest && Date.now() - new Date(latest).getTime() < maxAgeHours * 3_600_000) return null;
  return runDiscovery(pool, workspaceId, search);
}

/** Latest discovery run: signals (with movement) plus the ingest/review state of URL sources. */
export async function latestDiscovery(pool: Pool, workspaceId: string) {
  const { discovery_run_id, previous_run_id, signals } = await loadSignals(pool, workspaceId);
  const sources = (await pool.query(
    `SELECT id, title, url_or_blob, status, version, license, attribution, retrieved_at, ingest_attempts, ingest_error,
            (SELECT count(*)::int FROM source_chunks c WHERE c.source_id=s.id AND c.source_version=s.version) AS chunk_count
     FROM sources s WHERE workspace_id=$1 AND kind='url' AND deleted_at IS NULL AND license IS NOT NULL
     ORDER BY created_at DESC LIMIT 20`, [workspaceId],
  )).rows;
  return { discovery_run_id, previous_run_id, signals, sources };
}
