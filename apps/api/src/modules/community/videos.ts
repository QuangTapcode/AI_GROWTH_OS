import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { AppError } from '@/lib/errors';

/**
 * Explainer videos made outside the API (Video3D/tripc-playbook) for Community topics.
 *
 * The renderer writes MP4 files and a `manifest.json` into COMMUNITY_VIDEO_DIR; the API only reads them.
 * A video belongs to a topic by `source_id`, the same key as a Community calendar card.
 * A browser <video> cannot send the Bearer header, so the hub hands out short-lived signed links instead.
 */
export type CommunityVideo = {
  workspace_id: string;
  source_id: string;
  content_id?: string | null;
  file: string;
  title: string;
  duration_s: number;
  created_at: string;
  status: 'draft' | 'approved';
};

/** Same table the worker's ReelOutboxRunner writes (REEL_TABLE_SQL there); created by whichever runs first. */
export const COMMUNITY_VIDEO_POSTS_SQL = `
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

const SAFE_FILE =/^[A-Za-z0-9][A-Za-z0-9._-]*\.mp4$/;
// Links are stable inside a window so the hub's periodic refresh does not change a playing video's src.
const WINDOW_MS = 6 * 3600_000;
const MAX_LIFETIME_MS = 24 * 3600_000;

export function videoDir(): string | null {
  const dir = process.env.COMMUNITY_VIDEO_DIR?.trim();
  return dir ? path.resolve(dir) : null;
}

/** A workspace's videos by topic. A missing or broken manifest means no videos, never an error on the hub. */
export function readVideoManifest(dir: string | null, workspaceId: string): Map<string, CommunityVideo> {
  const out = new Map<string, CommunityVideo>();
  if (!dir) return out;
  let entries: unknown;
  try {
    entries = (JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')) as { videos?: unknown }).videos;
  } catch {
    return out;
  }
  if (!Array.isArray(entries)) return out;
  for (const raw of entries) {
    const v = raw as Partial<CommunityVideo>;
    if (v?.workspace_id !== workspaceId || typeof v.source_id !== 'string' || typeof v.file !== 'string') continue;
    // Only plain file names inside the folder: a manifest entry can never point the route at another file.
    if (!SAFE_FILE.test(v.file) || !existsSync(path.join(dir, v.file))) continue;
    out.set(v.source_id, {
      workspace_id: workspaceId,
      source_id: v.source_id,
      content_id: typeof v.content_id === 'string' ? v.content_id : null,
      file: v.file,
      title: typeof v.title === 'string' ? v.title : '',
      duration_s: Number(v.duration_s) || 0,
      created_at: typeof v.created_at === 'string' ? v.created_at : '',
      status: v.status === 'approved' ? 'approved' : 'draft',
    });
  }
  return out;
}

function secret(): string {
  const s = process.env.AUTH_SECRET ?? '';
  if (s.length < 32) throw new AppError(500, 'AUTH_NOT_CONFIGURED', 'AUTH_SECRET must be set to at least 32 characters');
  return s;
}

const signature = (workspaceId: string, sourceId: string, exp: string) =>
  createHmac('sha256', secret()).update(`community-video:${workspaceId}:${sourceId}:${exp}`).digest('base64url');

/** Path under /v1 that plays one topic's video without a login header, valid for 6 to 12 hours. */
export function signedVideoPath(workspaceId: string, sourceId: string, now = Date.now()): string {
  const exp = String(((Math.floor(now / WINDOW_MS) + 2) * WINDOW_MS) / 1000);
  const query = new URLSearchParams({ exp, sig: signature(workspaceId, sourceId, exp) });
  return `/community-videos/${encodeURIComponent(workspaceId)}/${encodeURIComponent(sourceId)}?${query}`;
}

export function verifyVideoRequest(workspaceId: string, sourceId: string, exp: string | null, sig: string | null, now = Date.now()): boolean {
  if (!exp || !sig || !/^\d{9,11}$/.test(exp)) return false;
  const expMs = Number(exp) * 1000;
  if (expMs < now || expMs > now + MAX_LIFETIME_MS) return false;
  const expected = Buffer.from(signature(workspaceId, sourceId, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The single byte range a video player asked for; null for the whole file. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null | 'unsatisfiable' {
  const m = header?.match(/^bytes=(\d*)-(\d*)/);
  if (!m || (!m[1] && !m[2])) return null;
  let start: number, end: number;
  if (!m[1]) {
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  }
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}

/**
 * The `publishing.reel` outbox event for a Facebook post that is already out (the worker's ReelOutboxRunner reads it).
 * Description text matches the worker's reelDescription. `attempt` > 0 is a retry after a failed Reel and gets its own
 * dedup key; the same attempt queued twice (a double click) stays one event.
 */
export function reelRequest(
  job: { id: string; workspace_id: string; content_title: string | null; hook: string | null; source_id: string },
  attempt: number,
  now = Date.now(),
) {
  const opening = job.hook?.trim() || (job.content_title ?? '').trim();
  return {
    dedup_key: attempt > 0 ? `reel:${job.id}:retry-${attempt}` : `reel:${job.id}`,
    payload: {
      job_id: job.id,
      workspace_id: job.workspace_id,
      source_id: job.source_id,
      description: `${opening}\n\nThe full checklist is in our latest post on this Page. Follow TripC for more Vietnam tips.\n\n#TripC #VietnamTips`,
      enqueued_at: new Date(now).toISOString(),
    },
  };
}
