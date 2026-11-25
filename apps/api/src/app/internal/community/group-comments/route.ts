import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { CommunityHubService } from '@/modules/community/hub';
import { processReceivedCommunityMessages } from '@/modules/community/service';

/**
 * Called by the worker's GroupCommentWatcher the moment a "commented on" notification arrives:
 * reads only the named posts, stores new comments and hands them to the Community Agent right away,
 * so a reply no longer waits for the 3-minute periodic scan.
 */
export async function POST(req: NextRequest) {
  const token = process.env.AUTOMATION_INTERNAL_TOKEN;
  const actual = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  if (!token || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { post_urls?: unknown };
  const requested = Array.isArray(body.post_urls) ? body.post_urls.filter((u): u is string => typeof u === 'string') : [];

  const workspaces = (
    await pool.query<{ workspace_id: string; actor_id: string | null; group_url: string | null; snapshot_id: string | null }>(
      `SELECT a.workspace_id, a.actor_id, s.group_url, k.snapshot_id
         FROM agent_automation a
         JOIN community_hub_settings s ON s.workspace_id = a.workspace_id
         LEFT JOIN knowledge_contexts k ON k.workspace_id = a.workspace_id AND k.current
        WHERE a.enabled = TRUE AND s.auto_reply_comments IS DISTINCT FROM FALSE
        LIMIT 25`,
    )
  ).rows;

  const service = new CommunityHubService(pool);
  const results: Array<Record<string, unknown>> = [];
  for (const ws of workspaces) {
    const groupId = ws.group_url?.match(/\/groups\/([^/?#]+)/)?.[1];
    if (!groupId) continue;
    // Only posts of this workspace's own Group: nothing else may be opened with the bot account.
    const postUrls = requested
      .filter((u) => new RegExp(`^https://www\\.facebook\\.com/groups/${groupId}/posts/\\d+/?$`).test(u))
      .slice(0, 5);
    if (!postUrls.length) continue;
    const entry: Record<string, unknown> = { workspace_id: ws.workspace_id, post_urls: postUrls.length };
    try {
      const scan = await service.syncGroupComments(ws.workspace_id, postUrls.length, { postUrls, onlyPostUrls: true });
      entry.ingested = scan.ingested;
      if (scan.error) entry.error = scan.error;
      if (scan.ingested > 0 && ws.actor_id && ws.snapshot_id) {
        entry.queued_rag = await processReceivedCommunityMessages(pool, ws.workspace_id, ws.actor_id, ws.snapshot_id, 15);
      }
    } catch (error) {
      entry.error = (error as Error).message;
    }
    results.push(entry);
  }
  return NextResponse.json({ results });
}
