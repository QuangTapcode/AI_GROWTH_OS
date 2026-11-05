import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

type TelegramMessage = {
  message_id?: number;
  text?: string;
  business_connection_id?: string;
  from?: { id?: number; is_bot?: boolean; first_name?: string; last_name?: string };
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
 * Private messages to the bot, or to an account connected to it, become Community inbox items (status
 * received); the automation tick turns them into grounded `community.response` drafts. Nothing is
 * answered from here. Group chats are ignored.
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
  // In a private chat the customer's id is the chat id, so this also drops what the connected account
  // sends itself. Commands, such as the /start Telegram sends on opening a bot, are not questions.
  if (!workspaceId || !message?.message_id || !text || text.startsWith('/') || message.chat?.type !== 'private'
    || !chatId || !author || author.id !== chatId || author.is_bot)
    return NextResponse.json({ status: 'ignored' });
  const connection = message.business_connection_id;
  // A message id is unique only within one chat of one bot or connected account.
  const externalId = `${connection ?? 'bot'}:${chatId}:${message.message_id}`;
  const name = [author.first_name, author.last_name].filter(Boolean).join(' ') || 'Telegram user';
  await pool.query(
    `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, metadata)
     SELECT $1, 'telegram_message', $2::text, $3, $4, $5, $6
      WHERE NOT EXISTS (SELECT 1 FROM community_messages WHERE workspace_id=$1 AND platform='telegram_message' AND external_id=$2::text)`,
    [workspaceId, externalId, name, String(chatId), text.slice(0, 4000), JSON.stringify({ business_connection_id: connection })]);
  return NextResponse.json({ status: 'received' });
}
