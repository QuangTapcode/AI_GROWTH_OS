import type { Pool } from 'pg';

/** Daily provider measurements keep their native date/timezone; never claim a rolling UTC window is fully covered. */
export async function aggregateProviderMetrics(pool: Pool, workspaceId: string, start: Date, end: Date) {
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const to = new Date(Date.parse(end.toISOString().slice(0,10)) - 86_400_000).toISOString().slice(0,10);
  const from = new Date(Date.parse(to) - (days - 1) * 86_400_000).toISOString().slice(0,10);
  const rows = (await pool.query<{
    metric_name: string; date: string; metric_value: string | null; availability: string;
    timezone: string; currency: string; account_ref: string;
  }>(`SELECT DISTINCT ON (s.metric_name,s.period_from) s.metric_name, to_char(s.period_from,'YYYY-MM-DD') AS date,
         s.metric_value,s.availability,s.timezone,s.currency,c.account_ref
       FROM metrics_snapshots s JOIN integration_connections c
         ON c.workspace_id=s.workspace_id AND c.provider=s.provider AND c.status='connected' AND c.verified_at IS NOT NULL
         AND s.metadata->>'account_ref'=c.account_ref
       WHERE s.workspace_id=$1 AND s.period_from=s.period_to AND s.period_from BETWEEN $2::date AND $3::date
         AND ((s.provider='ga4' AND s.metric_name IN ('sessions','pageviews')) OR (s.provider='meta_ads' AND s.metric_name IN ('ad_spend','ad_clicks','ad_impressions')))
       ORDER BY s.metric_name,s.period_from,s.captured_at DESC,s.id DESC`, [workspaceId, from, to])).rows;
  const values: Record<string, number | null> = {}, unavailable: Record<string, string> = {};
  const coverage: Record<string, Record<string, unknown>> = {}, definitions: Record<string, Record<string, string>> = {};
  let currency: string | undefined;
  const expectedDays = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  for (const metric of ['sessions', 'pageviews', 'ad_spend', 'ad_clicks', 'ad_impressions']) {
    const points = rows.filter(r => r.metric_name === metric);
    const valid = points.filter(r => r.availability === 'available' && r.metric_value !== null);
    const zones = new Set(points.map(p => p.timezone)), accounts = new Set(points.map(p => p.account_ref));
    const currencies = new Set(points.map(p => p.currency));
    const incompatible = zones.size !== 1 || accounts.size !== 1 || (metric === 'ad_spend' && currencies.size !== 1);
    values[metric] = valid.length && !incompatible ? valid.reduce((sum, p) => sum + Number(p.metric_value), 0) : null;
    if (values[metric] === null) unavailable[metric] = points.length ? 'INCOMPATIBLE_OR_MISSING_PROVIDER_DATA' : 'PROVIDER_SNAPSHOT_MISSING';
    const timezone = points[0]?.timezone;
    let knownTimezone = false;
    try { if (timezone) { new Intl.DateTimeFormat('en', { timeZone: timezone }); knownTimezone = true; } } catch { /* Unknown provider timezone is not complete coverage. */ }
    const complete = valid.length === expectedDays && !incompatible && knownTimezone;
    coverage[metric] = { status: complete ? 'available' : valid.length ? 'partial' : 'missing', from, to, timezone, days: valid.length, expected_days: expectedDays };
    if (points.length && !incompatible) {
      definitions[metric] = { definition: `Provider daily ${metric}`, unit: metric === 'ad_spend' ? points[0].currency : 'count',
        source: metric.startsWith('ad_') ? 'meta_ads' : 'ga4', scope: `workspace:${workspaceId}:account:${points[0].account_ref}` };
      if (metric === 'ad_spend') currency = points[0].currency;
    }
  }
  if (definitions.ad_clicks && definitions.ad_impressions && definitions.ad_clicks.scope === definitions.ad_impressions.scope) {
    definitions.ad_ctr = { definition: '100 * Meta Ads clicks / impressions (not organic search CTR)', unit: 'percent',
      source: 'meta_ads', scope: definitions.ad_clicks.scope };
    coverage.ad_ctr = { ...coverage.ad_clicks, status: coverage.ad_clicks.status === 'available' &&
      coverage.ad_impressions.status === 'available' && coverage.ad_clicks.timezone === coverage.ad_impressions.timezone ? 'available' : 'partial' };
  }
  return { values, unavailable, coverage, definitions, currency };
}

/** The CPL denominator follows the spend provider's native dates, not the rolling site window. */
export async function spendWindowLeads(pool: Pool, workspaceId: string, siteId: string | null,
  coverage: Record<string, unknown> | undefined): Promise<number | null> {
  if (coverage?.status !== 'available' || typeof coverage.timezone !== 'string' ||
      typeof coverage.from !== 'string' || typeof coverage.to !== 'string') return null;
  try { new Intl.DateTimeFormat('en', { timeZone: coverage.timezone }); } catch { return null; }
  const result = await pool.query<{ count: number }>(`SELECT count(*)::int AS count FROM leads
    WHERE workspace_id=$1 AND ($5::text IS NULL OR site_id=$5)
      AND captured_at >= ($2::date::timestamp AT TIME ZONE $4)
      AND captured_at < (($3::date + 1)::timestamp AT TIME ZONE $4)
      AND COALESCE(context->>'synthetic','false') <> 'true'`,
  [workspaceId, coverage.from, coverage.to, coverage.timezone, siteId]);
  return result.rows[0].count;
}
