import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('@/lib/db', () => ({ default: { query: (...args: unknown[]) => query(...args) } }));

const url = 'http://x/v1/webhooks/facebook';

describe('Facebook webhook', () => {
  beforeEach(() => {
    Object.assign(process.env, { FACEBOOK_WEBHOOK_VERIFY_TOKEN: 'verify-me', FACEBOOK_APP_SECRET: 'app-secret',
      FACEBOOK_PAGE_ID: 'page-1', FACEBOOK_WEBHOOK_WORKSPACE_ID: '10000000-0000-4000-8000-000000000001' });
    query.mockReset();
  });

  it("answers Meta's subscription challenge only for the configured verify token", async () => {
    const { GET } = await import('../../src/app/v1/webhooks/facebook/route');
    const ok = await GET(new Request(`${url}?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=123`) as never);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('123');
    const wrong = await GET(new Request(`${url}?hub.mode=subscribe&hub.verify_token=guess&hub.challenge=123`) as never);
    expect(wrong.status).toBe(403);
  });

  const event = (message: Record<string, unknown>) => JSON.stringify({ object: 'page', entry: [{ id: 'page-1', time: 1,
    messaging: [{ sender: { id: 'psid-9' }, recipient: { id: 'page-1' }, timestamp: 1, message }] }] });
  const signed = (body: string, secret = 'app-secret') => new Request(url, { method: 'POST', body,
    headers: { 'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` } });

  it('queues a signed Messenger message in the Community inbox and ignores the page echo', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 1 });
    const { POST } = await import('../../src/app/v1/webhooks/facebook/route');
    expect((await POST(signed(event({ mid: 'm_1', text: 'Where can I find good street food?' })) as never)).status).toBe(200);
    const inserts = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO community_messages'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(expect.arrayContaining(['10000000-0000-4000-8000-000000000001', 'm_1', 'psid-9',
      'Where can I find good street food?']));
    await POST(signed(event({ mid: 'm_2', text: 'Thanks for asking!', is_echo: true })) as never);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO community_messages'))).toHaveLength(1);
  });

  it('rejects an event whose signature does not match the app secret', async () => {
    const { POST } = await import('../../src/app/v1/webhooks/facebook/route');
    expect((await POST(signed(event({ mid: 'm_3', text: 'Hi' }), 'forged') as never)).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});
