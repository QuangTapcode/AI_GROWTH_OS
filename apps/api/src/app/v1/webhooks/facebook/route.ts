import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

type MessagingEvent = { sender?: { id?: string }; message?: { mid?: string; text?: string; is_echo?: boolean } };

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
  const payload = JSON.parse(body) as { object?: string; entry?: { id?: string; messaging?: MessagingEvent[] }[] };
  if (payload.object !== 'page' || !workspaceId) return NextResponse.json({ status: 'ignored' });
  for (const entry of payload.entry ?? []) {
    if (entry.id !== process.env.FACEBOOK_PAGE_ID) continue;
    for (const event of entry.messaging ?? []) {
      const { message, sender } = event;
      // Echoes are the page's own outgoing messages; attachments without text have nothing to answer.
      if (!message?.mid || !message.text?.trim() || message.is_echo || !sender?.id) continue;
      await pool.query(
        `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, metadata)
         SELECT $1, 'facebook_message', $2, 'Facebook user', $3, $4, $5
          WHERE NOT EXISTS (SELECT 1 FROM community_messages WHERE workspace_id=$1 AND platform='facebook_message' AND external_id=$2)`,
        [workspaceId, message.mid, sender.id, message.text.trim().slice(0, 4000), JSON.stringify({ page_id: entry.id })]);
    }
  }
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
