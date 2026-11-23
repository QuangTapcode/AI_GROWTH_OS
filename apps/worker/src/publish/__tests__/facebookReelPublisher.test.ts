import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FacebookReelPublisher } from '../FacebookReelPublisher';

const video = () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'reel-')), 'esim.mp4');
  writeFileSync(file, Buffer.alloc(2048, 1));
  return file;
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.restoreAllMocks());

describe('FacebookReelPublisher', () => {
  it('starts an upload, sends the file, then publishes the Reel with its description', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ video_id: 'vid_1', upload_url: 'https://rupload.facebook.com/video-upload/v21.0/vid_1' }))
      .mockResolvedValueOnce(json({ success: true }))
      .mockResolvedValueOnce(json({ success: true, post_id: 'post_9' }));

    const result = await new FacebookReelPublisher('page_123', 'page-token').publishReel({ filePath: video(), description: 'eSIM in Vietnam' });

    expect(result).toEqual({ success: true, videoId: 'vid_1', postUrl: 'https://www.facebook.com/reel/vid_1' });
    const [start, upload, finish] = fetchSpy.mock.calls;
    expect(String(start[0])).toBe('https://graph.facebook.com/v21.0/page_123/video_reels');
    expect(String((start[1] as RequestInit).body)).toContain('upload_phase=start');
    expect(String(upload[0])).toBe('https://rupload.facebook.com/video-upload/v21.0/vid_1');
    const headers = new Headers((upload[1] as RequestInit).headers);
    expect(headers.get('authorization')).toBe('OAuth page-token');
    expect(headers.get('offset')).toBe('0');
    expect(headers.get('file_size')).toBe('2048');
    const done = new URLSearchParams(String((finish[1] as RequestInit).body));
    expect(Object.fromEntries(done)).toMatchObject({ upload_phase: 'finish', video_id: 'vid_1', video_state: 'PUBLISHED', description: 'eSIM in Vietnam' });
  });

  it('reports a missing permission as permanent, so the worker does not keep retrying', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ error: { code: 200, message: 'Requires pages_manage_posts' } }, 403));
    const result = await new FacebookReelPublisher('page_123', 'page-token').publishReel({ filePath: video(), description: 'x' });
    expect(result).toMatchObject({ success: false, permanent: true, errorCode: 'FACEBOOK_REEL_PERMISSION_DENIED' });
  });

  it('reports a failed upload as temporary, and never calls finish for it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ video_id: 'vid_2', upload_url: 'https://rupload.facebook.com/video-upload/v21.0/vid_2' }))
      .mockResolvedValueOnce(json({ debug_info: { message: 'upload interrupted' } }, 500));
    const result = await new FacebookReelPublisher('page_123', 'page-token').publishReel({ filePath: video(), description: 'x' });
    expect(result).toMatchObject({ success: false, permanent: false, errorCode: 'FACEBOOK_REEL_UPLOAD_FAILED' });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
