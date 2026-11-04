import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { CommunityReplyRunner, sendTelegramReply } from '../CommunityReplyRunner';

const event = { id: 'evt-1', workspace_id: 'ws-1', payload: { message_id: 'msg-1', recipient: 'psid-1', text: 'Street food stalls open every evening.' } };

function harness(claimed: unknown) {
  const sql: { text: string; params: unknown[] }[] = [];
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    sql.push({ text, params });
    if (text.includes("SET status = 'processing'")) return { rows: claimed ? [claimed] : [] };
    return { rows: [], rowCount: 1 };
  });
  return { pool: { query } as unknown as Pool, sql };
}

describe('CommunityReplyRunner', () => {
  it('sends a queued reply to that person on Messenger, then marks the message replied', async () => {
    const { pool, sql } = harness(event);
    const send = vi.fn(async () => ({ message_id: 'm_reply' }));
    expect(await new CommunityReplyRunner(pool, send).runOnce()).toBe('sent');
    expect(send).toHaveBeenCalledWith('psid-1', 'Street food stalls open every evening.');
    const replied = sql.find((s) => s.text.includes("status = 'replied'"))!;
    expect(replied.params).toEqual(expect.arrayContaining(['ws-1', 'msg-1']));
    expect(sql.some((s) => s.text.includes("status = 'published'"))).toBe(true);
  });

  it('keeps the message unanswered and records the refusal without resending', async () => {
    const { pool, sql } = harness(event);
    const send = vi.fn(async () => { throw new Error('MESSENGER_REFUSED: (#10) outside the 24 hour window'); });
    expect(await new CommunityReplyRunner(pool, send).runOnce()).toBe('failed');
    expect(sql.some((s) => s.text.includes("status = 'replied'"))).toBe(false);
    expect(sql.find((s) => s.text.includes("status = 'failed'"))).toBeTruthy();
  });

  it('is idle without queued replies', async () => {
    const { pool } = harness(undefined);
    expect(await new CommunityReplyRunner(pool, vi.fn()).runOnce()).toBe('idle');
  });

  it('sends a Telegram reply through the Telegram sender, from the connected account when there is one', async () => {
    const telegramEvent = { ...event, payload: { ...event.payload, recipient: '555', platform: 'telegram_message', business_connection_id: 'conn-1' } };
    const { pool, sql } = harness(telegramEvent);
    const messenger = vi.fn();
    const telegram = vi.fn(async () => ({ message_id: '42' }));
    expect(await new CommunityReplyRunner(pool, messenger, telegram).runOnce()).toBe('sent');
    expect(telegram).toHaveBeenCalledWith('555', 'Street food stalls open every evening.', 'conn-1');
    expect(messenger).not.toHaveBeenCalled();
    expect(sql.some((s) => s.text.includes("status = 'replied'"))).toBe(true);
  });
});

describe('sendTelegramReply', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('needs the server-side bot token', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    await expect(sendTelegramReply('555', 'Hi')).rejects.toThrow('TELEGRAM_NOT_CONFIGURED');
  });

  it('posts to the chat and returns the sent message id', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-token');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 42 } })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await sendTelegramReply('555', 'Hi', 'conn-1')).toEqual({ message_id: '42' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.telegram.org/botbot-token/sendMessage');
    expect(JSON.parse(String(init.body))).toEqual({ chat_id: '555', text: 'Hi', business_connection_id: 'conn-1' });
  });

  it('reports a refusal without the token in the error', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-token');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }), { status: 403 })));
    const error = await sendTelegramReply('555', 'Hi').catch((e: Error) => e);
    expect((error as Error).message).toBe('TELEGRAM_REFUSED: (#403) Forbidden: bot was blocked by the user');
  });
});
