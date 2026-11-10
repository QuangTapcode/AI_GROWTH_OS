import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { CommunityHubService } from '@/modules/community/hub';
import { processReceivedCommunityMessages } from '@/modules/community/service';

export async function POST(req: NextRequest) {
  const token = process.env.AUTOMATION_INTERNAL_TOKEN;
  const actual = Buffer.from(req.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${token}`);
  if (!token || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: { code: 'UNAUTHORIZED' } }, { status: 401 });
  }

  const workspaces = (
    await pool.query<{
      workspace_id: string;
      actor_id: string | null;
      auto_reply_comments: boolean | null;
      auto_invite_enabled: boolean | null;
      last_comment_sync_at: Date | null;
      last_group_comment_sync_at: Date | null;
      last_post_stats_sync_at: Date | null;
      last_invite_run_at: Date | null;
      snapshot_id: string | null;
    }>(
      `SELECT a.workspace_id,
              a.actor_id,
              s.auto_reply_comments,
              s.auto_invite_enabled,
              s.last_comment_sync_at,
              s.last_group_comment_sync_at,
              s.last_post_stats_sync_at,
              s.last_invite_run_at,
              k.snapshot_id
         FROM agent_automation a
         LEFT JOIN community_hub_settings s ON s.workspace_id = a.workspace_id
         LEFT JOIN knowledge_contexts k ON k.workspace_id = a.workspace_id AND k.current
        WHERE a.enabled = TRUE
        LIMIT 25`,
    )
  ).rows;

  const service = new CommunityHubService(pool);
  const results = [];

  for (const ws of workspaces) {
    const entry: Record<string, unknown> = { workspace_id: ws.workspace_id };
    try {
      const commentAgeMs = ws.last_comment_sync_at
        ? Date.now() - new Date(ws.last_comment_sync_at).getTime()
        : Infinity;
      const groupCommentAgeMs = ws.last_group_comment_sync_at
        ? Date.now() - new Date(ws.last_group_comment_sync_at).getTime()
        : Infinity;
      if (ws.auto_reply_comments !== false && (commentAgeMs >= 60_000 || groupCommentAgeMs >= 3 * 60_000)) {
        const pageScan =
          commentAgeMs >= 60_000
            ? await service.syncPageComments(ws.workspace_id)
            : { ingested: 0, checked_posts: 0 };
        let groupScan: { ingested: number; scanned_posts: number; skipped?: string; error?: string } = {
          ingested: 0,
          scanned_posts: 0,
          skipped: 'THROTTLED',
        };
        if (groupCommentAgeMs >= 3 * 60_000) {
          groupScan = await service.syncGroupComments(ws.workspace_id, 4);
        }
        await service.syncMembersFromInteractions(ws.workspace_id);
        entry.comments = { page_ingested: pageScan.ingested, group_ingested: groupScan.ingested };
      }

      if (ws.actor_id && ws.snapshot_id) {
        entry.queued_rag = await processReceivedCommunityMessages(
          pool,
          ws.workspace_id,
          ws.actor_id,
          ws.snapshot_id,
          15,
        );
      }

      const postStatsAgeMs = ws.last_post_stats_sync_at
        ? Date.now() - new Date(ws.last_post_stats_sync_at).getTime()
        : Infinity;
      if (postStatsAgeMs >= 10 * 60_000) {
        entry.post_stats = await service.syncPostEngagementStats(ws.workspace_id, {
          includeGroupBot: groupCommentAgeMs >= 3 * 60_000,
        });
      }

      const inviteAgeMs = ws.last_invite_run_at
        ? Date.now() - new Date(ws.last_invite_run_at).getTime()
        : Infinity;
      if (ws.auto_invite_enabled !== false && inviteAgeMs >= 20 * 60_000) {
        entry.invites = await service.sendSafeCommunityInvites(ws.workspace_id, {
          maxBatch: 4,
          includeNativeGroupUi: true,
        });
      }
    } catch (error) {
      entry.error = (error as Error).message;
    }
    results.push(entry);
  }

  return NextResponse.json({ results });
}

