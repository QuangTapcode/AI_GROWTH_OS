import assert from 'node:assert/strict';
import test from 'node:test';

// What main promises once it is deployed, checked from outside over the public address.
// Sends no credentials and creates nothing: every request below is refused or read-only.
const base = process.env.STAGING_BASE_URL?.replace(/\/$/, '');
const options = { skip: !base };
const get = (path, init) => fetch(`${base}${path}`, { signal: AbortSignal.timeout(20000), ...init });

async function bundleOf(page) {
  const html = await (await get(page)).text();
  const chunks = [...new Set(html.match(/\/_next\/static\/chunks\/[\w.~-]+\.js/g) ?? [])];
  const bodies = await Promise.all(chunks.map(async (chunk) => (await get(chunk)).text()));
  return bodies.join('\n');
}

test('the Telegram webhook is served and refuses a request without the secret', options, async () => {
  const response = await get('/v1/webhooks/telegram', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.notEqual(response.status, 404, 'the running API build has no Telegram route');
  assert.ok(response.status === 401 || response.status === 403, `expected a refusal, got HTTP ${response.status}`);
});

test('the Facebook webhook refuses a verification without the token', options, async () => {
  assert.equal((await get('/v1/webhooks/facebook')).status, 403);
});

test('the deployed console has the measured results added on 2026-11-04', options, async () => {
  assert.match(await bundleOf('/review-queue/'), /Bài có tín hiệu tốt/);
});

test('the console stays out of search engines', options, async () => {
  assert.match((await get('/')).headers.get('x-robots-tag') ?? '', /noindex/);
});
