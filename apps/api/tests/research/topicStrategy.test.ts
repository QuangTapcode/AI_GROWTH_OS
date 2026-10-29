import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { agentProfile, researchStrategySchema } from '../../src/modules/businessProfile/strategy';
import { updateBusinessProfileSchema } from '../../src/modules/businessProfile/schemas';
import { applyTripcResearchStrategy } from '../../src/modules/businessProfile/applyStrategy';
import { buildDiscoveryQueries } from '../../src/modules/research/discovery';

const preset = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../config/workspaces/tripc-research-strategy.json'), 'utf8'));
const strategy = researchStrategySchema.parse(preset);

describe('document topic strategy', () => {
  it('preserves all five priorities as proposals, without importing competitor metrics or prices', () => {
    expect(strategy.topics.map(t => t.id)).toEqual(['PT-01', 'PT-02', 'PT-03', 'PT-04', 'PT-05']);
    expect(strategy.topics.map(t => t.priority)).toEqual(['high', 'high', 'high', 'medium', 'medium']);
    expect(strategy.status).toBe('operator_strategy_not_measured_demand');
    expect(strategy.competitor_references).toHaveLength(3);
    expect(updateBusinessProfileSchema.safeParse({ expected_version: 1, research_strategy: strategy }).success).toBe(true);
    expect(researchStrategySchema.safeParse({ ...strategy, topics: [strategy.topics[0], strategy.topics[0]] }).success).toBe(false);
    expect(researchStrategySchema.safeParse({ ...strategy, market_share: 100 }).success).toBe(false);
  });

  it('pins priorities and competitor refs without expanding confirmed services or audience', () => {
    const row = { company_name: 'TripC', version: 2, products_services: ['housing', 'coworking'], target_audiences: ['Expats'], target_locations: ['Da Nang'],
      competitors: strategy.competitor_references.map(c => c.url), research_strategy: strategy };
    const profile = agentProfile(row, 'ws');
    expect(profile.products).toEqual(['housing', 'coworking']);
    expect(profile.audiences).toEqual(['Expats']);
    expect(profile.topic_priority).toHaveLength(5);
    expect(profile.competitors).toHaveLength(3);
    expect(profile.research_strategy?.source_document.sha256).toHaveLength(64);
  });

  it('rotates discovery within the three-query cap and covers medium-priority topics', () => {
    const profile = { locations: ['Da Nang'], audiences: ['Expats'], products: ['housing'], strategy };
    const first = buildDiscoveryQueries(profile);
    const second = buildDiscoveryQueries(profile, 3);
    expect(first).toHaveLength(3); expect(second).toHaveLength(3);
    expect(first[0]).toContain('local experiences');
    expect(first[1]).toContain('housing');
    expect(first[2]).toContain('arrival checklist');
    expect(second[0]).toContain('transport');
    expect(second[1]).toContain('community events');
    expect(buildDiscoveryQueries(profile, 5)[0]).toContain('food and cafes');
  });

  it('searches the offer the owner asked for first, still within the three-query cap', () => {
    const profile = { locations: ['Da Nang'], audiences: ['Expats'], products: ['housing', 'food'], strategy };
    const queries = buildDiscoveryQueries(profile, 3, ['food']);
    expect(queries).toHaveLength(3);
    expect(queries[0]).toBe('Da Nang food expats');
    // The remaining slots keep the strategy rotation instead of repeating the focus.
    expect(queries.slice(1)).toEqual(buildDiscoveryQueries(profile, 3).filter((q) => q !== queries[0]).slice(0, 2));
  });

  it('imports atomically with an audit, without touching source approvals or KPI values', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM business_profiles')) return { rows: [{ id: 'p', company_name: 'TripC', version: 1, competitors: ['https://existing.example'], research_strategy: null }] };
      if (sql.includes('UPDATE business_profiles')) return { rows: [{ version: 2 }] };
      return { rows: [] };
    });
    const pool = { connect: async () => ({ query, release() {} }) } as unknown as Pool;
    expect(await applyTripcResearchStrategy(pool, 'ws', strategy)).toMatchObject({ changed: true, profile_version: 2 });
    expect(query.mock.calls.some(([sql]) => sql.includes('audit_events'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => /UPDATE sources|INSERT INTO sources|growth_kpis|growth_goals/.test(sql))).toBe(false);
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('replay does not bump the profile or invalidate context again', async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes('FROM business_profiles') ? [{ company_name: 'TripC', version: 2,
      competitors: strategy.competitor_references.map(c => c.url), research_strategy: strategy }] : [] }));
    const pool = { connect: async () => ({ query, release() {} }) } as unknown as Pool;
    expect(await applyTripcResearchStrategy(pool, 'ws', strategy)).toEqual({ changed: false, profile_version: 2 });
    expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
});
