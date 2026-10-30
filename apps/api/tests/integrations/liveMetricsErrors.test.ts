import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ withTransaction: async (fn: (client: unknown) => unknown) => fn({ query: async () => ({ rows: [] }) }) }));
vi.mock('@/modules/integrations/repository', () => ({ upsertConnection: vi.fn() }));

const saved = { ...process.env };

describe('live metric sync errors', () => {
  beforeEach(() => {
    for (const key of ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GSC_SERVICE_ACCOUNT_JSON', 'GSC_SITE_URL', 'GA4_PROPERTY_ID']) delete process.env[key];
    Object.assign(process.env, { INTEGRATION_MODE: 'production', META_ADS_ACCESS_TOKEN: 'token', META_AD_ACCOUNT_ID: 'act_1' });
  });
  afterEach(() => { process.env = { ...saved }; vi.unstubAllGlobals(); });

  it("shows the provider's own reason instead of [object Object]", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(
      { error: { message: 'API access blocked.', type: 'OAuthException', code: 200 } }), { status: 400 })));
    const { syncLiveMetrics } = await import('../../src/modules/integrations/liveMetrics');
    const result = await syncLiveMetrics('ws', '2026-10-01', '2026-10-07');
    const meta = result.results.find((r: { provider: string }) => r.provider === 'meta_ads') as { error?: string };
    expect(meta.error).toContain('API access blocked.');
    expect(meta.error).not.toContain('[object Object]');
  });
});
