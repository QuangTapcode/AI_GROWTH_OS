import { afterEach, describe, expect, it, vi } from 'vitest';
import { FacebookPagePublisher } from '../FacebookPagePublisher';
import { TikTokPublisher } from '../TikTokPublisher';

const request = {
  contentId: 'content-1',
  channel: 'TikTok' as const,
  bodyMarkdown: '# Da Nang guide',
  metaTitle: 'Da Nang guide',
  idempotencyKey: 'publish:ws:content:TikTok:1',
  workspaceId: 'ws-1',
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TIKTOK_API_BASE_URL;
});

describe('social provider adapters', () => {
  it('fails closed for TikTok when approved media is missing', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await new TikTokPublisher('token').publish(request);
    expect(result).toMatchObject({ success: false, errorCode: 'TIKTOK_MEDIA_REQUIRED' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('publishes Facebook Page text/link and returns provider id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'page_123_post_456' }), { status: 200 }));
    const result = await new FacebookPagePublisher('page_123', 'secret-token').publish({
      ...request,
      channel: 'Facebook',
      linkUrl: 'https://tripc.vn/guide',
    });
    expect(result.success).toBe(true);
    expect(result.externalPostId).toBe('page_123_post_456');
  });

  it('keeps Facebook paragraph breaks and hashtags while stripping markdown', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'page_123_post_789' }), { status: 200 }));
    await new FacebookPagePublisher('page_123', 'secret-token').publish({
      ...request,
      channel: 'Facebook',
      bodyMarkdown: '## Choosing a **living area**?\n\n\n• Quiet streets  near the beach\n\nRequest the guide\n\n#TripC #Da_Nang',
    });
    const body = fetchSpy.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get('message')).toBe('Choosing a living area?\n\n• Quiet streets near the beach\n\nRequest the guide\n\n#TripC #Da_Nang');
  });

  it('initializes a TikTok Direct Post only after media is supplied', async () => {
    process.env.TIKTOK_API_BASE_URL = 'https://tiktok.test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 'ok' }, data: { publish_id: 'pub_123' } }), { status: 200 }));
    const result = await new TikTokPublisher('secret-token', 'open_123').publish({
      ...request,
      mediaType: 'video',
      mediaUrl: 'https://cdn.tripc.vn/video.mp4',
    });
    expect(result).toMatchObject({ success: true, externalPostId: 'pub_123' });
    expect(fetchSpy).toHaveBeenCalledWith('https://tiktok.test/v2/post/publish/video/init/', expect.objectContaining({ method: 'POST' }));
  });
});
