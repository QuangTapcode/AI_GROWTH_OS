import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { tickAutomation } from '@/modules/campaignPlans/automation';
import {
  buildTelegramCommandReply,
  DEFAULT_COMMUNITY_NAME,
  DEFAULT_FACEBOOK_GROUP_URL,
  parseTelegramCommand,
} from '@/modules/community/telegram';

type TelegramMessage = {
  message_id?: number;
  text?: string;
  business_connection_id?: string;
  from?: { id?: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string };
  chat?: { id?: number; type?: string };
};

/** Telegram repeats the secret given to setWebhook in a header on every request. */
function sentByTelegram(header: string | null) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Private messages to the bot, or to an account connected to it, become Community inbox items.
 * Known interactive commands (`/start`, `/community`, `/help`) immediately queue a friendly welcome +
 * Facebook community CTA button; normal messages become `received` items for the AI RAG pipeline.
 * Unknown slash commands and group chats are ignored.
 */
export async function POST(req: NextRequest) {
  if (!sentByTelegram(req.headers.get('x-telegram-bot-api-secret-token')))
    return NextResponse.json({ error: { code: 'INVALID_SECRET' } }, { status: 401 });
  const workspaceId = process.env.TELEGRAM_WEBHOOK_WORKSPACE_ID;
  const update = await req.json() as { message?: TelegramMessage; business_message?: TelegramMessage };
  const message = update.message ?? update.business_message;
  const text = message?.text?.trim();
  const author = message?.from;
  const chatId = message?.chat?.id;
  const command = parseTelegramCommand(text);
  // In a private chat the customer's id is the chat id, so this also drops what the connected account
  // sends itself. Unknown slash commands and non-private chats are ignored.
  if (!workspaceId || !message?.message_id || !text || command === 'unknown' || message.chat?.type !== 'private'
    || !chatId || !author || author.id !== chatId || author.is_bot)
    return NextResponse.json({ status: 'ignored' });

  const connection = message.business_connection_id;
  // A message id is unique only within one chat of one bot or connected account.
  const externalId = `${connection ?? 'bot'}:${chatId}:${message.message_id}`;
  const name = [author.first_name, author.last_name].filter(Boolean).join(' ') || 'Telegram user';
  const metadata: Record<string, string> = {};
  if (connection) metadata.business_connection_id = connection;
  if (author.username) metadata.username = author.username;

  if (command) {
    const inserted = (await pool.query<{ id: string }>(
      `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, status, metadata)
       SELECT $1, 'telegram_message', $2::text, $3, $4, $5, 'queued', $6
        WHERE NOT EXISTS (SELECT 1 FROM community_messages WHERE workspace_id=$1 AND platform='telegram_message' AND external_id=$2::text)
       RETURNING id`,
      [workspaceId, externalId, name, String(chatId), text.slice(0, 4000), JSON.stringify({ ...metadata, command })],
    )).rows[0];
    if (inserted?.id) {
      let communityName = DEFAULT_COMMUNITY_NAME;
      let groupUrl = DEFAULT_FACEBOOK_GROUP_URL;
      let positioning: string | null = null;
      try {
        const sRow = (await pool.query<{
          community_name?: string | null;
          group_url?: string | null;
          positioning?: string | null;
        }>(
          `SELECT community_name, group_url, positioning FROM community_hub_settings WHERE workspace_id = $1 LIMIT 1`,
          [workspaceId],
        )).rows[0];
        if (sRow?.community_name) communityName = sRow.community_name;
        if (sRow?.group_url) groupUrl = sRow.group_url;
        positioning = sRow?.positioning ?? null;
      } catch {
        // Minimal unit fixtures without community_hub_settings fall back cleanly.
      }
      const cmdReply = buildTelegramCommandReply(command, {
        userName: name,
        communityName,
        groupUrl,
        positioning,
      });
      await pool.query(
        `INSERT INTO outbox_events (workspace_id, event_type, dedup_key, payload) VALUES ($1, 'community.reply', $2, $3)
         ON CONFLICT (workspace_id, dedup_key) DO NOTHING`,
        [
          workspaceId,
          `community-reply:${inserted.id}`,
          JSON.stringify({
            message_id: inserted.id,
            recipient: String(chatId),
            text: cmdReply.text,
            platform: 'telegram_message',
            business_connection_id: connection,
            reply_markup: cmdReply.reply_markup,
            should_community_invite: cmdReply.includeInviteLog,
            invite_group_url: cmdReply.inviteGroupUrl,
            community_name: communityName,
            author_name: name,
          }),
        ],
      );
    }
    return NextResponse.json({ status: 'received', command });
  }

  await pool.query(
    `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, metadata)
     SELECT $1, 'telegram_message', $2::text, $3, $4, $5, $6
      WHERE NOT EXISTS (SELECT 1 FROM community_messages WHERE workspace_id=$1 AND platform='telegram_message' AND external_id=$2::text)`,
    [workspaceId, externalId, name, String(chatId), text.slice(0, 4000), JSON.stringify(metadata)],
  );
  if (typeof (pool as { connect?: unknown }).connect === 'function') {
    void tickAutomation(pool, workspaceId).catch(() => {});
  }
  return NextResponse.json({ status: 'received' });
}
