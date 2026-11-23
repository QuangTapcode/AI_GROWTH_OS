import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReelOutboxRunner, reelDescription, type ReelEvent, type ReelRecord, type ReelStore } from '../ReelOutboxRunner';
import type { ReelResult } from '../FacebookReelPublisher';

const WS = 'ws-1', SRC = 'src-esim', HOUR = 3600_000;
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);

function folder(withVideo: boolean) {
  const dir = mkdtempSync(path.join(tmpdir(), 'reels-'));
  if (withVideo) {
    writeFileSync(path.join(dir, 'esim.mp4'), Buffer.alloc(10));
    writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ videos: [{ workspace_id: WS, source_id: SRC, file: 'esim.mp4' }] }));
  }
  return dir;
}

class MemoryStore implements ReelStore {
  events: (ReelEvent & { status: string; not_before?: number })[] = [];
  records = new Map<string, ReelRecord>();
  add(e: Partial<ReelEvent> = {}) {
    this.events.push({ id: `e${this.events.length + 1}`, job_id: 'job-1', workspace_id: WS, source_id: SRC,
      description: 'eSIM in Vietnam', enqueued_at: new Date(NOW - HOUR).toISOString(), retry_count: 0, status: 'pending', ...e });
  }
  async claim(now: number) {
    const e = this.events.find((x) => x.status === 'pending' && (x.not_before ?? 0) <= now);
    if (!e) return null;
    e.status = 'processing';
    e.retry_count += 1;
    return e;
  }
  async existing(jobId: string) { return this.records.get(jobId) ?? null; }
  async record(r: ReelRecord) { this.records.set(r.publishing_job_id, r); }
  async complete(id: string) { this.find(id).status = 'published'; }
  async fail(id: string) { this.find(id).status = 'failed'; }
  async defer(id: string, until: number) { const e = this.find(id); e.status = 'pending'; e.not_before = until; }
  private find(id: string) { return this.events.find((x) => x.id === id)!; }
}

const publisher = (result: ReelResult) => {
  const calls: { filePath: string; description: string }[] = [];
  return { calls, publishReel: async (input: { filePath: string; description: string }) => { calls.push(input); return result; } };
};
const ok: ReelResult = { success: true, videoId: 'vid_1', postUrl: 'https://www.facebook.com/reel/vid_1' };

describe('ReelOutboxRunner', () => {
  it("posts the topic's video as a Reel after its photo post, and records the Reel", async () => {
    const store = new MemoryStore(); store.add();
    const fb = publisher(ok);
    const runner = new ReelOutboxRunner(store, { videoDir: () => folder(true), publisher: () => fb, now: () => NOW });
    expect(await runner.runOnce()).toBe('published');
    expect(fb.calls[0].filePath.endsWith('esim.mp4')).toBe(true);
    expect(store.records.get('job-1')).toMatchObject({ status: 'published', facebook_video_id: 'vid_1', post_url: 'https://www.facebook.com/reel/vid_1' });
    expect(store.events[0].status).toBe('published');
  });

  it('waits for a video that is still being made, and checks again later', async () => {
    const store = new MemoryStore(); store.add();
    const fb = publisher(ok);
    const runner = new ReelOutboxRunner(store, { videoDir: () => folder(false), publisher: () => fb, now: () => NOW });
    expect(await runner.runOnce()).toBe('deferred');
    expect(fb.calls).toHaveLength(0);
    expect(store.events[0]).toMatchObject({ status: 'pending', not_before: NOW + 15 * 60_000 });
    expect(await runner.runOnce()).toBe('idle');
  });

  it('gives up on a post whose video never came, a day after the post went out', async () => {
    const store = new MemoryStore(); store.add({ enqueued_at: new Date(NOW - 25 * HOUR).toISOString() });
    const runner = new ReelOutboxRunner(store, { videoDir: () => folder(false), publisher: () => publisher(ok), now: () => NOW });
    expect(await runner.runOnce()).toBe('skipped');
    expect(store.records.get('job-1')).toMatchObject({ status: 'no_video' });
    expect(store.events[0].status).toBe('published');
  });

  it('never posts the same Reel twice', async () => {
    const store = new MemoryStore(); store.add();
    store.records.set('job-1', { publishing_job_id: 'job-1', workspace_id: WS, source_id: SRC, status: 'published', video_file: 'esim.mp4', facebook_video_id: 'vid_0', post_url: 'u', error: null });
    const fb = publisher(ok);
    const runner = new ReelOutboxRunner(store, { videoDir: () => folder(true), publisher: () => fb, now: () => NOW });
    expect(await runner.runOnce()).toBe('published');
    expect(fb.calls).toHaveLength(0);
  });

  it('retries a temporary failure with growing delays, and stops on a missing permission', async () => {
    const store = new MemoryStore(); store.add();
    const flaky = publisher({ success: false, permanent: false, errorCode: 'FACEBOOK_REEL_UPLOAD_FAILED', errorMessage: 'interrupted' });
    const runner = new ReelOutboxRunner(store, { videoDir: () => folder(true), publisher: () => flaky, now: () => NOW });
    expect(await runner.runOnce()).toBe('deferred');
    expect(store.events[0].not_before).toBe(NOW + 2 * 60_000);

    const denied = new MemoryStore(); denied.add();
    const runner2 = new ReelOutboxRunner(denied, { videoDir: () => folder(true), now: () => NOW,
      publisher: () => publisher({ success: false, permanent: true, errorCode: 'FACEBOOK_REEL_PERMISSION_DENIED', errorMessage: 'Requires pages_manage_posts' }) });
    expect(await runner2.runOnce()).toBe('failed');
    expect(denied.records.get('job-1')).toMatchObject({ status: 'failed', error: 'FACEBOOK_REEL_PERMISSION_DENIED: Requires pages_manage_posts' });
  });

  it('fails clearly when the worker has no Facebook Page token', async () => {
    const store = new MemoryStore(); store.add();
    const runner = new ReelOutboxRunner(store, { videoDir: () => folder(true), publisher: () => null, now: () => NOW });
    expect(await runner.runOnce()).toBe('failed');
    expect(store.records.get('job-1')?.error).toContain('FACEBOOK_PAGE_PERMISSION_MISSING');
  });
});

describe('reelDescription', () => {
  it("opens with the post's hook and points to the full post", () => {
    expect(reelDescription('Need internet in Vietnam without a local SIM?', 'eSIM Sim Card at Airport')).toBe(
      'Need internet in Vietnam without a local SIM?\n\nThe full checklist is in our latest post on this Page. Follow TripC for more Vietnam tips.\n\n#TripC #VietnamTips');
    expect(reelDescription(null, 'eSIM Sim Card at Airport')).toMatch(/^eSIM Sim Card at Airport\n/);
  });
});
