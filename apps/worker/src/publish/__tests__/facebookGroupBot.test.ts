import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FacebookGroupBot } from '../FacebookGroupBot';
import { FacebookGroupPublisher } from '../FacebookGroupPublisher';

describe('FacebookGroupBot & FacebookGroupPublisher', () => {
  const originalSessionFile = process.env.FB_SESSION_FILE;
  const originalCookie = process.env.FB_ADMIN_COOKIE;
  const tempFiles: string[] = [];

  afterEach(() => {
    for (const filePath of tempFiles.splice(0, tempFiles.length)) {
      for (const candidate of [filePath, `${filePath}.pending.tmp`]) {
        try {
          if (fs.existsSync(candidate)) fs.unlinkSync(candidate);
        } catch {}
      }
    }
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

  it('scanGroupComments, replyToGroupComment và sendNativeGroupInvites fail-closed với FACEBOOK_GROUP_SESSION_MISSING khi thiếu session', async () => {
    process.env.FB_SESSION_FILE = path.join(process.cwd(), `non-existent-fb-session-${Date.now()}.json`);
    delete process.env.FB_ADMIN_COOKIE;

    const bot = new FacebookGroupBot();
    await expect(bot.scanGroupComments({ groupUrl: 'https://www.facebook.com/groups/1134282109069209' })).rejects.toThrow(
      'FACEBOOK_GROUP_SESSION_MISSING',
    );
    await expect(
      bot.replyToGroupComment({
        postUrl: 'https://www.facebook.com/groups/1134282109069209/posts/123',
        replyText: 'Trả lời test',
      }),
    ).rejects.toThrow('FACEBOOK_GROUP_SESSION_MISSING');
    await expect(
      bot.sendNativeGroupInvites({
        groupUrl: 'https://www.facebook.com/groups/1134282109069209',
        maxInvites: 5,
      }),
    ).rejects.toThrow('FACEBOOK_GROUP_SESSION_MISSING');
  });

  it('parseFacebookMetricCount chuẩn hóa đúng số liệu tiếng Việt/Anh (K, triệu, bình luận, và N người khác)', () => {
    expect(FacebookGroupBot.parseFacebookMetricCount(15)).toBe(15);
    expect(FacebookGroupBot.parseFacebookMetricCount(0)).toBe(0);
    expect(FacebookGroupBot.parseFacebookMetricCount(-4)).toBe(0);
    expect(FacebookGroupBot.parseFacebookMetricCount(Number.NaN)).toBe(0);
    expect(FacebookGroupBot.parseFacebookMetricCount('15')).toBe(15);
    expect(FacebookGroupBot.parseFacebookMetricCount('1,2K')).toBe(1200);
    expect(FacebookGroupBot.parseFacebookMetricCount('2,4 triệu')).toBe(2400000);
    expect(FacebookGroupBot.parseFacebookMetricCount('1,5 nghìn')).toBe(1500);
    expect(FacebookGroupBot.parseFacebookMetricCount('15 bình luận')).toBe(15);
    expect(FacebookGroupBot.parseFacebookMetricCount('1.234 lượt chia sẻ')).toBe(1234);
    expect(FacebookGroupBot.parseFacebookMetricCount('Bạn và 4 người khác')).toBe(5);
    expect(FacebookGroupBot.parseFacebookMetricCount('Minh, Lan và 12 người khác')).toBe(14);
    expect(FacebookGroupBot.parseFacebookMetricCount('')).toBe(0);
    expect(FacebookGroupBot.parseFacebookMetricCount(null)).toBe(0);
  });

  it('getSessionStatusSync đọc metadata an toàn (usingPageProfile, accountIdMask) và clearSession xóa sạch file tạm', () => {
    const tmpFile = path.join(os.tmpdir(), `vitest-fb-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    tempFiles.push(tmpFile);
    delete process.env.FB_ADMIN_COOKIE;
    process.env.FB_SESSION_FILE = tmpFile;

    const emptyStatus = FacebookGroupBot.getSessionStatusSync(tmpFile);
    expect(emptyStatus).toMatchObject({
      stateFile: tmpFile,
      fileExists: false,
      hasEnvCookie: false,
      ready: false,
      hasAuthCookies: false,
      usingPageProfile: false,
      accountIdMask: null,
    });

    fs.writeFileSync(
      tmpFile,
      JSON.stringify({
        cookies: [
          { name: 'c_user', value: '10001122334455', domain: '.facebook.com' },
          { name: 'xs', value: 'secret-xs-cookie-value', domain: '.facebook.com' },
          { name: 'i_user', value: '61596152213281', domain: '.facebook.com' },
        ],
      }),
      'utf8',
    );
    fs.writeFileSync(`${tmpFile}.pending.tmp`, '{}', 'utf8');

    const pageStatus = FacebookGroupBot.getSessionStatusSync(tmpFile);
    expect(pageStatus.fileExists).toBe(true);
    expect(pageStatus.ready).toBe(true);
    expect(pageStatus.hasAuthCookies).toBe(true);
    expect(pageStatus.usingPageProfile).toBe(true);
    expect(pageStatus.accountIdMask).toBe('***3281');
    expect(JSON.stringify(pageStatus)).not.toContain('secret-xs-cookie-value');
    expect(JSON.stringify(pageStatus)).not.toContain('61596152213281');

    const cleared = new FacebookGroupBot(tmpFile).clearSession();
    expect(cleared).toEqual({ removed: true, stateFile: tmpFile });
    expect(fs.existsSync(tmpFile)).toBe(false);
    expect(fs.existsSync(`${tmpFile}.pending.tmp`)).toBe(false);
    expect(new FacebookGroupBot(tmpFile).clearSession()).toEqual({ removed: false, stateFile: tmpFile });
  });

  it('sanitizeAccountDisplayName loại bỏ nhãn UI chrome của Facebook và giữ nguyên tên trang/tài khoản thật', () => {
    expect(FacebookGroupBot.sanitizeAccountDisplayName('Tài khoản, trang cá nhân của bạn')).toBeNull();
    expect(FacebookGroupBot.sanitizeAccountDisplayName('Trang cá nhân của bạn')).toBeNull();
    expect(FacebookGroupBot.sanitizeAccountDisplayName('Your profile')).toBeNull();
    expect(FacebookGroupBot.sanitizeAccountDisplayName('Account, your profile')).toBeNull();
    expect(FacebookGroupBot.sanitizeAccountDisplayName('Menu Facebook')).toBeNull();
    expect(FacebookGroupBot.sanitizeAccountDisplayName('1000123456')).toBeNull();

    expect(FacebookGroupBot.sanitizeAccountDisplayName('Dịch vụ hỗ trợ du lịch')).toBe('Dịch vụ hỗ trợ du lịch');
    expect(FacebookGroupBot.sanitizeAccountDisplayName('Trang cá nhân của bạn: Minh Tuấn')).toBe('Minh Tuấn');
    expect(FacebookGroupBot.sanitizeAccountDisplayName('Bình luận dưới tên Dịch vụ hỗ trợ du lịch')).toBe(
      'Dịch vụ hỗ trợ du lịch',
    );
    expect(FacebookGroupBot.sanitizeAccountDisplayName('Commenting as TripC Support')).toBe('TripC Support');
  });

  it('fail-closed với FACEBOOK_GROUP_SESSION_MISSING khi .fb-session.json chỉ có cookie ẩn danh (thiếu c_user/xs) hoặc cookie đã hết hạn', async () => {
    const anonSessionFile = path.join(
      os.tmpdir(),
      `vitest-anon-fb-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
    );
    tempFiles.push(anonSessionFile);
    delete process.env.FB_ADMIN_COOKIE;
    process.env.FB_SESSION_FILE = anonSessionFile;

    fs.writeFileSync(
      anonSessionFile,
      JSON.stringify({
        cookies: [
          { name: 'datr', value: 'anon-datr', domain: '.facebook.com' },
          { name: 'sb', value: 'anon-sb', domain: '.facebook.com' },
          { name: 'fr', value: 'anon-fr', domain: '.facebook.com' },
        ],
      }),
      'utf8',
    );

    const meta = FacebookGroupBot.getSessionStatusSync(anonSessionFile);
    expect(meta.fileExists).toBe(true);
    expect(meta.hasAuthCookies).toBe(false);
    expect(meta.ready).toBe(false);
    expect(FacebookGroupBot.hasSavedSession(anonSessionFile)).toBe(false);

    const bot = new FacebookGroupBot(anonSessionFile);
    const check = await bot.checkSession();
    expect(check.isLoggedIn).toBe(false);

    await expect(
      bot.postToGroup({
        groupUrl: 'https://www.facebook.com/groups/1134282109069209',
        title: 'Test',
        body: 'Test body',
      }),
    ).rejects.toThrow('FACEBOOK_GROUP_SESSION_MISSING');
    await expect(
      bot.scanGroupComments({ groupUrl: 'https://www.facebook.com/groups/1134282109069209' }),
    ).rejects.toThrow('FACEBOOK_GROUP_SESSION_MISSING');
    await expect(
      bot.deleteGroupPost({ groupUrl: 'https://www.facebook.com/groups/1134282109069209', titleSnippet: 'Test' }),
    ).rejects.toThrow('FACEBOOK_GROUP_SESSION_MISSING');
    await expect(
      bot.replyToGroupComment({
        postUrl: 'https://www.facebook.com/groups/1134282109069209/posts/123',
        replyText: 'Trả lời test',
      }),
    ).rejects.toThrow('FACEBOOK_GROUP_SESSION_MISSING');
    await expect(
      bot.sendNativeGroupInvites({ groupUrl: 'https://www.facebook.com/groups/1134282109069209', maxInvites: 3 }),
    ).rejects.toThrow('FACEBOOK_GROUP_SESSION_MISSING');

    // Expired c_user/xs must also fail closed
    const pastExp = Math.floor(Date.now() / 1000) - 3600;
    fs.writeFileSync(
      anonSessionFile,
      JSON.stringify({
        cookies: [
          { name: 'c_user', value: '10001122334455', domain: '.facebook.com', expires: pastExp },
          { name: 'xs', value: 'expired-xs', domain: '.facebook.com', expires: pastExp },
        ],
      }),
      'utf8',
    );
    expect(FacebookGroupBot.getSessionStatusSync(anonSessionFile).hasAuthCookies).toBe(false);
    expect(FacebookGroupBot.hasSavedSession(anonSessionFile)).toBe(false);
  });

  it("finds the topic's video in this host's video folder, and only a plain .mp4 there", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'group-video-'));
    fs.writeFileSync(path.join(dir, 'apartment-checklist.mp4'), 'x');
    fs.writeFileSync(path.join(os.tmpdir(), 'outside.mp4'), 'x');

    expect(FacebookGroupBot.resolveVideoFile('apartment-checklist.mp4', dir)).toBe(path.join(dir, 'apartment-checklist.mp4'));
    expect(FacebookGroupBot.resolveVideoFile('missing.mp4', dir)).toBeNull();
    expect(FacebookGroupBot.resolveVideoFile('../outside.mp4', dir)).toBeNull();
    expect(FacebookGroupBot.resolveVideoFile('notes.txt', dir)).toBeNull();
    expect(FacebookGroupBot.resolveVideoFile('apartment-checklist.mp4', undefined)).toBeNull();
    expect(FacebookGroupBot.resolveVideoFile(undefined, dir)).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

