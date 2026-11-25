import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { FacebookGroupBot } from '../FacebookGroupBot';

const page = (links: Array<{ href: string; text: string }>) =>
  ({ $$eval: async () => links }) as unknown as Page;

describe('reading Group comment notifications', () => {
  it('keeps comment notifications of this Group only, once each, with a readable post link', async () => {
    const bot = new FacebookGroupBot();
    const found = await bot.readGroupCommentNotifications(
      page([
        { href: 'https://www.facebook.com/groups/111/?post_id=222&comment_id=333&notif_id=1&notif_t=group_comment&ref=notif', text: 'Tùng Dương đã bình luận' },
        { href: 'https://www.facebook.com/groups/111/?post_id=222&comment_id=333&notif_id=1&notif_t=group_comment&ref=notif', text: 'duplicate row' },
        { href: 'https://www.facebook.com/groups/111/?post_id=222&comment_id=333&reply_comment_id=444&notif_t=group_comment_mention', text: 'nhắc đến bạn' },
        { href: 'https://www.facebook.com/groups/999/?post_id=1&comment_id=2&notif_t=group_comment', text: 'another group' },
        { href: 'https://www.facebook.com/friends/requests/?notif_t=friend', text: 'friend request' },
        { href: 'https://www.facebook.com/groups/111/?notif_t=group_highlights', text: 'no comment id' },
      ]),
      '111',
    );
    expect(found.map((n) => n.key)).toEqual(['222:333:', '222:333:444']);
    expect(found[0]).toMatchObject({ postUrl: 'https://www.facebook.com/groups/111/posts/222/', commentId: '333', type: 'group_comment' });
    expect(found[1].replyCommentId).toBe('444');
  });
});
