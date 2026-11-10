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

  it('welcomes /start and queues an instant interactive intro with Facebook community button', async () => {
    const { POST } = await import('../../src/app/v1/webhooks/telegram/route');
    query.mockImplementation((sql: string) => {
      if (String(sql).includes('INSERT INTO community_messages')) return { rows: [{ id: 'msg-start-1' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const res = await POST(request({ update_id: 20, message: privateMessage({ text: '/start', from: { id: 555, is_bot: false, first_name: 'Linh', last_name: 'Tran', username: 'linh_danang' } }) }) as never);
    expect(res.status).toBe(200);
    expect(inserts()).toHaveLength(1);
    const outbox = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO outbox_events'));
    expect(outbox).toHaveLength(1);
    const payload = JSON.parse(String(outbox[0][1][2]));
    expect(payload.reply_markup?.inline_keyboard?.[0]?.[0]?.url).toContain('facebook.com/groups/');
    expect(payload.should_community_invite).toBe(true);
  });

  it('responds to /community command with the Facebook Group link & CTA button', async () => {
    const { POST } = await import('../../src/app/v1/webhooks/telegram/route');
    query.mockImplementation((sql: string) => {
      if (String(sql).includes('INSERT INTO community_messages')) return { rows: [{ id: 'msg-comm-1' }], rowCount: 1 };
      if (String(sql).includes('FROM community_hub_settings')) {
        return { rows: [{ community_name: 'Cộng đồng TripC Đà Nẵng', group_url: 'https://www.facebook.com/groups/custom999' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });
    const res = await POST(request({ update_id: 21, message: privateMessage({ text: '/community' }) }) as never);
    expect(res.status).toBe(200);
    const outbox = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO outbox_events'));
    expect(outbox).toHaveLength(1);
    const payload = JSON.parse(String(outbox[0][1][2]));
    expect(payload.text).toContain('https://www.facebook.com/groups/custom999');
    expect(payload.reply_markup?.inline_keyboard?.[0]?.[0]?.url).toBe('https://www.facebook.com/groups/custom999');
  });

  it('replies immediately when tagged as @tripc_community_bot alone in a group', async () => {
    const { POST } = await import('../../src/app/v1/webhooks/telegram/route');
    query.mockImplementation((sql: string) => {
      if (String(sql).includes('INSERT INTO community_messages')) return { rows: [{ id: 'msg-grp-ping' }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const res = await POST(request({
      update_id: 30,
      message: {
        message_id: 77,
        text: '@tripc_community_bot',
        entities: [{ type: 'mention', offset: 0, length: 20 }],
        from: { id: 555, is_bot: false, first_name: 'Quang' },
        chat: { id: -100, type: 'supergroup', title: 'Nhóm Du Lịch' },
      },
    }) as never);
    expect(res.status).toBe(200);
    const outbox = query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO outbox_events'));
    expect(outbox).toHaveLength(1);
    const payload = JSON.parse(String(outbox[0][1][2]));
    expect(payload.recipient).toBe('-100');
    expect(payload.reply_to_message_id).toBe(77);
    expect(payload.text).toContain('@tripc_community_bot');
  });

  it('strips @tripc_community_bot and queues clean group questions with reply_to_message_id', async () => {
    const { POST } = await import('../../src/app/v1/webhooks/telegram/route');
    const res = await POST(request({
      update_id: 31,
      message: {
        message_id: 78,
        text: '@tripc_community_bot Mỹ Khê có đẹp không?',
        entities: [{ type: 'mention', offset: 0, length: 20 }],
        from: { id: 555, is_bot: false, first_name: 'Quang' },
        chat: { id: -100, type: 'supergroup', title: 'Nhóm Du Lịch' },
      },
    }) as never);
    expect(res.status).toBe(200);
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0][1][4]).toBe('Mỹ Khê có đẹp không?');
    expect(JSON.parse(String(inserts()[0][1][5]))).toMatchObject({
      chat_type: 'supergroup',
      reply_to_message_id: 78,
    });
  });

  it.each([
    ['the connected account writing to a customer', { business_message: privateMessage({ business_connection_id: 'conn-1', from: { id: 999, first_name: 'Owner' } }) }],
    ['an unknown slash command', { message: privateMessage({ text: '/unknowncmd' }) }],
    ['an unaddressed group message', { message: privateMessage({ chat: { id: -100, type: 'supergroup' } }) }],
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
