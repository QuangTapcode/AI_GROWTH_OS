import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../cloudflare-api/index.mjs';

test('forwards login body and auth while removing spoofable headers', async () => {
  const req = new Request('https://staging.example/v1/auth/login', { method: 'POST',
    headers: { authorization: 'Bearer test-token', 'content-type': 'application/json', cookie: 'private', 'x-forwarded-for': 'spoofed', 'cf-connecting-ip': '203.0.113.4' },
    body: JSON.stringify({ email: 'fixture@example.invalid', password: 'fixture-only' }) });
  let captured;
  const response = await worker.fetch(req, { LOCAL_API: { fetch: async (url, init) => {
    captured = { url: String(url), init };
    return Response.json({ ok: true });
  } } });
  assert.equal(response.status, 200);
  assert.equal(captured.url, 'http://127.0.0.1:4000/v1/auth/login');
  assert.equal(captured.init.headers.get('authorization'), 'Bearer test-token');
  assert.equal(captured.init.headers.get('cookie'), null);
  assert.equal(captured.init.headers.get('x-forwarded-for'), '203.0.113.4');
  assert.equal(JSON.parse(new TextDecoder().decode(captured.init.body)).password, 'fixture-only');
});

test('reports offline API as structured 502 without leaking infrastructure errors', async () => {
  const result = await worker.fetch(new Request('https://staging.example/v1/health'), { LOCAL_API: { fetch: async () => { throw new Error('private host unreachable'); } } });
  assert.equal(result.status, 502);
  const body = await result.json();
  assert.equal(body.error.code, 'API_UNREACHABLE');
  assert.ok(!JSON.stringify(body).includes('private host'));
});

test('never forwards internal endpoints', async () => {
  let called = false;
  const result = await worker.fetch(new Request('https://staging.example/internal/automation/tick'), { LOCAL_API: { fetch: async () => { called = true; } } });
  assert.equal(result.status, 404); assert.equal(called, false);
});
