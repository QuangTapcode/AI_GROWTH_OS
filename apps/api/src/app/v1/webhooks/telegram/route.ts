import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { tickAutomation } from '@/modules/campaignPlans/automation';
import {
  analyzeTelegramGroupMessage,
  buildTelegramCommandReply,
  buildTelegramGroupWelcomeReply,
  DEFAULT_BOT_USERNAME,
  DEFAULT_COMMUNITY_NAME,
  DEFAULT_FACEBOOK_GROUP_URL,
  parseTelegramCommand,
  type TelegramMessageLike,
} from '@/modules/community/telegram';

type TelegramMessage = TelegramMessageLike & {
  business_connection_id?: string;
};

let cachedWebhookBotIdentity: { id: number | null; username: string | null } | null = null;

async function resolveWebhookBotIdentity(): Promise<{ id: number | null; username: string | null }> {
  const envUsername = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '').toLowerCase() || null;
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const parsedId = token ? Number(token.split(':')[0]) : NaN;
  const fallbackId = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : null;

  if (envUsername) {
    return { id: fallbackId, username: envUsername };
  }
  if (cachedWebhookBotIdentity) return cachedWebhookBotIdentity;
  if (token && process.env.NODE_ENV !== 'test') {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(3_000) });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: { id?: number; username?: string } };
      if (res.ok && json.ok && json.result) {
        cachedWebhookBotIdentity = {
          id: typeof json.result.id === 'number' ? json.result.id : fallbackId,
          username: json.result.username?.trim().toLowerCase() ?? DEFAULT_BOT_USERNAME,
        };
        return cachedWebhookBotIdentity;
      }
    } catch {
      // Fall back to default bot handle if Telegram API is temporarily unreachable.
    }
  }
  return { id: fallbackId, username: DEFAULT_BOT_USERNAME };
}

/** Telegram repeats the secret given to setWebhook in a header on every request. */
function sentByTelegram(header: string | null) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(secret);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Private messages and addressed Telegram Group messages (commands, @mentions, replies to bot,
 * or member joins) become Community inbox items. Unknown slash commands, other bots, and
 * unaddressed group chatter are ignored.
 */
export async function POST(req: NextRequest) {
  if (!sentByTelegram(req.headers.get('x-telegram-bot-api-secret-token')))
    return NextResponse.json({ error: { code: 'INVALID_SECRET' } }, { status: 401 });
  const workspaceId = process.env.TELEGRAM_WEBHOOK_WORKSPACE_ID;
  const update = await req.json() as { message?: TelegramMessage; business_message?: TelegramMessage };
  const message = update.message ?? update.business_message;
  const author = message?.from;
  const chatId = message?.chat?.id;
  const chatType = message?.chat?.type;
  const isPrivate = chatType === 'private';
  const isGroup = chatType === 'group' || chatType === 'supergroup';

  if (!workspaceId || !message?.message_id || !chatId || (!isPrivate && !isGroup))
    return NextResponse.json({ status: 'ignored' });
  if (author?.is_bot) return NextResponse.json({ status: 'ignored' });

  const botIdentity = isGroup ? await resolveWebhookBotIdentity() : { id: null, username: null };
  let command: 'start' | 'community' | 'help' | null = null;
  let contentText = message.text?.trim() ?? '';
  let instantGroupWelcome: { kind: 'ping' | 'bot_joined' | 'member_joined'; memberNames?: string[] } | null = null;

  if (isPrivate) {
    const parsedPrivate = parseTelegramCommand(message.text, botIdentity.username);
    if (!contentText || parsedPrivate === 'unknown' || !author || author.id !== chatId) {
      return NextResponse.json({ status: 'ignored' });
    }
    command = parsedPrivate;
  } else {
    const groupDecision = analyzeTelegramGroupMessage(message, botIdentity);
    if (!groupDecision.shouldRespond) {
      return NextResponse.json({ status: 'ignored' });
    }
    if (groupDecision.kind === 'command') {
      command = groupDecision.command ?? null;
      contentText = groupDecision.cleanedText ?? contentText;
    } else if (groupDecision.kind === 'question') {
      contentText = groupDecision.cleanedText ?? contentText;
    } else {
      instantGroupWelcome = { kind: groupDecision.kind, memberNames: groupDecision.memberNames };
      contentText =
        groupDecision.cleanedText ||
        (groupDecision.kind === 'bot_joined'
          ? '[Bot đã tham gia nhóm]'
          : `[Thành viên mới: ${groupDecision.memberNames?.join(', ') ?? 'bạn mới'}]`);
    }
  }

  const connection = isPrivate ? message.business_connection_id : undefined;
  // A message id is unique only within one chat of one bot or connected account.
  const externalId = `${connection ?? 'bot'}:${chatId}:${message.message_id}`;
  const name = (author ? [author.first_name, author.last_name].filter(Boolean).join(' ') : '') || 'Telegram user';
  const metadata: Record<string, unknown> = {};
  if (connection) metadata.business_connection_id = connection;
  if (author?.username) metadata.username = author.username;
  if (isGroup) {
    metadata.chat_type = chatType;
    if (message.chat?.title) metadata.chat_title = message.chat.title;
    if (author?.id) metadata.sender_id = String(author.id);
    metadata.reply_to_message_id = message.message_id;
    if (typeof message.message_thread_id === 'number') metadata.message_thread_id = message.message_thread_id;
  }

  const readHubSettings = async () => {
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
    return { communityName, groupUrl, positioning };
  };

  if (command || instantGroupWelcome) {
    const tagMeta = command ? { command } : { group_event: instantGroupWelcome!.kind };
    const inserted = (await pool.query<{ id: string }>(
      `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, status, metadata)
       SELECT $1, 'telegram_message', $2::text, $3, $4, $5, 'queued', $6
        WHERE NOT EXISTS (SELECT 1 FROM community_messages WHERE workspace_id=$1 AND platform='telegram_message' AND external_id=$2::text)
       RETURNING id`,
      [workspaceId, externalId, name, String(chatId), contentText.slice(0, 4000), JSON.stringify({ ...metadata, ...tagMeta })],
    )).rows[0];
    if (inserted?.id) {
      const { communityName, groupUrl, positioning } = await readHubSettings();
      const instantReply = command
        ? buildTelegramCommandReply(command, {
            userName: name,
            communityName,
            groupUrl,
            positioning,
          })
        : {
            ...buildTelegramGroupWelcomeReply(instantGroupWelcome!.kind, {
              userName: name,
              chatTitle: message.chat?.title,
              memberNames: instantGroupWelcome!.memberNames,
              botUsername: botIdentity.username,
              communityName,
              groupUrl,
            }),
            includeInviteLog: false,
            inviteGroupUrl: groupUrl,
          };
      await pool.query(
        `INSERT INTO outbox_events (workspace_id, event_type, dedup_key, payload) VALUES ($1, 'community.reply', $2, $3)
         ON CONFLICT (workspace_id, dedup_key) DO NOTHING`,
        [
          workspaceId,
          `community-reply:${inserted.id}`,
          JSON.stringify({
            message_id: inserted.id,
            recipient: String(chatId),
            text: instantReply.text,
            platform: 'telegram_message',
            business_connection_id: connection,
            reply_markup: instantReply.reply_markup,
            ...(isGroup ? { reply_to_message_id: message.message_id } : {}),
            ...(typeof message.message_thread_id === 'number' ? { message_thread_id: message.message_thread_id } : {}),
            should_community_invite: instantReply.includeInviteLog,
            invite_group_url: instantReply.inviteGroupUrl,
            community_name: communityName,
            author_name: name,
          }),
        ],
      );
    }
    return NextResponse.json({ status: 'received', ...(command ? { command } : { event: instantGroupWelcome?.kind }) });
  }

  await pool.query(
    `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, metadata)
     SELECT $1, 'telegram_message', $2::text, $3, $4, $5, $6
      WHERE NOT EXISTS (SELECT 1 FROM community_messages WHERE workspace_id=$1 AND platform='telegram_message' AND external_id=$2::text)`,
    [workspaceId, externalId, name, String(chatId), contentText.slice(0, 4000), JSON.stringify(metadata)],
  );
  if (typeof (pool as { connect?: unknown }).connect === 'function') {
    void tickAutomation(pool, workspaceId).catch(() => {});
  }
  return NextResponse.json({ status: 'received' });
}
