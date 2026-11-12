import type { Pool } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommunityHubService } from '../../src/modules/community/hub';

const WS = '10000000-0000-4000-8000-000000000001';
const SETTINGS = { week1_target: 5, week2_target: 50, week3_target: 150, week4_target: 300, daily_invite_limit: 12,
  target_source: 'growth_lead', target_rationale: null, strategy_artifact_id: null, group_url: 'https://www.facebook.com/groups/1' };

function service(rows: (sql: string) => unknown[]) {
  const query = vi.fn(async (sql: string) => ({ rows: rows(sql), rowCount: 0 }));
  const hub = new CommunityHubService({ query, connect: vi.fn() } as unknown as Pool);
  // Live Facebook figures are not what these tests are about.
  const quiet = hub as unknown as Record<string, unknown>;
  quiet.getCommunitySettings = vi.fn(async () => SETTINGS);
  quiet.fetchRealPageStats = vi.fn(async () => ({ followers_count: 0 }));
  quiet.fetchRealGroupStats = vi.fn(async () => ({ member_count: 7 }));
  quiet.captureMemberSnapshot = vi.fn(async () => undefined);
  return hub;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('Growth Lead targets for the community', () => {
  it('says Research has to run first when the current sources have no Research yet', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const hub = service((sql) => (sql.includes('FROM knowledge_contexts') ? [{ snapshot_id: 'new-snapshot', profile: {}, snapshot: {}, goal: {} }] : []));

    const result = await hub.syncGrowthLeadTargets(WS, { forceRecalculate: true });

    expect(result.applied).toBe(false);
    expect(result.reason).toBe('RESEARCH_NOT_READY_FOR_CONTEXT');
    expect(result.message).toMatch(/Research/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('names the AI failure instead of a generic one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ run_id: 'r1', status: 'failed', error_code: 'SNAPSHOT_MISMATCH' }), { status: 202 })));
    const hub = service((sql) => {
      if (sql.includes('FROM knowledge_contexts')) return [{ snapshot_id: 's1', profile: {}, snapshot: { sources: [] }, goal: {} }];
      if (sql.includes("role = 'research'")) return [{ id: 'a1', payload: { artifact: { context_snapshot_id: 's1' }, result: {} }, evidence: [] }];
      return [];
    });

    const result = await hub.syncGrowthLeadTargets(WS, { forceRecalculate: true });

    expect(result.reason).toBe('GROWTH_LEAD_RUN_FAILED:SNAPSHOT_MISMATCH');
  });
});
