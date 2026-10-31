import assert from 'node:assert/strict';
import test from 'node:test';

const base = process.env.STAGING_BASE_URL;
test('public staging reaches the API and validates login payloads', { skip: !base }, async () => {
  const health = await fetch(`${base.replace(/\/$/, '')}/v1/health`, { signal: AbortSignal.timeout(15000) });
  assert.equal(health.status, 200, `API is offline: HTTP ${health.status}`);
  assert.equal((await health.json()).status, 'ok');
  // No credentials, no login attempts against a real account, no sessions created.
  const login = await fetch(`${base.replace(/\/$/, '')}/v1/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000),
  });
  assert.equal(login.status, 422, `Login endpoint unreachable: HTTP ${login.status}`);
  assert.equal((await login.json()).error.code, 'VALIDATION_FAILED');
});
