import { afterEach, describe, expect, it, vi } from 'vitest';
import { FacebookGroupPublisher } from '../FacebookGroupPublisher';
import type { CmsPublishRequest } from '../CmsPublisher';

const baseRequest: CmsPublishRequest = {
  contentId: 'grp_cnt_001',
  channel: 'FacebookGroup',
  bodyMarkdown: 'Kinh nghiệm tìm phòng trọ tại Đà Nẵng: chọn khu vực nào an ninh, tiện đi lại?\n\nAnh em vào chia sẻ nhé!',
  metaTitle: 'Kinh nghiệm thuê trọ Đà Nẵng',
  idempotencyKey: 'publish:ws_01:grp_cnt_001:facebook_group:1',
  workspaceId: 'ws_01',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FacebookGroupPublisher (CM-28 & CM-29)', () => {
  it('1. Chuẩn hóa phiên bản Graph API tối thiểu v21.0', () => {
    expect(FacebookGroupPublisher.validateAndNormalizeVersion('v21.0')).toBe('v21.0');
    expect(FacebookGroupPublisher.validateAndNormalizeVersion('v20.0')).toBe('v21.0');
    expect(FacebookGroupPublisher.validateAndNormalizeVersion('v19.0')).toBe('v21.0');
    expect(FacebookGroupPublisher.validateAndNormalizeVersion('v22.0')).toBe('v22.0');
    expect(FacebookGroupPublisher.validateAndNormalizeVersion('invalid')).toBe('v21.0');

    const publisher = new FacebookGroupPublisher('group_123', 'token_abc', 'v18.0');
    expect(publisher.graphVersion).toBe('v21.0');
    expect(publisher.channel).toBe('FacebookGroup');
  });

  it('2. Chặn đăng bài khi không có nội dung text lẫn ảnh', async () => {
    const publisher = new FacebookGroupPublisher('group_123', 'token_abc');
    const result = await publisher.publish({
      ...baseRequest,
      bodyMarkdown: '',
      mediaUrl: undefined,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('GROUP_EMPTY_MESSAGE');
  });

  it('3. Đăng bài thuần text vào endpoint /feed của Group', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'group_post_101' }), { status: 200 })
    );

    const publisher = new FacebookGroupPublisher('group_123', 'valid_token');
    const result = await publisher.publish(baseRequest);

    expect(result.success).toBe(true);
    expect(result.externalPostId).toBe('group_post_101');
    expect(result.publishedUrl).toBe('https://www.facebook.com/groups/group_123/posts/group_post_101');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callUrl = String(fetchSpy.mock.calls[0][0]);
    expect(callUrl).toContain('/v21.0/group_123/feed');

    const body = fetchSpy.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get('access_token')).toBe('valid_token');
    expect(body.get('message')).toContain('Kinh nghiệm tìm phòng trọ tại Đà Nẵng');
  });

  it('4. Đăng bài kèm ảnh AI vào endpoint /photos với nhãn minh bạch theo chính sách Meta', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'photo_202', post_id: 'group_post_202' }), { status: 200 })
    );

    const publisher = new FacebookGroupPublisher('group_123', 'valid_token');
    const result = await publisher.publish({
      ...baseRequest,
      mediaUrl: 'https://cdn.tripc.vn/images/danang_apartment.jpg',
      mediaType: 'image',
      isAiGenerated: true,
    });

    expect(result.success).toBe(true);
    expect(result.externalPostId).toBe('photo_202');

    const callUrl = String(fetchSpy.mock.calls[0][0]);
    expect(callUrl).toContain('/v21.0/group_123/photos');

    const body = fetchSpy.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get('url')).toBe('https://cdn.tripc.vn/images/danang_apartment.jpg');
    expect(body.get('is_ai_generated')).toBe('true');
    expect(body.get('ai_source_type')).toBe('trainedAlgorithmicMedia');
    expect(body.get('caption')).toContain('[Ảnh tạo bởi AI]');
    expect(body.get('caption')).toContain('#AIgenerated #ImaginedWithAI');
  });

  it('5. Fallback tự động sang ManualPack khi Graph API trả lỗi 403 (chưa duyệt quyền App)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 200, message: 'Permissions error: publish to group requires review' } }),
        { status: 403 }
      )
    );

    const publisher = new FacebookGroupPublisher('group_123', 'restricted_token');
    const result = await publisher.publish({
      ...baseRequest,
      mediaUrl: 'https://cdn.tripc.vn/images/danang_apartment.jpg',
      isAiGenerated: true,
    });

    expect(result.success).toBe(true);
    expect(result.isManualFallback).toBe(true);
    expect(result.externalPostId).toBe('manual_group_grp_cnt_001');
    expect(result.publishedUrl).toBe('https://www.facebook.com/groups/group_123');
    expect(result.manualPack).toBeDefined();
    expect(result.manualPack?.channel).toBe('FacebookGroup');
    expect(result.manualPack?.files['instructions.md']).toContain('Facebook Group');
    expect(result.manualPack?.files['caption.txt']).toContain('[Ảnh tạo bởi AI]');
  });

  it('6. Fallback tự động sang ManualPack khi kết nối fetch bị lỗi mạng', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network connection timeout'));

    const publisher = new FacebookGroupPublisher('group_123', 'token_abc');
    const result = await publisher.publish(baseRequest);

    expect(result.success).toBe(true);
    expect(result.isManualFallback).toBe(true);
    expect(result.externalPostId).toBe('manual_group_grp_cnt_001');
    expect(result.manualPack).toBeDefined();
  });

  it('7. Đối soát (reconcile) cho cả bài đăng Graph API và gói đăng tay ManualPack', async () => {
    const publisher = new FacebookGroupPublisher('group_123', 'valid_token');

    // 7.1 Reconcile cho bài đăng thủ công manual_group_
    const manualResult = await publisher.reconcile('manual_group_grp_cnt_001');
    expect(manualResult.success).toBe(true);
    expect(manualResult.reconciled).toBe(true);
    expect(manualResult.publishedUrl).toBe('https://www.facebook.com/groups/group_123');

    // 7.2 Reconcile thành công qua Graph API
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'group_post_303', permalink_url: 'https://www.facebook.com/groups/group_123/posts/group_post_303' }), { status: 200 })
    );
    const apiResult = await publisher.reconcile('group_post_303');
    expect(apiResult.success).toBe(true);
    expect(apiResult.reconciled).toBe(true);
    expect(apiResult.externalPostId).toBe('group_post_303');
    expect(apiResult.publishedUrl).toBe('https://www.facebook.com/groups/group_123/posts/group_post_303');

    // 7.3 Reconcile thất bại khi Graph API trả lỗi
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Post not found' } }), { status: 404 })
    );
    const failResult = await publisher.reconcile('unknown_post');
    expect(failResult.success).toBe(false);
    expect(failResult.errorCode).toBe('FACEBOOK_GROUP_RECONCILE_FAILED');
  });
});

