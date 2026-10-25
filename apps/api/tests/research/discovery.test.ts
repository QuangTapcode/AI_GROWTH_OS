import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { buildDiscoveryQueries, loadSignals, refreshDiscoveryIfStale, runDiscovery, type SearchResult } from '../../src/modules/research/discovery';
import { policyFor, referenceUrls } from '../../src/modules/research/sourcePolicy';

const profile = {
  target_locations: ['Da Nang'],
  target_audiences: ['English-speaking expats living or planning to live in Da Nang'],
  products_services: ['housing', 'living_areas', 'coworking', 'gym'],
};

function fakePool(existingUrls: string[] = []) {
  const statements: { sql: string; params: unknown[] }[] = [];
  let next = 0;
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    statements.push({ sql, params });
    if (sql.includes('FROM business_profiles')) return { rows: [profile] };
    if (sql.startsWith('SELECT id FROM sources')) return { rows: existingUrls.includes(params[1] as string) ? [{ id: `old-${params[1]}` }] : [] };
    if (sql.includes('INSERT INTO sources')) return { rows: [{ id: `new-${++next}` }] };
    return { rows: [] };
  });
  const release = vi.fn();
  const pool = { query, connect: async () => ({ query, release }) } as unknown as Pool;
  return { pool, statements, release };
}

describe('research discovery', () => {
  it('builds at most three profile queries with an audience hint', () => {
    expect(buildDiscoveryQueries({ locations: ['Da Nang'], audiences: profile.target_audiences, products: profile.products_services }))
      .toEqual(['Da Nang housing expats', 'Da Nang living areas expats', 'Da Nang coworking expats']);
    expect(buildDiscoveryQueries({ locations: [], audiences: [], products: ['housing'] })).toEqual([]);
  });

  it('ingests only open-license or official domains', () => {
    expect(policyFor('https://en.wikivoyage.org/wiki/Da_Nang')?.license).toBe('CC BY-SA 4.0');
    expect(policyFor('https://danangfantasticity.com/en/about-da-nang-city')?.attribution).toContain('Department of Tourism');
    expect(policyFor('https://www.expat.com/en/guide/asia/vietnam/da-nang/')).toBeNull();
    expect(policyFor('https://evil-wikivoyage.org/x')).toBeNull();
    expect(referenceUrls('Da Nang')).toEqual(['https://en.wikivoyage.org/wiki/Da_Nang', 'https://en.wikipedia.org/wiki/Da_Nang']);
  });

  it('records every result as a signal but queues only policy sources, without duplicates', async () => {
    const results: SearchResult[] = [
      { url: 'https://www.expat.com/en/guide/asia/vietnam/da-nang/', title: 'Expat guide to Da Nang', engine: 'duckduckgo' },
      { url: 'https://danangfantasticity.com/en/about-da-nang-city', title: 'About Da Nang City', engine: 'duckduckgo' },
    ];
    const search = vi.fn(async () => results);
    const { pool, statements, release } = fakePool(['https://en.wikipedia.org/wiki/Da_Nang']);
    const out = await runDiscovery(pool, 'ws-1', search);

    expect(search).toHaveBeenCalledTimes(3);
    expect(out.signal_count).toBe(6);
    expect(out.queued_sources.map((s) => s.url)).toEqual([
      'https://en.wikivoyage.org/wiki/Da_Nang', 'https://danangfantasticity.com/en/about-da-nang-city',
    ]);
    expect(out.existing_sources.map((s) => s.url)).toEqual(['https://en.wikipedia.org/wiki/Da_Nang']);
    const inserts = statements.filter((s) => s.sql.includes('INSERT INTO sources'));
    expect(inserts).toHaveLength(2);
    expect(inserts.every((s) => s.sql.includes("'imported'"))).toBe(true);
    const signals = statements.filter((s) => s.sql.includes('INSERT INTO trend_signals'));
    expect(signals).toHaveLength(6);
    // The blog result is a signal only: no source link, no page text stored.
    expect(signals.find((s) => s.params[5] === results[0].url)?.params[8]).toBeNull();
    expect(statements.some((s) => s.sql === 'COMMIT')).toBe(true);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases when persisting fails', async () => {
    const { pool, statements, release } = fakePool();
    const query = (pool as unknown as { query: ReturnType<typeof vi.fn> }).query;
    query.mockImplementation(async (sql: string) => {
      statements.push({ sql, params: [] });
      if (sql.includes('FROM business_profiles')) return { rows: [profile] };
      if (sql.includes('INSERT INTO sources')) throw new Error('db down');
      return { rows: [] };
    });
    await expect(runDiscovery(pool, 'ws-1', async () => [])).rejects.toThrow('db down');
    expect(statements.some((s) => s.sql === 'ROLLBACK')).toBe(true);
    expect(release).toHaveBeenCalledOnce();
  });

  it('compares each signal with the previous run of the same query', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ discovery_run_id: 'run-2' }, { discovery_run_id: 'run-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 's1', rank: 2, previous_rank: 5, is_new: false }] });
    const out = await loadSignals({ query } as unknown as Pool, 'ws-1');
    expect(out).toMatchObject({ discovery_run_id: 'run-2', previous_run_id: 'run-1' });
    expect(query.mock.calls[1][1]).toEqual(['ws-1', 'run-2', 'run-1']);
    expect(query.mock.calls[1][0]).toContain('AS previous_rank');
  });

  it('refreshes discovery only when the newest signals are stale', async () => {
    const search = vi.fn(async () => [] as SearchResult[]);
    const fresh = { query: vi.fn(async () => ({ rows: [{ at: new Date() }] })) } as unknown as Pool;
    expect(await refreshDiscoveryIfStale(fresh, 'ws-1', search, 24)).toBeNull();
    expect(search).not.toHaveBeenCalled();
    const { pool } = fakePool();
    const stale = pool as unknown as { query: ReturnType<typeof vi.fn> };
    const original = stale.query.getMockImplementation()!;
    stale.query.mockImplementation(async (sql: string, params: unknown[] = []) =>
      sql.includes('max(observed_at)') ? { rows: [{ at: new Date(Date.now() - 48 * 3_600_000) }] } : original(sql, params));
    expect(await refreshDiscoveryIfStale(pool, 'ws-1', search, 24)).toMatchObject({ queries: expect.any(Array) });
    expect(search).toHaveBeenCalledTimes(3);
  });
});
