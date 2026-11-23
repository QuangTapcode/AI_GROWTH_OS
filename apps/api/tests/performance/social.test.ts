import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { syncFacebookCounters, verifyFacebookConnection } from '../../src/modules/performance/social';

const post = { publishing_job_id: 'job', content_id: 'content', artifact_id: 'artifact', artifact_version: 2,
  external_post_id: '123_456', published_at: new Date('2026-10-01T00:00:00Z'), account_ref: '123' };
function database(bound = true, posts = [post]) {
  const writes = vi.fn(async () => ({ rows: [] }));
  const pool = { query: vi.fn().mockResolvedValueOnce({ rows: bound ? [{ account_ref: '123' }] : [] }).mockResolvedValueOnce({ rows: posts }),
    connect: vi.fn(async () => ({ query: writes, release: vi.fn() })) };
  return { pool: pool as unknown as Pool, writes };
}
beforeEach(() => {
  vi.stubEnv('INTEGRATION_MODE', 'production'); vi.stubEnv('FACEBOOK_PAGE_ID', '123');
  vi.stubEnv('FACEBOOK_PAGE_ACCESS_TOKEN', 'private-test-token'); vi.stubEnv('FACEBOOK_GRAPH_API_VERSION', 'v99.0');
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const period = { from: '2026-10-01', to: '2026-10-02' };
it('only reactivates a bound Page after Facebook confirms its identity',async()=>{
  const {pool}=database();vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({id:'123'}))));
  expect(await verifyFacebookConnection(pool,'workspace')).toMatchObject({verified:true});
  expect(vi.mocked(pool.query).mock.calls.some(call=>String(call[0]).startsWith('UPDATE integration_connections'))).toBe(true);
});
it('never verifies the server Page for an unbound workspace',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  await expect(verifyFacebookConnection(database(false).pool,'other')).rejects.toMatchObject({code:'WORKSPACE_ACCOUNT_NOT_BOUND'});
  expect(fetch).not.toHaveBeenCalled();
});
it('does not reactivate on rejected credentials or a different Page identity',async()=>{
  for(const response of [new Response('{}',{status:400}),new Response(JSON.stringify({id:'999'}))]) {
    const {pool}=database();vi.stubGlobal('fetch',vi.fn(async()=>response));
    await expect(verifyFacebookConnection(pool,'workspace')).rejects.toMatchObject({statusCode:response.ok?502:409});
    expect(vi.mocked(pool.query).mock.calls).toHaveLength(1);
  }
});

it('rejects unbound workspaces before making any provider request', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(syncFacebookCounters(database(false).pool, 'workspace', period)).rejects.toMatchObject({ code: 'WORKSPACE_ACCOUNT_NOT_BOUND' });
  expect(fetch).not.toHaveBeenCalled();
});
it('preserves measured zero separately from missing counters and pins artifact provenance', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ id: '123_456', reactions: { summary: { total_count: 0 } }, shares: { count: 4 } })));
  vi.stubGlobal('fetch', fetch); const { pool, writes } = database();
  expect(await syncFacebookCounters(pool, 'workspace', period)).toMatchObject({ posts: 1, measured_posts: 1 });
  const inserts = writes.mock.calls as unknown as [string, unknown[]][];
  const params = inserts.filter(([sql]) => sql.startsWith('INSERT')).map(([, args]) => args);
  expect(params.map(p => [p[1], p[3], p[4], p[5]])).toEqual([
    ['facebook_reactions', 0, 'available', null], ['facebook_comments', null, 'missing', 'COUNTER_NOT_RETURNED'], ['facebook_shares', 4, 'available', null],
  ]);
  expect(JSON.parse(String(params[0][6]))).toMatchObject({ artifact_id: 'artifact', artifact_version: 2, scope: 'post_lifetime' });
  expect(fetch.mock.calls[0]).toHaveLength(2);
  expect(JSON.stringify(params)).not.toContain('private-test-token');
});
it('never requests a post from another Page', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const { pool, writes } = database(true, [{ ...post, external_post_id: '999_456' }]);
  expect(await syncFacebookCounters(pool, 'workspace', period)).toMatchObject({ unavailable_posts: 1 });
  expect(fetch).not.toHaveBeenCalled();
  expect(JSON.stringify(writes.mock.calls)).toContain('POST_PAGE_MISMATCH');
});
it('records permission failures as missing without leaking provider error bodies', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('secret-provider-message', { status: 403 })));
  const { pool, writes } = database();
  expect(await syncFacebookCounters(pool, 'workspace', period)).toMatchObject({ unavailable_posts: 1 });
  expect(JSON.stringify(writes.mock.calls)).toContain('FACEBOOK_PERMISSION_MISSING');
  expect(JSON.stringify(writes.mock.calls)).not.toContain('secret-provider-message');
});
it('detects invalid/expired tokens, stops further requests, persists missing values and requires reconnection', async () => {
  const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: 190, message: 'secret-provider-message' } }), { status: 400 }));
  vi.stubGlobal('fetch',fetch);
  const {pool,writes} = database(true,[post,{...post,publishing_job_id:'second',external_post_id:'123_789'}]);
  expect(await syncFacebookCounters(pool,'workspace',period)).toMatchObject({ requires_reauth:true,unavailable_posts:2,reasons:['FACEBOOK_TOKEN_INVALID_OR_EXPIRED'] });
  expect(fetch).toHaveBeenCalledTimes(1);
  const calls = writes.mock.calls as unknown as [string,unknown[]][];
  expect(calls.some(([sql])=>sql.startsWith('UPDATE integration_connections'))).toBe(true);
  expect(calls.filter(([sql])=>sql.startsWith('INSERT')).every(([,args])=>args[3]===null&&args[4]==='missing')).toBe(true);
  expect(JSON.stringify(calls)).not.toContain('secret-provider-message');
});
it('reports rate limiting and timeouts without inventing zero or retrying requests', async () => {
  for (const response of [async()=>new Response('{}',{status:429}),async()=>{throw new DOMException('private detail','TimeoutError');}]) {
    const fetch=vi.fn(response);vi.stubGlobal('fetch',fetch);const {pool}=database();
    const result=await syncFacebookCounters(pool,'workspace',period);
    expect(result.reasons[0]).toMatch(/^FACEBOOK_(RATE_LIMITED|REQUEST_TIMEOUT)$/);
    expect(result.unavailable_posts).toBe(1);expect(fetch).toHaveBeenCalledTimes(1);
  }
});
it('bounds work before calling Facebook', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  await expect(syncFacebookCounters(database(true, Array(21).fill(post)).pool, 'workspace', period)).rejects.toMatchObject({ code: 'SOCIAL_BATCH_TOO_LARGE' });
  expect(fetch).not.toHaveBeenCalled();
});
it('uses the existing META_GRAPH_API_VERSION when no Facebook-specific version is configured', async () => {
  vi.stubEnv('FACEBOOK_GRAPH_API_VERSION', ''); vi.stubEnv('META_GRAPH_API_VERSION', 'v21.0');
  const fetch = vi.fn(async () => new Response(JSON.stringify({ id: '123_456', shares: { count: 0 } })));
  vi.stubGlobal('fetch', fetch);
  await syncFacebookCounters(database().pool, 'workspace', period);
  expect((fetch.mock.calls as unknown as [string][])[0][0]).toContain('/v21.0/123_456?');
});
it('prefers an explicit Facebook version over the shared Meta version', async () => {
  vi.stubEnv('META_GRAPH_API_VERSION', 'v21.0');
  const fetch = vi.fn(async () => new Response(JSON.stringify({ id: '123_456', shares: { count: 0 } })));
  vi.stubGlobal('fetch', fetch);
  await syncFacebookCounters(database().pool, 'workspace', period);
  expect((fetch.mock.calls as unknown as [string][])[0][0]).toContain('/v99.0/123_456?');
});
