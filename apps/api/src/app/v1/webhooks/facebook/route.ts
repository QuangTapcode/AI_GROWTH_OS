import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { tickAutomation } from '@/modules/campaignPlans/automation';

type MessagingEvent = { sender?: { id?: string }; message?: { mid?: string; text?: string; is_echo?: boolean } };
type FeedCommentChange = {
  field?: string;
  value?: {
    item?: string;
    verb?: string;
    comment_id?: string;
    parent_id?: string;
    post_id?: string;
    message?: string;
    permalink_url?: string;
    from?: { id?: string; name?: string };
    post?: { permalink_url?: string };
  };
};

/** Meta signs the raw body with the app secret (X-Hub-Signature-256: sha256=<hex>). */
function signedByMeta(body: string, header: string | null) {
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!secret || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Inbound Page messages become Community inbox items (status received); the automation tick turns
 * them into grounded `community.response` drafts. Nothing is answered from here.
 */
export async function POST(req: NextRequest) {
  const body = await req.text();
  if (!signedByMeta(body, req.headers.get('x-hub-signature-256')))
    return NextResponse.json({ error: { code: 'INVALID_SIGNATURE' } }, { status: 401 });
  const workspaceId = process.env.FACEBOOK_WEBHOOK_WORKSPACE_ID;
  const payload = JSON.parse(body) as {
    object?: string;
    entry?: { id?: string; messaging?: MessagingEvent[]; changes?: FeedCommentChange[] }[];
  };
  if (payload.object !== 'page' || !workspaceId) return NextResponse.json({ status: 'ignored' });
  for (const entry of payload.entry ?? []) {
    if (entry.id !== process.env.FACEBOOK_PAGE_ID) continue;
    for (const event of entry.messaging ?? []) {
      const { message, sender } = event;
      // Echoes are the page's own outgoing messages; attachments without text have nothing to answer.
      if (!message?.mid || !message.text?.trim() || message.is_echo || !sender?.id) continue;
      await pool.query(
        `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, metadata)
         SELECT $1::uuid, 'facebook_message', $2::varchar, 'Facebook user', $3::varchar, $4::text, $5::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM community_messages WHERE workspace_id=$1::uuid AND platform='facebook_message' AND external_id=$2::varchar)`,
        [workspaceId, message.mid, sender.id, message.text.trim().slice(0, 4000), JSON.stringify({ page_id: entry.id })]);
    }
    for (const change of entry.changes ?? []) {
      const val = change.value;
      if (change.field !== 'feed' || val?.item !== 'comment' || val?.verb !== 'add') continue;
      const commentId = val.comment_id?.trim();
      const text = val.message?.trim();
      const fromId = val.from?.id?.trim();
      if (!commentId || !text) continue;
      // Ignore comments authored by the Page itself to avoid self-reply loops.
      if (fromId && (fromId === entry.id || fromId === process.env.FACEBOOK_PAGE_ID)) continue;
      const authorName = val.from?.name?.trim() || 'Người bình luận Facebook';
      const authorContact = fromId || `comment:${commentId}`;
      const permalinkUrl = val.permalink_url || val.post?.permalink_url || null;
      await pool.query(
        `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, post_url, metadata)
         SELECT $1::uuid, 'facebook_comment', $2::varchar, $3::varchar, $4::varchar, $5::text, $6::text, $7::jsonb
          WHERE NOT EXISTS (SELECT 1 FROM community_messages WHERE workspace_id=$1::uuid AND platform='facebook_comment' AND external_id=$2::varchar)`,
        [
          workspaceId,
          commentId,
          authorName.slice(0, 255),
          authorContact.slice(0, 255),
          text.slice(0, 4000),
          permalinkUrl,
          JSON.stringify({
            page_id: entry.id,
            comment_id: commentId,
            parent_id: val.parent_id ?? null,
            post_id: val.post_id ?? null,
            permalink_url: permalinkUrl,
            comment_source: 'page',
            from_id: fromId ?? null,
            from_name: authorName,
          }),
        ],
      );
    }
  }
  void tickAutomation(pool, workspaceId).catch(() => {});
  return NextResponse.json({ status: 'received' });
}

/** Meta subscription check: echo the challenge only for the server-side verify token. */
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const token = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
  if (!token || params.get('hub.mode') !== 'subscribe' || params.get('hub.verify_token') !== token)
    return NextResponse.json({ error: { code: 'FORBIDDEN' } }, { status: 403 });
  return new NextResponse(params.get('hub.challenge') ?? '', { status: 200, headers: { 'content-type': 'text/plain' } });
}
