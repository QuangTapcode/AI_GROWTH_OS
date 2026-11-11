import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  CommunityReplyRunner,
  sendPageCommentReply,
  sendPrivateReplyToComment,
  sendTelegramReply,
} from '../CommunityReplyRunner';

const event = { id: 'evt-1', workspace_id: 'ws-1', payload: { message_id: 'msg-1', recipient: 'psid-1', text: 'Street food stalls open every evening.' } };

function harness(claimed: unknown, quota: { sent_today: number; daily_limit: number } = { sent_today: 2, daily_limit: 12 }) {
  const sql: { text: string; params: unknown[] }[] = [];
  const query = vi.fn(async (text: string, params: unknown[] = []) => {
    sql.push({ text, params });
    if (text.includes("SET status = 'processing'")) return { rows: claimed ? [claimed] : [] };
    if (text.includes('sent_today') && text.includes('daily_limit')) return { rows: [quota] };
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

  it('forwards inline keyboard markup on Telegram reply and records community_invite_logs when invited', async () => {
    const markup = {
      inline_keyboard: [[{ text: '👥 Tham gia Cộng đồng trên Facebook', url: 'https://www.facebook.com/groups/1134282109069209' }]],
    };
    const telegramEvent = {
      ...event,
      payload: {
        ...event.payload,
        recipient: '555',
        platform: 'telegram_message',
        reply_markup: markup,
        should_community_invite: true,
        invite_group_url: 'https://www.facebook.com/groups/1134282109069209',
        author_name: 'Lan Anh',
      },
    };
    const { pool, sql } = harness(telegramEvent);
    const telegram = vi.fn(async () => ({ message_id: '77' }));
    expect(await new CommunityReplyRunner(pool, vi.fn(), telegram).runOnce()).toBe('sent');
    expect(telegram).toHaveBeenCalledWith('555', 'Street food stalls open every evening.', undefined, { reply_markup: markup });
    const inviteLog = sql.find((s) => s.text.includes('INSERT INTO community_invite_logs'));
    expect(inviteLog).toBeTruthy();
    expect(inviteLog!.params).toEqual(expect.arrayContaining(['ws-1', 'tg:555', 'Lan Anh']));
  });

  it('forwards reply_to_message_id and message_thread_id for Telegram group replies', async () => {
    const groupEvent = {
      ...event,
      payload: {
        ...event.payload,
        recipient: '-100555',
        platform: 'telegram_message',
        reply_to_message_id: 42,
        message_thread_id: 7,
      },
    };
    const { pool } = harness(groupEvent);
    const telegram = vi.fn(async () => ({ message_id: '88' }));
    expect(await new CommunityReplyRunner(pool, vi.fn(), telegram).runOnce()).toBe('sent');
    expect(telegram).toHaveBeenCalledWith('-100555', 'Street food stalls open every evening.', undefined, {
      reply_to_message_id: 42,
      message_thread_id: 7,
    });
  });

  it('replies publicly to a Fanpage comment via comment_id (not recipient user_id) and sends Private Reply invite within quota', async () => {
    const commentEvent = {
      id: 'evt-cmt-1',
      workspace_id: 'ws-1',
      payload: {
        message_id: 'msg-cmt-1',
        recipient: 'user_123',
        text: 'Thủ tục gia hạn visa Việt Nam 90 ngày rất đơn giản.',
        platform: 'facebook_comment',
        comment_id: 'comment:cmt_99',
        comment_source: 'page' as const,
        author_name: 'Minh Nguyen',
        should_private_invite: true,
        invite_group_url: 'https://www.facebook.com/groups/1134282109069209',
        community_name: 'Cộng đồng Du lịch & Sống tại Việt Nam',
      },
    };
    const { pool, sql } = harness(commentEvent, { sent_today: 2, daily_limit: 12 });
    const sendPageComment = vi.fn(async (_commentId: string, _text: string) => ({ id: 'reply_99', message_id: 'reply_99' }));
    const sendPrivateReply = vi.fn(async (_commentId: string, _text: string) => ({ message_id: 'priv_99' }));

    const runner = new CommunityReplyRunner(pool, vi.fn(), vi.fn(), {
      sendPageComment,
      sendPrivateReply,
    });
    expect(await runner.runOnce()).toBe('sent');

    expect(sendPageComment).toHaveBeenCalledWith('cmt_99', 'Thủ tục gia hạn visa Việt Nam 90 ngày rất đơn giản.');
    expect(sendPrivateReply).toHaveBeenCalledTimes(1);
    const [privCommentId, privBody] = sendPrivateReply.mock.calls[0]!;
    expect(privCommentId).toBe('cmt_99');
    expect(privBody).toContain('https://www.facebook.com/groups/1134282109069209');

    const inviteInsert = sql.find((s) => s.text.includes('INSERT INTO community_invite_logs'));
    expect(inviteInsert).toBeTruthy();
    expect(inviteInsert!.params).toEqual(expect.arrayContaining(['ws-1', 'cmt:cmt_99', 'Minh Nguyen']));

    const replied = sql.find((s) => s.text.includes("SET status = 'replied'"));
    expect(replied).toBeTruthy();
    const meta = JSON.parse(String(replied!.params[2])) as Record<string, unknown>;
    expect(meta.reply_channel).toBe('facebook_page_comment');
    expect(meta.private_invite_sent).toBe(true);
    expect(meta.private_invite_message_id).toBe('priv_99');
  });

  it('replies publicly to Fanpage comment ONLY without Private Reply invite when daily invite quota is reached', async () => {
    const commentEvent = {
      id: 'evt-cmt-2',
      workspace_id: 'ws-1',
      payload: {
        message_id: 'msg-cmt-2',
        recipient: 'user_456',
        text: 'Bạn nên kiểm tra hợp đồng điện nước trước khi cọc.',
        platform: 'facebook_comment',
        comment_id: 'cmt_100',
        comment_source: 'page' as const,
        author_name: 'Lan Pham',
        should_private_invite: true,
        invite_group_url: 'https://www.facebook.com/groups/1134282109069209',
      },
    };
    const { pool, sql } = harness(commentEvent, { sent_today: 12, daily_limit: 12 });
    const sendPageComment = vi.fn(async () => ({ id: 'reply_100', message_id: 'reply_100' }));
    const sendPrivateReply = vi.fn(async () => ({ message_id: 'priv_should_not_send' }));

    const runner = new CommunityReplyRunner(pool, vi.fn(), vi.fn(), {
      sendPageComment,
      sendPrivateReply,
    });
    expect(await runner.runOnce()).toBe('sent');

    expect(sendPageComment).toHaveBeenCalledWith('cmt_100', 'Bạn nên kiểm tra hợp đồng điện nước trước khi cọc.');
    expect(sendPrivateReply).not.toHaveBeenCalled();
    expect(sql.some((s) => s.text.includes('INSERT INTO community_invite_logs'))).toBe(false);

    const replied = sql.find((s) => s.text.includes("SET status = 'replied'"))!;
    const meta = JSON.parse(String(replied.params[2])) as Record<string, unknown>;
    expect(meta.private_invite_sent).toBe(false);
    expect(meta.private_invite_note).toBe('daily_quota_reached');
  });

  it('replies to a Facebook Group comment via Group handler and fails closed when post_url is missing', async () => {
    const groupEvent = {
      id: 'evt-grp-1',
      workspace_id: 'ws-1',
      payload: {
        message_id: 'msg-grp-1',
        recipient: 'grp_user_1',
        text: 'Khu vực An Thượng có nhiều căn hộ gần biển.',
        platform: 'facebook_comment',
        comment_id: 'grpcmt:123:abc',
        comment_source: 'group' as const,
        post_url: 'https://www.facebook.com/groups/1134282109069209/posts/999',
        author_name: 'Tuan Tran',
        question_snippet: 'Khu nào gần biển?',
      },
    };
    const { pool, sql } = harness(groupEvent);
    const sendGroupComment = vi.fn(async () => ({ success: true, message: 'OK' }));
    const runner = new CommunityReplyRunner(pool, vi.fn(), vi.fn(), { sendGroupComment });

    expect(await runner.runOnce()).toBe('sent');
    expect(sendGroupComment).toHaveBeenCalledWith({
      postUrl: 'https://www.facebook.com/groups/1134282109069209/posts/999',
      authorName: 'Tuan Tran',
      questionSnippet: 'Khu nào gần biển?',
      replyText: 'Khu vực An Thượng có nhiều căn hộ gần biển.',
    });
    const replied = sql.find((s) => s.text.includes("SET status = 'replied'"))!;
    const meta = JSON.parse(String(replied.params[2])) as Record<string, unknown>;
    expect(meta.reply_channel).toBe('facebook_group_comment');
    expect(meta.reply_text).toBe('Khu vực An Thượng có nhiều căn hộ gần biển.');
    expect(meta.post_url).toBe('https://www.facebook.com/groups/1134282109069209/posts/999');

    const badGroupEvent = {
      ...groupEvent,
      payload: { ...groupEvent.payload, post_url: undefined },
    };
    const badHarness = harness(badGroupEvent);
    const badRunner = new CommunityReplyRunner(badHarness.pool, vi.fn(), vi.fn(), { sendGroupComment });
    expect(await badRunner.runOnce()).toBe('failed');
    const failedUpdate = badHarness.sql.find((s) => s.text.includes('UPDATE community_messages SET metadata'));
    expect(String(failedUpdate?.params[2])).toContain('GROUP_COMMENT_MISSING_POST_URL');
  });
});

describe('sendPageCommentReply & sendPrivateReplyToComment', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('sendPageCommentReply calls POST /{commentId}/comments and never leaks the Page token in errors', async () => {
    vi.stubEnv('FACEBOOK_PAGE_ACCESS_TOKEN', '');
    await expect(sendPageCommentReply('cmt_1', 'Hi')).rejects.toThrow('PAGE_COMMENT_NOT_CONFIGURED');

    vi.stubEnv('FACEBOOK_PAGE_ACCESS_TOKEN', 'super-secret-fb-token');
    const okFetch = vi.fn(async () => new Response(JSON.stringify({ id: 'cmt_reply_1' })));
    vi.stubGlobal('fetch', okFetch);
    expect(await sendPageCommentReply('cmt_1/sub', 'Cảm ơn bạn!')).toEqual({
      id: 'cmt_reply_1',
      message_id: 'cmt_reply_1',
    });
    const [okUrl, okInit] = okFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(okUrl).toBe('https://graph.facebook.com/v20.0/cmt_1%2Fsub/comments');
    expect(JSON.parse(String(okInit.body))).toEqual({ message: 'Cảm ơn bạn!' });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 200, message: 'Permissions error' } }), { status: 403 })));
    const err = await sendPageCommentReply('cmt_1', 'Hi').catch((e: Error) => e) as Error;
    expect(err.message).toBe('COMMENT_REPLY_REFUSED: (#200) Permissions error');
    expect(err.message).not.toContain('super-secret-fb-token');
  });

  it('sendPrivateReplyToComment calls POST /me/messages with recipient.comment_id and fails closed on Graph error', async () => {
    vi.stubEnv('FACEBOOK_PAGE_ACCESS_TOKEN', '');
    await expect(sendPrivateReplyToComment('cmt_1', 'Invite')).rejects.toThrow('MESSENGER_NOT_CONFIGURED');

    vi.stubEnv('FACEBOOK_PAGE_ACCESS_TOKEN', 'super-secret-fb-token');
    const okFetch = vi.fn(async () => new Response(JSON.stringify({ message_id: 'mid.priv_1' })));
    vi.stubGlobal('fetch', okFetch);
    expect(await sendPrivateReplyToComment('cmt_1', 'Mời bạn vào nhóm!')).toEqual({ message_id: 'mid.priv_1' });
    const [okUrl, okInit] = okFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(okUrl).toBe('https://graph.facebook.com/v20.0/me/messages');
    expect(JSON.parse(String(okInit.body))).toEqual({
      recipient: { comment_id: 'cmt_1' },
      message: { text: 'Mời bạn vào nhóm!' },
    });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 10900, message: 'Outside private reply window' } }), { status: 400 })));
    const err = await sendPrivateReplyToComment('cmt_1', 'Mời').catch((e: Error) => e) as Error;
    expect(err.message).toBe('PRIVATE_REPLY_REFUSED: (#10900) Outside private reply window');
    expect(err.message).not.toContain('super-secret-fb-token');
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

  it('includes reply_markup when inline buttons are provided', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-token');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 99 } })));
    vi.stubGlobal('fetch', fetchMock);
    const replyMarkup = { inline_keyboard: [[{ text: 'Join Group', url: 'https://www.facebook.com/groups/1134282109069209' }]] };
    expect(await sendTelegramReply('555', 'Welcome', undefined, { reply_markup: replyMarkup })).toEqual({ message_id: '99' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      chat_id: '555',
      text: 'Welcome',
      reply_markup: replyMarkup,
    });
  });

  it('reports a refusal without the token in the error', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'bot-token');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' }), { status: 403 })));
    const error = await sendTelegramReply('555', 'Hi').catch((e: Error) => e);
    expect((error as Error).message).toBe('TELEGRAM_REFUSED: (#403) Forbidden: bot was blocked by the user');
  });
});
