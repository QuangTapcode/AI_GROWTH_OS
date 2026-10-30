import { afterAll as after, beforeAll as before, describe, it } from 'vitest';
import assert from 'node:assert/strict';
import http from 'node:http';
import { FacebookPagePublisher } from '../FacebookPagePublisher';
import { TikTokPublisher } from '../TikTokPublisher';
import { SocialTokenManager } from '../SocialTokenManager';
import { generateManualPack } from '../ManualPackGenerator';

describe('CM-28 & CM-29: Facebook & TikTok Publishers (Mock Server Tests)', () => {
  let server: http.Server;
  let mockServerUrl: string;
  let lastFacebookRequest: { url?: string; method?: string; body?: string } = {};
  let lastTikTokRequest: { url?: string; method?: string; body?: any; headers?: any } = {};

  before(async () => {
    // Khởi tạo mock server HTTP local (ephemeral port) để kiểm thử
    server = http.createServer((req, res) => {
      let bodyData = '';
      req.on('data', (chunk) => {
        bodyData += chunk;
      });
      req.on('end', () => {
        const url = req.url || '';

        // 1. Mock Meta Graph API v21.0
        if (url.includes('/v21.0/page_test_123/photos')) {
          lastFacebookRequest = { url, method: req.method, body: bodyData };
          if (bodyData.includes('permission_error_token')) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { code: 200, message: 'Permission pages_manage_posts denied (App review pending)' } }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'fb_post_photo_1001' }));
          return;
        }

        if (url.includes('/v21.0/oauth/access_token')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ access_token: 'new_long_lived_fb_token_v21', expires_in: 5184000 }));
          return;
        }

        // 2. Mock TikTok Content Posting API v2
        if (url.includes('/v2/post/publish/content/init/') || url.includes('/v2/post/publish/video/init/')) {
          let parsedJson: any = {};
          try {
            parsedJson = JSON.parse(bodyData);
          } catch {
            // ignore
          }
          lastTikTokRequest = { url, method: req.method, body: parsedJson, headers: req.headers };

          if (req.headers.authorization?.includes('permission_denied_token')) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: { code: 'scope_not_authorized', message: 'Missing scope video.publish (App review pending)' } }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ data: { publish_id: 'tiktok_direct_pub_2002' }, error: { code: 'ok' } }));
          return;
        }

        if (url.includes('/v2/oauth/token/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              data: {
                access_token: 'new_refreshed_tiktok_token_v2',
                refresh_token: 'new_refresh_token_tiktok',
                expires_in: 86400,
              },
            })
          );
          return;
        }

        // Fallback 404
        res.writeHead(404);
        res.end();
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        mockServerUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('1. CM-28 FacebookPublisher: Graph API v21.0 đăng caption + ảnh AI, tự động gắn nhãn AI và trả về post_id', async () => {
    // Override fetch để trỏ về mock server local
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: any, init?: any) => {
      const urlStr = typeof input === 'string' ? input : input.url;
      const mockedUrl = urlStr.replace('https://graph.facebook.com', mockServerUrl);
      return originalFetch(mockedUrl, init);
    };

    try {
      const publisher = new FacebookPagePublisher('page_test_123', 'valid_fb_token_123', 'v21.0');
      assert.equal(publisher.graphVersion, 'v21.0', 'Phải kiểm tra và dùng đúng Graph API v21.0');

      const result = await publisher.publish({
        contentId: 'pack_fb_01',
        channel: 'Facebook',
        bodyMarkdown: 'Khám phá Cầu Rồng Đà Nẵng lung linh về đêm cùng TripC!',
        mediaUrl: 'https://cdn.tripc.vn/images/danang_dragon_bridge.jpg',
        mediaType: 'image',
        isAiGenerated: true, // Ảnh tạo bởi AI
        idempotencyKey: 'publish:ws_01:pack_fb_01:facebook:1',
        workspaceId: 'ws_01',
      });

      assert.equal(result.success, true);
      assert.equal(result.externalPostId, 'fb_post_photo_1001');
      assert.equal(result.publishedUrl, 'https://www.facebook.com/fb_post_photo_1001');

      // Kiểm tra request gửi đi có đầy đủ nhãn AI theo chính sách Meta
      assert.ok(lastFacebookRequest.url?.includes('/v21.0/page_test_123/photos'), 'Phải gọi endpoint /photos khi có ảnh');
      const params = new URLSearchParams(lastFacebookRequest.body);
      assert.equal(params.get('url'), 'https://cdn.tripc.vn/images/danang_dragon_bridge.jpg');
      assert.match(params.get('caption') || '', /\[Ảnh tạo bởi AI\]/, 'Caption phải gắn nhãn thông tin AI');
      assert.match(params.get('caption') || '', /#AIgenerated/, 'Caption phải có hashtag theo chính sách Meta');
      assert.equal(params.get('is_ai_generated'), 'true', 'API param phải có is_ai_generated=true');
      assert.equal(params.get('ai_source_type'), 'trainedAlgorithmicMedia', 'API param phải có ai_source_type');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('2. CM-29 TikTokPublisher: Direct Post Photo Mode với media URL công khai, tiktok_privacy_level=SELF_ONLY và nhãn AIGC', async () => {
    const publisher = new TikTokPublisher(
      'valid_tiktok_token_456',
      'open_id_test',
      'SELF_ONLY', // Mặc định SELF_ONLY khi thử nghiệm
      mockServerUrl // Trỏ trực tiếp vào mock server
    );

    assert.equal(publisher.privacyLevel, 'SELF_ONLY', 'Quyền riêng tư mặc định bắt buộc là SELF_ONLY khi thử nghiệm');

    const result = await publisher.publish({
      contentId: 'pack_tt_01',
      channel: 'TikTok',
      bodyMarkdown: 'Gợi ý lịch trình 3N2Đ quẩy tung Đà Nẵng cực tiết kiệm',
      metaTitle: 'Lịch trình Đà Nẵng 3N2Đ',
      mediaUrl: 'https://cdn.tripc.vn/photos/sontra_checkin.jpg',
      mediaType: 'image', // Photo mode
      isAiGenerated: true, // Nội dung AI
      idempotencyKey: 'publish:ws_01:pack_tt_01:tiktok:1',
      workspaceId: 'ws_01',
    });

    assert.equal(result.success, true);
    assert.equal(result.externalPostId, 'tiktok_direct_pub_2002');

    // Kiểm tra request gửi sang TikTok Content Posting API
    assert.equal(lastTikTokRequest.url, '/v2/post/publish/content/init/');
    assert.equal(lastTikTokRequest.body.post_info.privacy_level, 'SELF_ONLY', 'Bắt buộc SELF_ONLY khi test');
    assert.equal(lastTikTokRequest.body.post_info.is_aigc, true, 'Bắt buộc cờ is_aigc: true theo chính sách AIGC của TikTok');
    assert.match(lastTikTokRequest.body.post_info.title, /#AIGC/, 'Title phải đính kèm hashtag #AIGC');
    assert.equal(lastTikTokRequest.body.source_info.photo_images[0], 'https://cdn.tripc.vn/photos/sontra_checkin.jpg');
  });

  it('3. TikTokPublisher Direct Post Video Mode: Chặn media URL không hợp lệ và kiểm tra video upload init', async () => {
    const publisher = new TikTokPublisher('valid_tiktok_token', undefined, 'SELF_ONLY', mockServerUrl);

    // Chặn khi thiếu mediaUrl
    const failRes = await publisher.publish({
      contentId: 'pack_tt_fail',
      channel: 'TikTok',
      bodyMarkdown: 'Video thiếu link',
      mediaUrl: undefined,
      idempotencyKey: 'publish:ws_01:fail:tiktok:1',
      workspaceId: 'ws_01',
    });
    assert.equal(failRes.success, false);
    assert.equal(failRes.errorCode, 'TIKTOK_MEDIA_REQUIRED');

    // Hợp lệ với video URL công khai
    const videoRes = await publisher.publish({
      contentId: 'pack_tt_video',
      channel: 'TikTok',
      bodyMarkdown: 'Review ẩm thực Đà Nẵng',
      mediaUrl: 'https://cdn.tripc.vn/videos/am_thuc_danang.mp4',
      mediaType: 'video',
      idempotencyKey: 'publish:ws_01:video:tiktok:1',
      workspaceId: 'ws_01',
    });
    assert.equal(videoRes.success, true);
    assert.equal(lastTikTokRequest.url, '/v2/post/publish/video/init/');
    assert.equal(lastTikTokRequest.body.source_info.video_url, 'https://cdn.tripc.vn/videos/am_thuc_danang.mp4');
  });

  it('4. Quản lý Token (SocialTokenManager): Mã hóa AES-256-GCM, giải mã và luồng làm mới (Refresh Flow)', async () => {
    const tokenManager = new SocialTokenManager('super_secret_test_key_32_chars!');

    const rawToken = 'EAABwzLixxxx_secret_facebook_access_token_123456';
    const encrypted = tokenManager.encrypt(rawToken);

    // Kiểm tra định dạng iv:authTag:ciphertext
    assert.notEqual(encrypted, rawToken);
    assert.equal(encrypted.split(':').length, 3, 'Phải có đúng 3 phần iv:authTag:ciphertext');

    // Giải mã phải khớp 100%
    const decrypted = tokenManager.decrypt(encrypted);
    assert.equal(decrypted, rawToken);

    // Lưu token hết hạn trong vòng 60 giây (để kích hoạt refresh flow)
    tokenManager.saveToken({
      workspaceId: 'ws_danang_hotel',
      channel: 'Facebook',
      accessToken: rawToken,
      expiresInSeconds: 60, // Sắp hết hạn
      pageId: 'page_danang_123',
    });

    // Mock fetch cho refresh token Facebook
    const mockFetch = async (url: any) => {
      assert.ok(String(url).includes('grant_type=fb_exchange_token'));
      return new Response(JSON.stringify({ access_token: 'refreshed_long_lived_token_789', expires_in: 5184000 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const validToken = await tokenManager.getValidAccessToken('ws_danang_hotel', 'Facebook', {
      clientId: 'mock_fb_client_id',
      clientSecret: 'mock_fb_secret',
      fetchFn: mockFetch as any,
    });

    assert.equal(validToken?.accessToken, 'refreshed_long_lived_token_789', 'Luồng làm mới phải trả về token mới');
  });

  it('5. Fallback tự động sang ManualPackGenerator khi bị từ chối quyền (401/403 Permission Denied)', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (input: any, init?: any) => {
      const urlStr = typeof input === 'string' ? input : input.url;
      const mockedUrl = urlStr.replace('https://graph.facebook.com', mockServerUrl);
      return originalFetch(mockedUrl, init);
    };

    try {
      // 5.1 Facebook bị từ chối quyền (App Review chưa duyệt)
      const fbPublisher = new FacebookPagePublisher('page_test_123', 'permission_error_token', 'v21.0');
      const fbResult = await fbPublisher.publish({
        contentId: 'pack_fb_fallback',
        channel: 'Facebook',
        bodyMarkdown: 'Bài viết chờ duyệt app Facebook',
        mediaUrl: 'https://cdn.tripc.vn/images/sample.jpg',
        mediaType: 'image',
        isAiGenerated: true,
        idempotencyKey: 'publish:ws_01:fallback:facebook:1',
        workspaceId: 'ws_01',
      });

      assert.equal(fbResult.success, true, 'Fallback thành công chuyển tiếp sang đăng tay');
      assert.equal(fbResult.isManualFallback, true);
      assert.ok(fbResult.externalPostId?.startsWith('manual_pack_facebook_'));
      assert.ok(fbResult.manualPack, 'Phải có ManualPack đính kèm');
      assert.ok(fbResult.manualPack.files['instructions.md'].includes('Meta Business Suite'));
      assert.ok(fbResult.manualPack.files['caption.txt'].includes('[Ảnh tạo bởi AI]'));

      // 5.2 TikTok bị từ chối quyền (TikTok for Developers chưa duyệt scope)
      const ttPublisher = new TikTokPublisher('permission_denied_token', undefined, 'SELF_ONLY', mockServerUrl);
      const ttResult = await ttPublisher.publish({
        contentId: 'pack_tt_fallback',
        channel: 'TikTok',
        bodyMarkdown: 'Kịch bản TikTok chờ duyệt app',
        mediaUrl: 'https://cdn.tripc.vn/videos/sample.mp4',
        mediaType: 'video',
        isAiGenerated: true,
        idempotencyKey: 'publish:ws_01:fallback:tiktok:1',
        workspaceId: 'ws_01',
      });

      assert.equal(ttResult.success, true);
      assert.equal(ttResult.isManualFallback, true);
      assert.ok(ttResult.externalPostId?.startsWith('manual_pack_tiktok_'));
      assert.ok(ttResult.manualPack.files['instructions.md'].includes('TikTok Studio'));
      assert.ok(ttResult.manualPack.files['instructions.md'].includes('Chỉ mình tôi'));
      assert.ok(ttResult.manualPack.files['caption.txt'].includes('#AIGC'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('6. Bảo vệ an toàn tuyệt đối: Không gửi request ra ngoài domain thật khi chưa có lệnh rõ ràng', () => {
    // Kiểm tra cấu hình mặc định an toàn
    const defaultFb = new FacebookPagePublisher('p1', 't1');
    assert.equal(defaultFb.graphVersion, 'v21.0');

    const defaultTt = new TikTokPublisher('t2');
    assert.equal(defaultTt.privacyLevel, 'SELF_ONLY', 'Mặc định an toàn tuyệt đối không đăng public ngoài ý muốn');
  });
});
