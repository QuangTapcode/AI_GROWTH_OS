import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
vi.mock('@/lib/db', () => ({ default: { query: (...args: unknown[]) => query(...args) } }));

const url = 'http://x/v1/webhooks/telegram';
const workspaceId = '10000000-0000-4000-8000-000000000001';

const request = (update: unknown, secret = 'tg-secret') => new Request(url, { method: 'POST', body: JSON.stringify(update),
  headers: { 'x-telegram-bot-api-secret-token': secret } });
const privateMessage = (overrides: Record<string, unknown> = {}) => ({ message_id: 7, text: 'Where can I find good street food?',
  from: { id: 555, is_bot: false, first_name: 'Linh', last_name: 'Tran' }, chat: { id: 555, type: 'private' }, ...overrides });
const inserts = () => query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO community_messages'));

describe('Telegram webhook', () => {
  beforeEach(() => {
    Object.assign(process.env, { TELEGRAM_WEBHOOK_SECRET: 'tg-secret', TELEGRAM_WEBHOOK_WORKSPACE_ID: workspaceId });
    query.mockReset();
    query.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('queues a private message to the bot in the Community inbox', async () => {
    const { POST } = await import('../../src/app/v1/webhooks/telegram/route');
    expect((await POST(request({ update_id: 1, message: privateMessage() }) as never)).status).toBe(200);
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0][1]).toEqual([workspaceId, 'bot:555:7', 'Linh Tran', '555', 'Where can I find good street food?', '{}']);
  });

  it('keeps the connection of a message to a connected account so the reply goes out from it', async () => {
    const { POST } = await import('../../src/app/v1/webhooks/telegram/route');
    await POST(request({ update_id: 2, business_message: privateMessage({ business_connection_id: 'conn-1' }) }) as never);
    expect(inserts()[0][1]).toEqual([workspaceId, 'conn-1:555:7', 'Linh Tran', '555', 'Where can I find good street food?',
      JSON.stringify({ business_connection_id: 'conn-1' })]);
  });

  it.each([
    ['the connected account writing to a customer', { business_message: privateMessage({ business_connection_id: 'conn-1', from: { id: 999, first_name: 'Owner' } }) }],
    ['the automatic /start command', { message: privateMessage({ text: '/start' }) }],
    ['a group message', { message: privateMessage({ chat: { id: -100, type: 'supergroup' } }) }],
    ['another bot', { message: privateMessage({ from: { id: 555, is_bot: true, first_name: 'Bot' } }) }],
    ['a message without text', { message: privateMessage({ text: undefined }) }],
    ['an edited message', { edited_message: privateMessage() }],
  ])('ignores %s', async (_name, update) => {
    const { POST } = await import('../../src/app/v1/webhooks/telegram/route');
    expect((await POST(request({ update_id: 3, ...update }) as never)).status).toBe(200);
    expect(inserts()).toHaveLength(0);
  });

  it('rejects a request without the configured secret', async () => {
    const { POST } = await import('../../src/app/v1/webhooks/telegram/route');
    expect((await POST(request({ message: privateMessage() }, 'forged') as never)).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    expect((await POST(request({ message: privateMessage() }) as never)).status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });
});
