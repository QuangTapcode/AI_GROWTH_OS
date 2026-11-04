import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const fetchGscTotals = vi.hoisted(() => vi.fn());
vi.mock('../../src/modules/integrations/liveMetrics', () => ({ fetchGscTotals }));

import { ensureMeasurementArtifacts } from '../../src/modules/site/measurement';

const WS = '10000000-0000-4000-8000-000000000001';

/** Measures once and returns the stored metrics artifact. */
async function measure(connected: boolean) {
  const inserts: unknown[][] = [];
  const pool = { query: vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("operation IN ('metrics.snapshot','lead.aggregate')")) return { rows: [] };
    if (sql.includes('qualified_visits')) return { rows: [{ qualified_visits: 0, page_views: 0, internal_page_views: 0, leads: 0 }] };
    if (sql.includes('integration_connections')) return { rows: connected ? [{ account_ref: 'https://tripc.ai/' }] : [] };
    if (sql.includes('INSERT INTO content_artifacts')) inserts.push(params);
    return { rows: [] };
  }) } as unknown as Pool;
  await ensureMeasurementArtifacts(pool, WS, 'ctx-1', 24);
  return JSON.parse(inserts[0][6] as string);
}

describe('search metrics in the first-party snapshot', () => {
  beforeEach(() => {
    fetchGscTotals.mockReset();
    vi.stubEnv('INTEGRATION_MODE', 'production');
    vi.stubEnv('GSC_SITE_URL', 'https://tripc.ai/');
    vi.stubEnv('GSC_SERVICE_ACCOUNT_JSON', '{}');
  });

  it('reports clicks and impressions when Search Console is connected', async () => {
    fetchGscTotals.mockResolvedValue({ clicks: 12, impressions: 340 });
    const metrics = await measure(true);
    expect(metrics.result).toMatchObject({ clicks: 12, impressions: 340, unavailable: {} });
    // Search Console data settles after three days, so the part of the window it covers is recorded.
    const [from, to] = fetchGscTotals.mock.calls[0];
    expect(metrics.measurement.search_console).toEqual({ site_url: 'https://tripc.ai/', from, to });
    expect(to < metrics.result.window_end.slice(0, 10)).toBe(true);
    expect(from).toBe(metrics.result.window_start.slice(0, 10));
  });

  it('a connected property with no rows measured zero', async () => {
    fetchGscTotals.mockResolvedValue({ clicks: 0, impressions: 0 });
    expect((await measure(true)).result).toMatchObject({ clicks: 0, impressions: 0, unavailable: {} });
  });

  it('without a verified connection the metrics stay unavailable', async () => {
    const metrics = await measure(false);
    expect(fetchGscTotals).not.toHaveBeenCalled();
    expect(metrics.result).toMatchObject({ clicks: null, impressions: null,
      unavailable: { clicks: 'search_console_not_connected', impressions: 'search_console_not_connected' } });
  });

  it('a failed request is reported, never stored as zero, and does not stop the measurement', async () => {
    fetchGscTotals.mockRejectedValue(new Error('quota'));
    expect((await measure(true)).result).toMatchObject({ clicks: null, impressions: null, qualified_visits: 0,
      unavailable: { clicks: 'search_console_request_failed', impressions: 'search_console_request_failed' } });
  });
});
