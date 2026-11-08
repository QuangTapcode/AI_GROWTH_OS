import type { Pool } from 'pg';

export type SendReply = (recipient: string, text: string) => Promise<{ message_id?: string }>;

/** Messenger Send API with the server-side Page token; the token never leaves this process. */
export const sendMessengerReply: SendReply = async (recipient, text) => {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('MESSENGER_NOT_CONFIGURED');
  const version = process.env.META_GRAPH_API_VERSION ?? 'v20.0';
  const response = await fetch(`https://graph.facebook.com/${version}/me/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipient: { id: recipient }, message: { text }, messaging_type: 'RESPONSE' }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({})) as { message_id?: string; error?: { message?: string; code?: number } };
  if (!response.ok) throw new Error(`MESSENGER_REFUSED: (#${body.error?.code ?? response.status}) ${body.error?.message ?? 'request failed'}`);
  return body;
};

export type SendTelegramReply = (chatId: string, text: string, businessConnectionId?: string) => Promise<{ message_id?: string }>;

/** Telegram Bot API; with a business connection the reply goes out from the connected account. */
export const sendTelegramReply: SendTelegramReply = async (chatId, text, businessConnectionId) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_NOT_CONFIGURED');
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, business_connection_id: businessConnectionId }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({})) as { ok?: boolean; error_code?: number; description?: string; result?: { message_id?: number } };
  if (!response.ok || !body.ok) throw new Error(`TELEGRAM_REFUSED: (#${body.error_code ?? response.status}) ${body.description ?? 'request failed'}`);
  return { message_id: body.result?.message_id?.toString() };
};

/**
 * Sends approved Community replies queued as `community.reply` outbox events. A message becomes
 * 'replied' only after the platform accepted the reply; a refusal is recorded once and never resent
 * automatically, so a person is not messaged twice.
 */
export class CommunityReplyRunner {
  constructor(
    private readonly pool: Pool,
    private readonly send: SendReply = sendMessengerReply,
    private readonly sendTelegram: SendTelegramReply = sendTelegramReply,
  ) {}

  async runOnce(): Promise<'idle' | 'sent' | 'failed'> {
    const event = (await this.pool.query<{ id: string; workspace_id: string; payload: { message_id: string; recipient: string; text: string; platform?: string; business_connection_id?: string } }>(`
      UPDATE outbox_events SET status = 'processing', retry_count = retry_count + 1
       WHERE id = (SELECT id FROM outbox_events WHERE event_type = 'community.reply' AND status = 'pending'
                    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING id, workspace_id, payload`)).rows[0];
    if (!event) return 'idle';
    const { message_id: messageId, recipient, text, platform, business_connection_id: businessConnectionId } = event.payload;
    try {
      const sent = platform === 'telegram_message'
        ? await this.sendTelegram(recipient, text, businessConnectionId)
        : await this.send(recipient, text);
      await this.pool.query(
        `UPDATE community_messages SET status = 'replied', metadata = metadata || $3::jsonb, updated_at = now()
          WHERE workspace_id = $1 AND id = $2`,
        [event.workspace_id, messageId, JSON.stringify({
          reply_message_id: sent.message_id ?? null,
          replied_at: new Date().toISOString(),
          auto_matched_community: true,
        })]);
      await this.pool.query(`UPDATE outbox_events SET status = 'published', published_at = now() WHERE id = $1`, [event.id]);
      return 'sent';
    } catch (error) {
      const reason = (error as Error).message.slice(0, 500);
      await this.pool.query(`UPDATE outbox_events SET status = 'failed' WHERE id = $1`, [event.id]);
      await this.pool.query(
        `UPDATE community_messages SET metadata = metadata || $3::jsonb, updated_at = now() WHERE workspace_id = $1 AND id = $2`,
        [event.workspace_id, messageId, JSON.stringify({ reply_error: reason })]);
      return 'failed';
    }
  }
}
