import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const connections = vi.hoisted(() => vi.fn());
const statements = vi.hoisted(() => vi.fn(async () => ({ rows: [] })));
vi.mock('@/lib/db', () => ({ withTransaction: async (fn: (client: unknown) => unknown) => fn({ query: statements }) }));
vi.mock('@/modules/integrations/repository', () => ({ upsertConnection: vi.fn(), listConnections: connections }));
import { syncLiveMetrics } from '../../src/modules/integrations/liveMetrics';

describe('tenant-bound live provider metrics', () => {
  beforeEach(() => {
    vi.stubEnv('INTEGRATION_MODE','production'); vi.stubEnv('META_ADS_ACCESS_TOKEN','test-token'); vi.stubEnv('META_AD_ACCOUNT_ID','act_7');
    for (const key of ['GA4_PROPERTY_ID','GSC_SITE_URL','GSC_SERVICE_ACCOUNT_JSON','GOOGLE_SERVICE_ACCOUNT_JSON']) vi.stubEnv(key,'');
    connections.mockImplementation(async (ws: string) => ws === 'bound' ? [{ provider: 'meta_ads', account_ref: '7', status: 'connected' }] : []);
    statements.mockClear();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('does not fetch or attach a server account to an unbound workspace', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch',fetch);
    const result = await syncLiveMetrics('unbound','2026-10-01','2026-10-02');
    expect(result.results.find(r => r.provider === 'meta_ads')).toMatchObject({ status: 'skipped', missing_reason: 'WORKSPACE_ACCOUNT_NOT_BOUND' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('follows bounded pagination and persists the native currency, timezone and bound account ref', async () => {
    const responses = [
      { currency: 'USD', timezone_name: 'America/New_York' },
      { data: [{ date_start: '2026-10-01', spend: '12.5' }], paging: { next: 'https://not-followed.example/', cursors: { after: 'next-page' } } },
      { data: [{ date_start: '2026-10-02', spend: '20' }] },
    ];
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify(responses.shift())));
    vi.stubGlobal('fetch',fetch);
    const result = await syncLiveMetrics('bound','2026-10-01','2026-10-02');
    expect(result.points_saved).toBe(2);
    expect(fetch.mock.calls[2][0]).toContain('&after=next-page');
    expect(fetch.mock.calls.every(call => call[0].startsWith('https://graph.facebook.com/'))).toBe(true);
    const inserts = statements.mock.calls as unknown as [string, unknown[]][];
    const point = inserts.find(([sql]) => sql.includes('INSERT INTO metrics_snapshots'))![1];
    expect(point[4]).toBe('USD'); expect(point[7]).toBe('America/New_York');
    expect(JSON.parse(String(point[6])).account_ref).toBe('7');
    expect(inserts.filter(([sql]) => sql.includes('DELETE FROM metrics_snapshots')).map(([, params]) => params[2]))
      .toEqual(['ad_spend', 'ad_clicks', 'ad_impressions']);
  });
  it('rejects malformed and excessive sync periods before any provider call', async () => {
    await expect(syncLiveMetrics('bound','2026-02-30','2026-03-03')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    await expect(syncLiveMetrics('bound','2020-01-01','2026-01-01')).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
  it('keeps advertising clicks and impressions separate from organic search metrics', async () => {
    const responses = [{ currency: 'USD', timezone_name: 'UTC' },
      { data: [{ date_start: '2026-10-01', spend: '0', clicks: '7', impressions: '100' }] }];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(responses.shift()))));
    expect((await syncLiveMetrics('bound','2026-10-01','2026-10-01')).points_saved).toBe(3);
    const inserts = statements.mock.calls as unknown as [string, unknown[]][];
    const values = inserts.filter(([sql]) => sql.includes('INSERT INTO metrics_snapshots')).map(([, params]) => params);
    expect(values.map(params => params[2])).toEqual(['ad_spend', 'ad_clicks', 'ad_impressions']);
  });
});
