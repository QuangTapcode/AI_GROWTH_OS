import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Pool } from 'pg';
import { FacebookReelPublisher, type ReelResult } from './FacebookReelPublisher';

/**
 * After a Community post goes out on the Facebook Page, its topic's explainer video goes out as a separate Reel.
 *
 * PublishingOutboxRunner queues a `publishing.reel` event when a Facebook photo post is published. This runner
 * finds the topic's video in COMMUNITY_VIDEO_DIR/manifest.json (written by Video3D/tripc-playbook), waits while the
 * video is still being rendered (up to a day), uploads it as a Reel, and records the outcome in community_video_posts.
 * The photo post never depends on the Reel: a failed Reel is recorded, not retried into a duplicate post.
 */
export type ReelEvent = {
  id: string;
  job_id: string;
  workspace_id: string;
  source_id: string;
  description: string;
  enqueued_at: string;
  retry_count: number;
};
export type ReelRecord = {
  publishing_job_id: string;
  workspace_id: string;
  source_id: string;
  status: 'published' | 'failed' | 'no_video';
  video_file: string | null;
  facebook_video_id: string | null;
  post_url: string | null;
  error: string | null;
};
export interface ReelStore {
  claim(now: number): Promise<ReelEvent | null>;
  existing(jobId: string): Promise<ReelRecord | null>;
  record(record: ReelRecord): Promise<void>;
  complete(eventId: string): Promise<void>;
  fail(eventId: string): Promise<void>;
  defer(eventId: string, until: number): Promise<void>;
}
type Publisher = Pick<FacebookReelPublisher, 'publishReel'>;
export type ReelDeps = { videoDir: () => string | null; publisher: () => Publisher | null; now?: () => number };

const WAIT_FOR_VIDEO_MS = 15 * 60_000;
const GIVE_UP_AFTER_MS = 24 * 3600_000;
const MAX_RETRIES = 5;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.mp4$/;

export function reelDescription(hook: string | null | undefined, title: string): string {
  const opening = hook?.trim() || title.trim();
  return `${opening}\n\nThe full checklist is in our latest post on this Page. Follow TripC for more Vietnam tips.\n\n#TripC #VietnamTips`;
}

/** The topic's MP4, if the renderer has listed one. Same rules as the API's reader: plain names inside the folder only. */
export function findTopicVideo(dir: string | null, workspaceId: string, sourceId: string): string | null {
  if (!dir) return null;
  try {
    const videos = (JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as { videos?: unknown }).videos;
    if (!Array.isArray(videos)) return null;
    const hit = videos.find((v: any) => v?.workspace_id === workspaceId && v?.source_id === sourceId && typeof v?.file === 'string' && SAFE_FILE.test(v.file));
    const file = hit ? path.join(dir, (hit as { file: string }).file) : null;
    return file && existsSync(file) ? file : null;
  } catch {
    return null;
  }
}

export class ReelOutboxRunner {
  constructor(private readonly store: ReelStore, private readonly deps: ReelDeps) {}

  async runOnce(): Promise<'idle' | 'published' | 'deferred' | 'skipped' | 'failed'> {
    const now = this.deps.now?.() ?? Date.now();
    const event = await this.store.claim(now);
    if (!event) return 'idle';
    const base = { publishing_job_id: event.job_id, workspace_id: event.workspace_id, source_id: event.source_id };

    const done = await this.store.existing(event.job_id);
    if (done && done.status === 'published') {
      await this.store.complete(event.id);
      return 'published';
    }

    const file = findTopicVideo(this.deps.videoDir(), event.workspace_id, event.source_id);
    if (!file) {
      if (now - Date.parse(event.enqueued_at) >= GIVE_UP_AFTER_MS) {
        await this.store.record({ ...base, status: 'no_video', video_file: null, facebook_video_id: null, post_url: null, error: null });
        await this.store.complete(event.id);
        return 'skipped';
      }
      await this.store.defer(event.id, now + WAIT_FOR_VIDEO_MS);
      return 'deferred';
    }

    const publisher = this.deps.publisher();
    if (!publisher) {
      await this.store.record({ ...base, status: 'failed', video_file: path.basename(file), facebook_video_id: null, post_url: null,
        error: 'FACEBOOK_PAGE_PERMISSION_MISSING: the worker has no FACEBOOK_PAGE_ID / FACEBOOK_PAGE_ACCESS_TOKEN' });
      await this.store.fail(event.id);
      return 'failed';
    }

    const result: ReelResult = await publisher.publishReel({ filePath: file, description: event.description });
    if (result.success) {
      await this.store.record({ ...base, status: 'published', video_file: path.basename(file), facebook_video_id: result.videoId, post_url: result.postUrl, error: null });
      await this.store.complete(event.id);
      return 'published';
    }
    if (!result.permanent && event.retry_count < MAX_RETRIES) {
      await this.store.defer(event.id, now + 2 ** event.retry_count * 60_000);
      return 'deferred';
    }
    await this.store.record({ ...base, status: 'failed', video_file: path.basename(file), facebook_video_id: null, post_url: null,
      error: `${result.errorCode}: ${result.errorMessage}` });
    await this.store.fail(event.id);
    return 'failed';
  }
}

export const REEL_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS community_video_posts (
    publishing_job_id uuid PRIMARY KEY,
    workspace_id uuid NOT NULL,
    source_id text NOT NULL,
    status text NOT NULL,
    video_file text,
    facebook_video_id text,
    post_url text,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;

export class PgReelStore implements ReelStore {
  private ready: Promise<unknown> | null = null;
  constructor(private readonly pool: Pool) {}
  private ensure() { return (this.ready ??= this.pool.query(REEL_TABLE_SQL)); }

  async claim(now: number) {
    await this.ensure();
    const row = (await this.pool.query<{ id: string; payload: any; retry_count: number }>(`
      WITH c AS (
        SELECT id FROM outbox_events
         WHERE event_type = 'publishing.reel' AND status = 'pending'
           AND COALESCE((payload->>'not_before')::timestamptz, '-infinity'::timestamptz) <= $1
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE outbox_events o SET status = 'processing', retry_count = retry_count + 1
        FROM c WHERE o.id = c.id
      RETURNING o.id, o.payload, o.retry_count`, [new Date(now)])).rows[0];
    if (!row) return null;
    const p = row.payload ?? {};
    return { id: row.id, job_id: String(p.job_id), workspace_id: String(p.workspace_id), source_id: String(p.source_id),
      description: String(p.description ?? ''), enqueued_at: String(p.enqueued_at ?? new Date(now).toISOString()), retry_count: row.retry_count };
  }
  async existing(jobId: string) {
    await this.ensure();
    return (await this.pool.query<ReelRecord>('SELECT * FROM community_video_posts WHERE publishing_job_id = $1', [jobId])).rows[0] ?? null;
  }
  async record(r: ReelRecord) {
    await this.pool.query(`
      INSERT INTO community_video_posts (publishing_job_id, workspace_id, source_id, status, video_file, facebook_video_id, post_url, error)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (publishing_job_id) DO UPDATE SET status = EXCLUDED.status, video_file = EXCLUDED.video_file,
        facebook_video_id = EXCLUDED.facebook_video_id, post_url = EXCLUDED.post_url, error = EXCLUDED.error, updated_at = now()`,
      [r.publishing_job_id, r.workspace_id, r.source_id, r.status, r.video_file, r.facebook_video_id, r.post_url, r.error]);
  }
  async complete(id: string) { await this.pool.query(`UPDATE outbox_events SET status = 'published', published_at = NOW() WHERE id = $1`, [id]); }
  async fail(id: string) { await this.pool.query(`UPDATE outbox_events SET status = 'failed', published_at = NOW() WHERE id = $1`, [id]); }
  async defer(id: string, until: number) {
    await this.pool.query(`UPDATE outbox_events SET status = 'pending', payload = payload || jsonb_build_object('not_before', $2::text) WHERE id = $1`,
      [id, new Date(until).toISOString()]);
  }
}

/** Queues the Reel for a Facebook post that just went out. Its topic is the first guide the post cites. */
export async function enqueueReel(pool: Pool, job: { id: string; workspace_id: string; content_title?: string | null; artifact_payload?: any; artifact_evidence?: unknown }) {
  const evidence = Array.isArray(job.artifact_evidence) ? job.artifact_evidence : [];
  const sourceId = (evidence[0] as { source_id?: unknown } | undefined)?.source_id;
  if (typeof sourceId !== 'string') return;
  const hook = job.artifact_payload?.result?.facebook?.hook;
  const payload = {
    job_id: job.id, workspace_id: job.workspace_id, source_id: sourceId,
    description: reelDescription(typeof hook === 'string' ? hook : null, job.content_title ?? ''),
    enqueued_at: new Date().toISOString(),
  };
  await pool.query(
    `INSERT INTO outbox_events (workspace_id, event_type, dedup_key, payload) VALUES ($1, 'publishing.reel', $2, $3)
     ON CONFLICT (workspace_id, dedup_key) DO NOTHING`,
    [job.workspace_id, `reel:${job.id}`, JSON.stringify(payload)]);
}

/** The production runner: real Postgres, the renderer's folder, and the Page token the photo publisher uses. */
export function defaultReelRunner(pool: Pool) {
  return new ReelOutboxRunner(new PgReelStore(pool), {
    videoDir: () => process.env.COMMUNITY_VIDEO_DIR?.trim() || null,
    publisher: () => {
      const pageId = process.env.FACEBOOK_PAGE_ID, token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
      return pageId && token ? new FacebookReelPublisher(pageId, token) : null;
    },
  });
}
