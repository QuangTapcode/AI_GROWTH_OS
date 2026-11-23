import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { readVideoManifest, signedVideoPath, verifyVideoRequest, parseRange } from '../../src/modules/community/videos';

const WS = '10000000-0000-4000-8000-000000000001';
const SRC = '0e3d4509-f8aa-4492-900c-e52c121395e6';
const HOUR = 3600_000;

function dirWith(manifest: unknown) {
  const dir = mkdtempSync(path.join(tmpdir(), 'videos-'));
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(path.join(dir, 'esim.mp4'), 'x');
  return dir;
}

describe('community videos', () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = 'a'.repeat(40);
  });

  it('reads the videos a workspace has, keyed by topic, and ignores entries that point outside the folder', () => {
    const dir = dirWith({ videos: [
      { workspace_id: WS, source_id: SRC, file: 'esim.mp4', title: 'eSIM', duration_s: 48.2, created_at: '2026-11-10T08:00:00Z', status: 'draft' },
      { workspace_id: WS, source_id: 'other', file: '../secret.mp4', title: 'x', duration_s: 1, created_at: '', status: 'draft' },
      { workspace_id: WS, source_id: 'missing', file: 'gone.mp4', title: 'x', duration_s: 1, created_at: '', status: 'draft' },
      { workspace_id: 'someone-else', source_id: SRC, file: 'esim.mp4', title: 'x', duration_s: 1, created_at: '', status: 'draft' },
    ] });
    const videos = readVideoManifest(dir, WS);
    expect([...videos.keys()]).toEqual([SRC]);
    expect(videos.get(SRC)).toMatchObject({ file: 'esim.mp4', duration_s: 48.2, status: 'draft' });
  });

  it('has no videos when the folder or manifest is missing or broken', () => {
    expect(readVideoManifest(null, WS).size).toBe(0);
    expect(readVideoManifest(path.join(tmpdir(), 'no-such-dir-xyz'), WS).size).toBe(0);
    const dir = mkdtempSync(path.join(tmpdir(), 'videos-'));
    writeFileSync(path.join(dir, 'manifest.json'), '{not json');
    expect(readVideoManifest(dir, WS).size).toBe(0);
  });

  it('signs a link that only opens that video, and only until it expires', () => {
    const now = Date.UTC(2026, 10, 10, 6, 0, 0);
    const link = new URL(signedVideoPath(WS, SRC, now), 'http://api');
    const exp = link.searchParams.get('exp')!, sig = link.searchParams.get('sig')!;
    expect(link.pathname).toBe(`/community-videos/${WS}/${SRC}`);
    expect(verifyVideoRequest(WS, SRC, exp, sig, now)).toBe(true);
    expect(verifyVideoRequest(WS, 'another-topic', exp, sig, now)).toBe(false);
    expect(verifyVideoRequest(WS, SRC, String(Number(exp) + 3600), sig, now)).toBe(false);
    expect(verifyVideoRequest(WS, SRC, exp, sig, Number(exp) * 1000 + 1)).toBe(false);
  });

  it('keeps the same link for hours, so the page refreshing every few seconds does not restart a playing video', () => {
    const now = Date.UTC(2026, 10, 10, 6, 0, 0);
    expect(signedVideoPath(WS, SRC, now + 2 * HOUR)).toBe(signedVideoPath(WS, SRC, now));
  });

  it('reads the byte range a video player asks for', () => {
    expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 });
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange('bytes=2000-', 1000)).toBe('unsatisfiable');
  });
});

import { reelRequest } from '../../src/modules/community/videos';

describe('reelRequest', () => {
  const job = { id: 'job-1', workspace_id: WS, content_title: 'eSIM at the airport',
    hook: 'Need internet in Vietnam?', source_id: SRC };
  it("queues the Reel for a post that is already out, opening with the post's hook", () => {
    const r = reelRequest(job, 0, Date.UTC(2026, 10, 10));
    expect(r.dedup_key).toBe('reel:job-1');
    expect(r.payload).toMatchObject({ job_id: 'job-1', workspace_id: WS, source_id: SRC, enqueued_at: '2026-11-10T00:00:00.000Z' });
    expect(r.payload.description.startsWith('Need internet in Vietnam?\n\n')).toBe(true);
  });
  it('gives a retry its own key, so a failed Reel can be tried again but a click twice never queues two', () => {
    expect(reelRequest(job, 1, 0).dedup_key).toBe('reel:job-1:retry-1');
    expect(reelRequest({ ...job, hook: null }, 0, 0).payload.description.startsWith('eSIM at the airport')).toBe(true);
  });
});
