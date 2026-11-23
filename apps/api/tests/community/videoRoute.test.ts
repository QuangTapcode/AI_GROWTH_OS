import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { signedVideoPath } from '../../src/modules/community/videos';

const WS = '10000000-0000-4000-8000-000000000001';
const SRC = '0e3d4509-f8aa-4492-900c-e52c121395e6';
const params = { params: { workspace_id: WS, source_id: SRC } };

describe('GET /v1/community-videos/:workspace/:topic', () => {
  beforeAll(() => {
    const dir = mkdtempSync(path.join(tmpdir(), 'videos-'));
    writeFileSync(path.join(dir, 'esim.mp4'), Buffer.alloc(1000, 7));
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ videos: [
      { workspace_id: WS, source_id: SRC, file: 'esim.mp4', title: 'eSIM', duration_s: 48, created_at: '2026-11-10T08:00:00Z', status: 'draft' },
    ] }));
    Object.assign(process.env, { COMMUNITY_VIDEO_DIR: dir, AUTH_SECRET: 'b'.repeat(40) });
  });
  const request = (pathAndQuery: string, headers: Record<string, string> = {}) =>
    new Request(`http://api/v1${pathAndQuery}`, { headers }) as never;

  it('streams the part of the video a player asks for, on a signed link', async () => {
    const { GET } = await import('../../src/app/v1/community-videos/[workspace_id]/[source_id]/route');
    const res = await GET(request(signedVideoPath(WS, SRC), { range: 'bytes=100-199' }), params);
    expect(res.status).toBe(206);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(res.headers.get('content-range')).toBe('bytes 100-199/1000');
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  it('offers the file as a download when asked, for posting it by hand', async () => {
    const { GET } = await import('../../src/app/v1/community-videos/[workspace_id]/[source_id]/route');
    const res = await GET(request(`${signedVideoPath(WS, SRC)}&download=1`), params);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });

  it('refuses a link without a valid signature, and a topic that has no video', async () => {
    const { GET } = await import('../../src/app/v1/community-videos/[workspace_id]/[source_id]/route');
    expect((await GET(request(`/community-videos/${WS}/${SRC}`), params)).status).toBe(403);
    const other = { params: { workspace_id: WS, source_id: 'no-video' } };
    expect((await GET(request(signedVideoPath(WS, 'no-video')), other)).status).toBe(404);
  });
});
