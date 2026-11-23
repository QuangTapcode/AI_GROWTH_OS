import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { TelegramBotRunner } from '../TelegramBotRunner';

describe('TelegramBotRunner', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is disabled without TELEGRAM_BOT_TOKEN or when TELEGRAM_BOT_MODE=webhook', () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    const pool = { query: vi.fn() } as unknown as Pool;
    expect(new TelegramBotRunner(pool).isEnabled()).toBe(false);

    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-token');
    vi.stubEnv('TELEGRAM_BOT_MODE', 'webhook');
    expect(new TelegramBotRunner(pool).isEnabled()).toBe(false);

    vi.stubEnv('TELEGRAM_BOT_MODE', 'polling');
    expect(new TelegramBotRunner(pool).isEnabled()).toBe(true);
  });

  it('handles /start and /community immediately with inline Facebook button + logs invite, and queues normal DMs', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-secret');
    vi.stubEnv('TELEGRAM_WEBHOOK_WORKSPACE_ID', 'ws-1');
    vi.stubEnv('TELEGRAM_BOT_MODE', 'polling');

    const sqlCalls: Array<{ text: string; params: unknown[] }> = [];
    const pool = {
      query: vi.fn(async (text: string, params: unknown[] = []) => {
        sqlCalls.push({ text, params });
        if (text.includes('INSERT INTO community_messages')) return { rows: [{ id: 'msg-1' }], rowCount: 1 };
        if (text.includes('FROM community_hub_settings')) {
          return {
            rows: [{
              community_name: 'Cộng đồng TripC Đà Nẵng',
              group_url: 'https://www.facebook.com/groups/1134282109069209',
              positioning: 'Cẩm nang Đà Nẵng & Việt Nam',
            }],
          };
        }
        return { rows: [], rowCount: 1 };
      }),
    } as unknown as Pool;

    const apiCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      apiCalls.push({ url, body });
      if (url.endsWith('/getUpdates')) {
        return new Response(JSON.stringify({
          ok: true,
          result: [
            {
              update_id: 100,
              message: {
                message_id: 1,
                text: '/start',
                from: { id: 777, is_bot: false, first_name: 'Quang', username: 'quang_dev' },
                chat: { id: 777, type: 'private' },
              },
            },
            {
              update_id: 101,
              message: {
                message_id: 2,
                text: 'Bãi biển Mỹ Khê có đẹp không?',
                from: { id: 777, is_bot: false, first_name: 'Quang', username: 'quang_dev' },
                chat: { id: 777, type: 'private' },
              },
            },
            {
              update_id: 102,
              message: {
                message_id: 3,
                text: '/unknown',
                from: { id: 777, is_bot: false, first_name: 'Quang' },
                chat: { id: 777, type: 'private' },
              },
            },
            {
              update_id: 103,
              message: {
                message_id: 4,
                text: 'hi in group',
                from: { id: 777, is_bot: false, first_name: 'Quang' },
                chat: { id: -999, type: 'supergroup' },
              },
            },
          ],
        }));
      }
      if (url.endsWith('/sendMessage')) {
        return new Response(JSON.stringify({ ok: true, result: { message_id: 501 } }));
      }
      return new Response(JSON.stringify({ ok: true, result: true }));
    }) as unknown as typeof fetch;

    const onMessageIngested = vi.fn();
    const runner = new TelegramBotRunner(pool, { onMessageIngested, fetchImpl, pollTimeoutSeconds: 1 });
    const out = await runner.pollOnce();

    expect(out).toEqual({ processed: 2 });
    expect(onMessageIngested).toHaveBeenCalledTimes(1);

    const sendMsg = apiCalls.find((c) => c.url.endsWith('/sendMessage'));
    expect(sendMsg).toBeDefined();
    expect(sendMsg!.body.chat_id).toBe('777');
    expect(String(sendMsg!.body.text)).toContain('Cộng đồng TripC Đà Nẵng');
    expect((sendMsg!.body.reply_markup as { inline_keyboard: Array<Array<{ url?: string }>> }).inline_keyboard[0][0].url).toBe(
      'https://www.facebook.com/groups/1134282109069209',
    );

    const inviteLog = sqlCalls.find((c) => c.text.includes('INSERT INTO community_invite_logs'));
    expect(inviteLog).toBeDefined();
    expect(inviteLog!.params).toEqual(expect.arrayContaining(['ws-1', 'tg:777', 'Quang']));

    const dmInsert = sqlCalls.filter((c) => c.text.includes('INSERT INTO community_messages'))[1];
    expect(dmInsert.params).toContain('Bãi biển Mỹ Khê có đẹp không?');
    expect(JSON.parse(String(dmInsert.params[5]))).toEqual({ username: 'quang_dev' });

    // Next poll advances offset past 103 (to 104).
    await runner.pollOnce();
    const secondGetUpdates = apiCalls.filter((c) => c.url.endsWith('/getUpdates'))[1]!;
    expect(secondGetUpdates.body.offset).toBe(104);
  });

  it('reports 409 webhook conflict cleanly without throwing', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-secret');
    vi.stubEnv('TELEGRAM_BOT_MODE', 'polling');
    const pool = { query: vi.fn() } as unknown as Pool;
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error_code: 409, description: 'Conflict: terminated by setWebhook' }), { status: 409 }),
    ) as unknown as typeof fetch;

    const runner = new TelegramBotRunner(pool, { fetchImpl, pollTimeoutSeconds: 1 });
    expect(await runner.pollOnce()).toEqual({ processed: 0, conflict: true });
  });

  it('does not advance offset when database insert fails so pending updates are retried', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-secret');
    vi.stubEnv('TELEGRAM_WEBHOOK_WORKSPACE_ID', 'ws-1');
    vi.stubEnv('TELEGRAM_BOT_MODE', 'polling');

    let failOnce = true;
    const pool = {
      query: vi.fn(async () => {
        if (failOnce) {
          failOnce = false;
          throw new Error('temporary constraint error');
        }
        return { rows: [{ id: 'msg-retry' }], rowCount: 1 };
      }),
    } as unknown as Pool;

    const offsetsSeen: Array<number | undefined> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as { offset?: number } : {};
      if (url.endsWith('/getUpdates')) {
        offsetsSeen.push(body.offset);
        return new Response(JSON.stringify({
          ok: true,
          result: [
            {
              update_id: 205,
              message: {
                message_id: 1,
                text: '/start',
                from: { id: 888, is_bot: false, first_name: 'Minh' },
                chat: { id: 888, type: 'private' },
              },
            },
          ],
        }));
      }
      if (url.endsWith('/sendMessage')) {
        return new Response(JSON.stringify({ ok: true, result: { message_id: 601 } }));
      }
      return new Response(JSON.stringify({ ok: true, result: true }));
    }) as unknown as typeof fetch;

    const runner = new TelegramBotRunner(pool, { fetchImpl, pollTimeoutSeconds: 1 });
    await expect(runner.pollOnce()).rejects.toThrow('temporary constraint error');

    // Second poll retries with offset 0 instead of dropping update 205.
    expect(await runner.pollOnce()).toEqual({ processed: 1 });
    expect(offsetsSeen).toEqual([0, 0]);
  });

  it('answers in Telegram groups only messages that say "MyLe", and still welcomes new members', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '9005376:bot-secret');
    vi.stubEnv('TELEGRAM_WEBHOOK_WORKSPACE_ID', 'ws-1');
    vi.stubEnv('TELEGRAM_BOT_MODE', 'polling');

    const sqlCalls: Array<{ text: string; params: unknown[] }> = [];
    const pool = {
      query: vi.fn(async (text: string, params: unknown[] = []) => {
        sqlCalls.push({ text, params });
        if (text.includes('INSERT INTO community_messages')) return { rows: [{ id: `msg-${sqlCalls.length}` }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      }),
    } as unknown as Pool;

    const apiCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
      apiCalls.push({ url, body });
      if (url.endsWith('/getUpdates')) {
        return new Response(JSON.stringify({
          ok: true,
          result: [
            {
              update_id: 300,
              message: {
                message_id: 10,
                text: 'ngủ đi kkk',
                from: { id: 111, is_bot: false, first_name: 'Quang' },
                chat: { id: -100555, type: 'supergroup', title: 'Nhóm Du Lịch' },
              },
            },
            {
              update_id: 301,
              message: {
                message_id: 11,
                text: '@tripc_community_bot',
                entities: [{ type: 'mention', offset: 0, length: 20 }],
                from: { id: 222, is_bot: false, first_name: 'Hung' },
                chat: { id: -100555, type: 'supergroup', title: 'Nhóm Du Lịch' },
              },
            },
            {
              update_id: 302,
              message: {
                message_id: 12,
                text: '@tripc_community_bot, Đà Nẵng có bãi biển nào đẹp?',
                entities: [{ type: 'mention', offset: 0, length: 20 }],
                from: { id: 222, is_bot: false, first_name: 'Hung' },
                chat: { id: -100555, type: 'supergroup', title: 'Nhóm Du Lịch' },
              },
            },
            {
              update_id: 303,
              message: {
                message_id: 13,
                text: 'Ở đó ăn sáng món gì ngon?',
                reply_to_message: {
                  message_id: 120,
                  from: { id: 9005376, is_bot: true, username: 'tripc_community_bot' },
                  text: 'Bãi biển Mỹ Khê rất đẹp...',
                },
                from: { id: 111, is_bot: false, first_name: 'Quang' },
                chat: { id: -100555, type: 'supergroup', title: 'Nhóm Du Lịch' },
              },
            },
            {
              update_id: 304,
              message: {
                message_id: 14,
                new_chat_members: [{ id: 333, is_bot: false, first_name: 'Lan' }],
                from: { id: 222, is_bot: false, first_name: 'Hung' },
                chat: { id: -100555, type: 'supergroup', title: 'Nhóm Du Lịch' },
              },
            },
            {
              update_id: 305,
              message: {
                message_id: 15,
                text: '/help@other_bot',
                from: { id: 222, is_bot: false, first_name: 'Hung' },
                chat: { id: -100555, type: 'supergroup', title: 'Nhóm Du Lịch' },
              },
            },
            {
              update_id: 306,
              message: {
                message_id: 16,
                text: 'bot ơi nói chuyện với mọi người đi',
                from: { id: 111, is_bot: false, first_name: 'Quang' },
                chat: { id: -100555, type: 'supergroup', title: 'Nhóm Du Lịch' },
              },
            },
            {
              update_id: 307,
              message: {
                message_id: 17,
                text: 'MyLe ơi, Đà Nẵng có bãi biển nào đẹp?',
                from: { id: 111, is_bot: false, first_name: 'Quang' },
                chat: { id: -100555, type: 'supergroup', title: 'Nhóm Du Lịch' },
              },
            },
            {
              update_id: 308,
              message: {
                message_id: 18,
                text: 'ở đó ăn sáng món gì ngon vậy myle',
                from: { id: 111, is_bot: false, first_name: 'Quang' },
                chat: { id: -100555, type: 'supergroup', title: 'Nhóm Du Lịch' },
              },
            },
            {
              update_id: 309,
              message: {
                message_id: 19,
                text: 'MyLe',
                from: { id: 222, is_bot: false, first_name: 'Hung' },
                chat: { id: -100555, type: 'supergroup', title: 'Nhóm Du Lịch' },
              },
            },
          ],
        }));
      }
      if (url.endsWith('/sendMessage')) {
        return new Response(JSON.stringify({ ok: true, result: { message_id: 700 + apiCalls.length } }));
      }
      return new Response(JSON.stringify({ ok: true, result: true }));
    }) as unknown as typeof fetch;

    const onMessageIngested = vi.fn();
    const runner = new TelegramBotRunner(pool, {
      onMessageIngested,
      fetchImpl,
      pollTimeoutSeconds: 1,
      botId: 9005376,
      botUsername: 'tripc_community_bot',
    });

    const out = await runner.pollOnce();
    expect(out).toEqual({ processed: 4 });
    // Owner's rule (2026-11-11): only "MyLe" calls the bot; @mention, a reply to it or the word "bot" no longer do.
    expect(onMessageIngested).toHaveBeenCalledTimes(2);

    const sends = apiCalls.filter((c) => c.url.endsWith('/sendMessage'));
    expect(sends.map((c) => c.body.reply_to_message_id)).toEqual([14, 19]);
    expect(String(sends[0]!.body.text)).toContain('Lan');
    expect(String(sends[1]!.body.text)).toContain('MyLe');

    const msgInserts = sqlCalls.filter((c) => c.text.includes('INSERT INTO community_messages'));
    // Every message the bot answers is logged; the questions go in without "MyLe ơi".
    expect(msgInserts.map((c) => c.params[4])).toEqual(
      ['[Thành viên mới: Lan]', 'Đà Nẵng có bãi biển nào đẹp?', 'ở đó ăn sáng món gì ngon vậy', 'MyLe']);
    expect(JSON.parse(String(msgInserts[1]!.params[5]))).toMatchObject({ chat_type: 'supergroup', reply_to_message_id: 17 });
  });
});

