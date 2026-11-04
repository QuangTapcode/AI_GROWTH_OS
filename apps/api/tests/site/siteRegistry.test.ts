import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSite, siteForWorkspace } from '../../src/lib/sites';

const WS = '77777777-7777-4777-8777-777777777777';
const REAL = JSON.stringify([{ site_id: 'tripc-guide', workspace_id: WS, timezone: 'Asia/Ho_Chi_Minh', status: 'active' }]);

describe('public site registry', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('uses the configured sites, and the test fixtures no longer exist', () => {
    vi.stubEnv('PUBLIC_SITES_JSON', REAL);
    expect(resolveSite('tripc-guide')).toMatchObject({ site_id: 'tripc-guide', workspace_id: WS, status: 'active' });
    expect(siteForWorkspace(WS)?.site_id).toBe('tripc-guide');
    expect(resolveSite('tripc-pilot')).toBeNull();
    expect(resolveSite('other-site')).toBeNull();
  });

  it('a suspended site resolves but is not the workspace site', () => {
    vi.stubEnv('PUBLIC_SITES_JSON', JSON.stringify([{ site_id: 'old', workspace_id: WS, timezone: 'UTC', status: 'suspended' }]));
    expect(resolveSite('old')?.status).toBe('suspended');
    expect(siteForWorkspace(WS)).toBeNull();
  });

  it.each(['not json', '[{"site_id":"x"}]', '{"site_id":"x"}'])('a broken configuration exposes no site instead of the fixtures: %s', (value) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('PUBLIC_SITES_JSON', value);
    expect(resolveSite('tripc-pilot')).toBeNull();
    expect(siteForWorkspace('10000000-0000-4000-8000-000000000001')).toBeNull();
    expect(logged).toHaveBeenCalled();
  });

  it('without configuration the development fixtures stay available', () => {
    vi.stubEnv('PUBLIC_SITES_JSON', '');
    expect(resolveSite('tripc-pilot')?.timezone).toBe('Asia/Ho_Chi_Minh');
  });
});
