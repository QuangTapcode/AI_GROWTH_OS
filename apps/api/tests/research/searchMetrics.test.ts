import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { canonicalJson, sha256Hex } from '../../src/lib/hash';
import { fetchGscResearchQueries } from '../../src/modules/integrations/liveMetrics';
import { researchMetricsRange, syncResearchSearchMetrics } from '../../src/modules/research/searchMetrics';

vi.mock('../../src/modules/integrations/liveMetrics', () => ({ fetchGscResearchQueries: vi.fn() }));
const range = { from: '2026-09-01', to: '2026-09-28' };

describe('scoped Research GSC measurements', () => {
  beforeEach(() => {
    vi.stubEnv('INTEGRATION_MODE', 'production'); vi.stubEnv('GSC_SITE_URL', 'sc-domain:tripc.ai');
    vi.stubEnv('GSC_SERVICE_ACCOUNT_JSON', 'configured-secret-ref');
    vi.mocked(fetchGscResearchQueries).mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());
  const pool = (verified = true) => ({ query: vi.fn(async (sql: string) => {
    if (sql.includes('FROM knowledge_contexts')) return { rows: [{ snapshot_id: 'ctx' }] };
    if (sql.includes('FROM integration_connections')) return { rows: verified ? [{ account_ref: 'sc-domain:tripc.ai' }] : [] };
    return { rows: [] };
  }) }) as unknown as Pool;

  it('uses 28 completed Pacific calendar days with a data-lag buffer', () => {
    expect(researchMetricsRange(new Date('2026-10-28T01:00:00Z'))).toEqual({ from: '2026-09-27', to: '2026-10-24' });
  });
  it('does not call a provider or manufacture zeroes when credentials are absent', async () => {
    vi.stubEnv('GSC_SITE_URL', '');
    const db = pool();
    expect(await syncResearchSearchMetrics(db, 'ws', 'ctx')).toMatchObject({ status: 'unavailable' });
    expect(db.query).not.toHaveBeenCalled(); expect(fetchGscResearchQueries).not.toHaveBeenCalled();
  });
  it('requires the verified property to belong to this workspace', async () => {
    const db = pool(false);
    expect(await syncResearchSearchMetrics(db, 'other-ws', 'ctx', range)).toMatchObject({ status: 'unavailable', reason: 'gsc_property_not_verified_for_workspace' });
    expect(fetchGscResearchQueries).not.toHaveBeenCalled();
  });
  it('stores measured zero and query provenance in a hash-verifiable immutable artifact', async () => {
    vi.mocked(fetchGscResearchQueries).mockResolvedValue({ rows: [{ keys: ['coworking da nang'], clicks: 0, impressions: 20, ctr: 0, position: 8 }] });
    const db = pool();
    const out = await syncResearchSearchMetrics(db, 'ws', 'ctx', range);
    expect(out.status).toBe('available');
    const call = vi.mocked(db.query).mock.calls.find(([sql]) => String(sql).includes('INSERT INTO content_artifacts'))!;
    const parameters = call[1] as unknown as unknown[];
    const saved = JSON.parse(parameters[4] as string);
    expect(saved.result).toMatchObject({ site_url: 'sc-domain:tripc.ai', timezone: 'America/Los_Angeles', scope: 'website_property_only', coverage: 'top_queries_not_exhaustive', synthetic: false });
    expect(saved.result.rows[0]).toMatchObject({ clicks: 0, impressions: 20, ctr: 0 });
    expect(saved.artifact.content_hash).toBe(sha256Hex(canonicalJson({ result: saved.result, evidence: [] })));
    expect(JSON.stringify(saved)).not.toContain('configured-secret-ref');
  });
  it('does not overwrite measured history on provider failure', async () => {
    vi.mocked(fetchGscResearchQueries).mockRejectedValue(new Error('provider unavailable'));
    const db = pool();
    await expect(syncResearchSearchMetrics(db, 'ws', 'ctx', range)).rejects.toThrow('provider unavailable');
    expect(vi.mocked(db.query).mock.calls.some(([sql]) => /INSERT|DELETE|UPDATE/.test(String(sql)))).toBe(false);
  });
  it('rejects incomplete provider rows instead of converting missing clicks to zero', async () => {
    vi.mocked(fetchGscResearchQueries).mockResolvedValue({ rows: [{ keys: ['housing'], impressions: 20 }] });
    const db = pool();
    await expect(syncResearchSearchMetrics(db, 'ws', 'ctx', range)).rejects.toMatchObject({ code: 'INVALID_GSC_RESPONSE' });
    expect(vi.mocked(db.query).mock.calls.some(([sql]) => String(sql).includes('INSERT'))).toBe(false);
  });
  it.each(['2026-02-30', '2026-99-99', '2099-01-01'])('rejects invalid or future dates: %s', async (to) => {
    await expect(syncResearchSearchMetrics(pool(), 'ws', 'ctx', { from: '2026-01-01', to })).rejects.toMatchObject({ code: 'INVALID_GSC_WINDOW' });
    expect(fetchGscResearchQueries).not.toHaveBeenCalled();
  });
});
