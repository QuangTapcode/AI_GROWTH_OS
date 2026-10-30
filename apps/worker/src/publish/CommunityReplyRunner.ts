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

/**
 * Sends approved Community replies queued as `community.reply` outbox events. A message becomes
 * 'replied' only after Messenger accepted the reply; a refusal is recorded once and never resent
 * automatically, so a person is not messaged twice.
 */
export class CommunityReplyRunner {
  constructor(private readonly pool: Pool, private readonly send: SendReply = sendMessengerReply) {}

  async runOnce(): Promise<'idle' | 'sent' | 'failed'> {
    const event = (await this.pool.query<{ id: string; workspace_id: string; payload: { message_id: string; recipient: string; text: string } }>(`
      UPDATE outbox_events SET status = 'processing', retry_count = retry_count + 1
       WHERE id = (SELECT id FROM outbox_events WHERE event_type = 'community.reply' AND status = 'pending'
                    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING id, workspace_id, payload`)).rows[0];
    if (!event) return 'idle';
    const { message_id: messageId, recipient, text } = event.payload;
    try {
      const sent = await this.send(recipient, text);
      await this.pool.query(
        `UPDATE community_messages SET status = 'replied', metadata = metadata || $3::jsonb, updated_at = now()
          WHERE workspace_id = $1 AND id = $2`,
        [event.workspace_id, messageId, JSON.stringify({ reply_message_id: sent.message_id ?? null, replied_at: new Date().toISOString() })]);
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
