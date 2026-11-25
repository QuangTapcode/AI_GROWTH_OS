import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CommunityReplyRunner } from '../CommunityReplyRunner';
import { MerchantTikTokCarouselRunner } from '../MerchantTikTokCarouselRunner';

function poolWithEvent(event: Record<string, unknown> | null) {
  const query = vi.fn(async (sql: string) => {
    if (/UPDATE outbox_events SET status = 'processing'/.test(sql)) return { rows: event ? [event] : [] };
    return { rows: [] };
  });
  return { query } as unknown as import('pg').Pool & { query: typeof query };
}

describe('CommunityReplyRunner — kênh mới của Agent 6/7', () => {
  it('instagram_comment → trả lời dưới bình luận Instagram', async () => {
    const pool = poolWithEvent({ id: 'e1', workspace_id: 'ws', payload: { message_id: 'm1', recipient: 'comment:1789', text: 'Cảm ơn bạn!', platform: 'instagram_comment', comment_id: '1789' } });
    const sendInstagramComment = vi.fn(async () => ({ id: 'reply-1' }));
    const runner = new CommunityReplyRunner(pool, vi.fn(), vi.fn(), { sendInstagramComment });
    expect(await runner.runOnce()).toBe('sent');
    expect(sendInstagramComment).toHaveBeenCalledWith('1789', 'Cảm ơn bạn!');
    const update = (pool.query as any).mock.calls.find((c: unknown[]) => /SET status = 'replied'/.test(String(c[0])));
    expect(JSON.parse(update[1][2])).toMatchObject({ reply_channel: 'instagram_comment', reply_message_id: 'reply-1' });
  });

  it('zalo_message → gửi qua Zalo OA', async () => {
    const pool = poolWithEvent({ id: 'e2', workspace_id: 'ws', payload: { message_id: 'm2', recipient: 'zalo-user-1', text: 'Dạ em giữ bàn rồi ạ', platform: 'zalo_message' } });
    const sendZalo = vi.fn(async () => ({ message_id: 'z1' }));
    const send = vi.fn();
    const runner = new CommunityReplyRunner(pool, send, vi.fn(), { sendZalo });
    expect(await runner.runOnce()).toBe('sent');
    expect(sendZalo).toHaveBeenCalledWith('zalo-user-1', 'Dạ em giữ bàn rồi ạ');
    expect(send).not.toHaveBeenCalled();
  });

  it('instagram_message dùng Send API của Page; thông báo đặt bàn không có message_id không cập nhật hộp thư', async () => {
    const pool = poolWithEvent({ id: 'e3', workspace_id: 'ws', payload: { message_id: null, recipient: 'igsid-9', text: 'Quán xác nhận bàn', platform: 'instagram_message' } });
    const send = vi.fn(async () => ({ message_id: 'mid.1' }));
    const runner = new CommunityReplyRunner(pool, send, vi.fn(), {});
    expect(await runner.runOnce()).toBe('sent');
    expect(send).toHaveBeenCalledWith('igsid-9', 'Quán xác nhận bàn');
    expect((pool.query as any).mock.calls.some((c: unknown[]) => /SET status = 'replied'/.test(String(c[0])))).toBe(false);
  });
});

describe('MerchantTikTokCarouselRunner — Agent 4 TikTok', () => {
  const payload = { calendar_entry_id: 'entry-1', image_urls: ['a', 'b', 'c'], caption: 'Bún chả cá #danang', title: 'Bún chả cá', brand: 'Quán Mẫu' };

  it('dựng video rồi đăng, ghi publish_id vào outbox để API đối soát', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'carousel-'));
    const pool = poolWithEvent({ id: 'ev', workspace_id: 'ws1', payload, retry_count: 1 });
    const render = vi.fn(async (_p, out: string) => fs.writeFileSync(out, 'mp4'));
    const publish = vi.fn(async () => ({ success: true, externalPostId: 'pub-123' }));
    const runner = new MerchantTikTokCarouselRunner(pool, render, publish, root);
    (runner as any).authResolver = { resolveTikTokAuth: async () => ({ accessToken: 'tok', openId: 'oid' }) };
    expect(await runner.runOnce()).toBe('published');
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ mediaType: 'video', authOverride: { accessToken: 'tok', openId: 'oid' }, idempotencyKey: 'tiktok-carousel:entry-1' }));
    const done = (pool.query as any).mock.calls.find((c: unknown[]) => /status = 'published'/.test(String(c[0])));
    expect(JSON.parse(done[1][1]).result.publish_id).toBe('pub-123');
  });

  it('lỗi tạm thời → trả về pending để thử lại; lỗi token → failed ngay', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'carousel-'));
    const render = vi.fn(async (_p, out: string) => fs.writeFileSync(out, 'mp4'));
    const transient = new MerchantTikTokCarouselRunner(poolWithEvent({ id: 'ev', workspace_id: 'ws1', payload, retry_count: 1 }), render, async () => ({ success: false, errorCode: 'NETWORK', errorMessage: 'timeout' }), root);
    (transient as any).authResolver = { resolveTikTokAuth: async () => undefined };
    expect(await transient.runOnce()).toBe('retry');
    const fatal = new MerchantTikTokCarouselRunner(poolWithEvent({ id: 'ev', workspace_id: 'ws1', payload, retry_count: 1 }), render, async () => ({ success: false, errorCode: 'TIKTOK_UNAUTHORIZED', errorMessage: 'invalid access_token' }), root);
    (fatal as any).authResolver = { resolveTikTokAuth: async () => undefined };
    expect(await fatal.runOnce()).toBe('failed');
  });
});
