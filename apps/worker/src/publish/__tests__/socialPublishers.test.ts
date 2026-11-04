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

  const facebook = { ...request, channel: 'Facebook' as const, bodyMarkdown: 'Street food by the river' };
  const sent = (spy: { mock: { calls: unknown[][] } }, call = 0) => spy.mock.calls[call][1] as { body: URLSearchParams };
  const graph = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  it.each(['http://localhost:3001/posts/a?utm_source=facebook', 'http://127.0.0.1:3001/posts/a', 'http://192.168.1.5/posts/a'])(
    'a local address %s never goes out in a public post', async (linkUrl) => {
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(graph({ id: 'post-1' }));
      await new FacebookPagePublisher('page_123', 'secret-token').publish({ ...facebook, linkUrl });
      const { body } = sent(spy);
      expect(body.get('link')).toBeNull();
      expect(body.get('message')).toBe('Street food by the river');
    });

  it('a post with an image carries its link in the caption, because the photo endpoint has no link field', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(graph({ id: 'photo-1', post_id: 'post-1' }));
    await new FacebookPagePublisher('page_123', 'secret-token').publish({
      ...facebook, linkUrl: 'https://guide.tripc.vn/posts/a', mediaUrl: 'https://cdn.tripc.vn/a.jpg', mediaType: 'image',
    });
    expect(String(spy.mock.calls[0][0])).toContain('/photos');
    expect(sent(spy).body.get('caption')).toBe('Street food by the river\n\nhttps://guide.tripc.vn/posts/a');
  });

  it.each([[324], [100]])('an image Facebook cannot read (error %s) still posts the text, without the AI image label', async (code) => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(graph({ error: { code, message: 'Missing or invalid image file' } }, 400))
      .mockResolvedValueOnce(graph({ id: 'post-2' }));
    const result = await new FacebookPagePublisher('page_123', 'secret-token').publish({
      ...facebook, linkUrl: 'https://guide.tripc.vn/posts/a', mediaUrl: 'https://cdn.tripc.vn/a.png', mediaType: 'image', isAiGenerated: true,
    });
    expect(String(spy.mock.calls[1][0])).toContain('/feed');
    expect(sent(spy, 1).body.get('message')).toBe('Street food by the river');
    expect(sent(spy, 1).body.get('link')).toBe('https://guide.tripc.vn/posts/a');
    expect(result).toMatchObject({ success: true, externalPostId: 'post-2' });
  });

  it.each([[{ error: { code: 2, message: 'Service temporarily unavailable' } }, 500], [{ error: { code: 4, message: 'Too many calls' } }, 400]])(
    'a failure that may be temporary (%j) is not retried as a second post', async (body, status) => {
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(graph(body, status));
      const result = await new FacebookPagePublisher('page_123', 'secret-token').publish({
        ...facebook, mediaUrl: 'https://cdn.tripc.vn/a.jpg', mediaType: 'image',
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
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
