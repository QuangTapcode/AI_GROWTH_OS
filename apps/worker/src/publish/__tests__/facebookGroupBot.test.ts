import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { FacebookGroupBot } from '../FacebookGroupBot';
import { FacebookGroupPublisher } from '../FacebookGroupPublisher';

describe('FacebookGroupBot & FacebookGroupPublisher', () => {
  const originalSessionFile = process.env.FB_SESSION_FILE;
  const originalCookie = process.env.FB_ADMIN_COOKIE;

  afterEach(() => {
    if (originalSessionFile === undefined) delete process.env.FB_SESSION_FILE;
    else process.env.FB_SESSION_FILE = originalSessionFile;

    if (originalCookie === undefined) delete process.env.FB_ADMIN_COOKIE;
    else process.env.FB_ADMIN_COOKIE = originalCookie;
  });

  it('resolveStateFile mặc định trỏ tới apps/worker/.fb-session.json thay vì process.cwd()', () => {
    delete process.env.FB_SESSION_FILE;
    const resolved = FacebookGroupBot.resolveStateFile();
    expect(resolved.endsWith(path.join('apps', 'worker', '.fb-session.json'))).toBe(true);
  });

  it('buildPostText không nhân đôi tiêu đề [CẨM NANG CỘNG ĐỒNG], prompt 💬 hoặc hashtag nếu body đã có', () => {
    const richBody = [
      '🇻🇳 [CẨM NANG CỘNG ĐỒNG] Apartment Viewing Checklist',
      '',
      'Kinh nghiệm đi xem căn hộ thực tế tại Đà Nẵng.',
      '',
      '💬 Bạn đã từng thuê căn hộ ở khu vực nào?',
      '👉 Tham gia Group: https://www.facebook.com/groups/1134282109069209',
      '',
      '#CongDongDuLich #DaNang',
    ].join('\n');

    const text = FacebookGroupBot.buildPostText({
      title: 'Apartment Viewing Checklist',
      body: richBody,
      discussionPrompt: 'Bạn đã từng thuê căn hộ ở khu vực nào?',
      hashtags: ['#CongDongDuLich'],
    });

    expect(text.match(/\[CẨM NANG CỘNG ĐỒNG\]/g)?.length).toBe(1);
    expect(text.match(/💬/g)?.length).toBe(1);
    expect(text.match(/#CongDongDuLich/g)?.length).toBe(1);
  });

  it('buildPostText không gắn trùng [CẨM NANG CỘNG ĐỒNG] nếu body đã có [VIETNAM PLAYBOOK]', () => {
    const playbookBody = [
      '🇻🇳 [VIETNAM PLAYBOOK] Apartment Viewing Checklist in Vietnam',
      '',
      '• Check mobile signal and EVN electricity rates.',
      '',
      '💬 What is your #1 checklist item?',
      '#CongDongDuLich',
    ].join('\n');

    const text = FacebookGroupBot.buildPostText({
      title: 'Apartment Viewing Checklist in Vietnam',
      body: playbookBody,
    });

    expect(text).not.toContain('[CẨM NANG CỘNG ĐỒNG]');
    expect(text.match(/\[VIETNAM PLAYBOOK\]/g)?.length).toBe(1);
  });

  it('buildPostText tự gắn header, câu hỏi thảo luận và hashtag khi body là văn bản thuần', () => {
    const text = FacebookGroupBot.buildPostText({
      title: 'eSIM Vietnam',
      body: 'So sánh eSIM và SIM vật lý khi nhập cảnh Việt Nam.',
      discussionPrompt: 'Bạn dùng nhà mạng nào?',
      hashtags: ['#TravelVietnam'],
    });

    expect(text).toContain('🇻🇳 [CẨM NANG CỘNG ĐỒNG] eSIM Vietnam');
    expect(text).toContain('💬 Bạn dùng nhà mạng nào?');
    expect(text).toContain('#TravelVietnam');
  });

  it('FacebookGroupPublisher fail-closed với FACEBOOK_GROUP_SESSION_MISSING và không fallback Fanpage khi thiếu session', async () => {
    process.env.FB_SESSION_FILE = path.join(process.cwd(), `non-existent-fb-session-${Date.now()}.json`);
    delete process.env.FB_ADMIN_COOKIE;

    const publisher = new FacebookGroupPublisher();
    const res = await publisher.publish({
      contentId: 'art_1',
      channel: 'FacebookGroup',
      bodyMarkdown: 'Bài đăng Cộng đồng',
      metaTitle: 'Bài đăng Cộng đồng',
      idempotencyKey: 'publish:ws:art_1:facebookgroup:1',
      workspaceId: 'ws_1',
      linkUrl: 'https://www.facebook.com/groups/1134282109069209',
    });

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('FACEBOOK_GROUP_SESSION_MISSING');
    expect(res.isManualFallback).toBeUndefined();
  });
});

