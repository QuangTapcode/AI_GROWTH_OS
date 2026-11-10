import type { Pool } from 'pg';
import { FacebookGroupBot } from './FacebookGroupBot';

export type SendReply = (recipient: string, text: string) => Promise<{ message_id?: string }>;
export type SendPageCommentReply = (commentId: string, text: string) => Promise<{ id?: string; message_id?: string }>;
export type SendPrivateReply = (commentId: string, text: string) => Promise<{ message_id?: string }>;
export type SendGroupCommentReply = (params: {
  postUrl: string;
  authorName?: string;
  questionSnippet?: string;
  replyText: string;
}) => Promise<{ success: boolean; message: string }>;

export interface CommentReplyHandlers {
  sendPageComment?: SendPageCommentReply;
  sendPrivateReply?: SendPrivateReply;
  sendGroupComment?: SendGroupCommentReply;
}

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

/** Meta Graph API public reply directly underneath a Fanpage comment (`POST /{comment_id}/comments`). */
export const sendPageCommentReply: SendPageCommentReply = async (commentId, text) => {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('PAGE_COMMENT_NOT_CONFIGURED');
  const version = process.env.META_GRAPH_API_VERSION ?? 'v20.0';
  const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(commentId)}/comments`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: text }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({})) as { id?: string; error?: { message?: string; code?: number } };
  if (!response.ok || !body.id) {
    throw new Error(`COMMENT_REPLY_REFUSED: (#${body.error?.code ?? response.status}) ${body.error?.message ?? 'request failed'}`);
  }
  return { id: body.id, message_id: body.id };
};

/** Meta Graph API Private Reply tied to a Page comment (`recipient: { comment_id }`). */
export const sendPrivateReplyToComment: SendPrivateReply = async (commentId, text) => {
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!token) throw new Error('MESSENGER_NOT_CONFIGURED');
  const version = process.env.META_GRAPH_API_VERSION ?? 'v20.0';
  const response = await fetch(`https://graph.facebook.com/${version}/me/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipient: { comment_id: commentId }, message: { text } }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({})) as { message_id?: string; error?: { message?: string; code?: number } };
  if (!response.ok) {
    throw new Error(`PRIVATE_REPLY_REFUSED: (#${body.error?.code ?? response.status}) ${body.error?.message ?? 'request failed'}`);
  }
  return body;
};

/** Replies to a Facebook Group comment thread using the Playwright Admin session. */
export const sendGroupCommentReply: SendGroupCommentReply = async ({ postUrl, authorName, questionSnippet, replyText }) => {
  const bot = new FacebookGroupBot();
  return await bot.replyToGroupComment({
    postUrl,
    authorName,
    commentSnippet: questionSnippet,
    replyText,
    headless: true,
  });
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

type CommunityReplyOutboxPayload = {
  message_id: string;
  recipient: string;
  text: string;
  platform?: string;
  business_connection_id?: string;
  comment_id?: string;
  comment_source?: 'page' | 'group';
  post_url?: string;
  author_name?: string;
  question_snippet?: string;
  comment_snippet?: string;
  should_private_invite?: boolean;
  invite_group_url?: string;
  community_name?: string;
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
    private readonly commentHandlers: CommentReplyHandlers = {},
  ) {}

  async runOnce(): Promise<'idle' | 'sent' | 'failed'> {
    const event = (await this.pool.query<{ id: string; workspace_id: string; payload: CommunityReplyOutboxPayload }>(`
      UPDATE outbox_events SET status = 'processing', retry_count = retry_count + 1
       WHERE id = (SELECT id FROM outbox_events WHERE event_type = 'community.reply' AND status = 'pending'
                    ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING id, workspace_id, payload`)).rows[0];
    if (!event) return 'idle';
    const {
      message_id: messageId,
      recipient,
      text,
      platform,
      business_connection_id: businessConnectionId,
      comment_id: explicitCommentId,
      comment_source: commentSource,
      post_url: postUrl,
      author_name: authorName,
      question_snippet: questionSnippet,
      comment_snippet: commentSnippet,
      should_private_invite: shouldPrivateInvite,
      invite_group_url: inviteGroupUrl,
      community_name: communityName,
    } = event.payload;
    try {
      let sent: { message_id?: string } = {};
      const extraMeta: Record<string, unknown> = {};

      if (platform === 'telegram_message') {
        sent = await this.sendTelegram(recipient, text, businessConnectionId);
      } else if (platform === 'facebook_comment') {
        const snippet = questionSnippet ?? commentSnippet;
        const targetCommentId = (explicitCommentId || recipient).replace(/^comment:/, '');
        if (commentSource === 'group') {
          if (!postUrl) throw new Error('GROUP_COMMENT_MISSING_POST_URL');
          const groupHandler = this.commentHandlers.sendGroupComment ?? sendGroupCommentReply;
          const groupRes = await groupHandler({ postUrl, authorName, questionSnippet: snippet, replyText: text });
          if (!groupRes.success) throw new Error(`GROUP_COMMENT_REFUSED: ${groupRes.message}`);
          sent = { message_id: `grp_reply:${targetCommentId}` };
          extraMeta.reply_channel = 'facebook_group_comment';
          extraMeta.post_url = postUrl;
        } else {
          const pageHandler = this.commentHandlers.sendPageComment ?? sendPageCommentReply;
          const pageRes = await pageHandler(targetCommentId, text);
          sent = { message_id: pageRes.message_id ?? pageRes.id };
          extraMeta.reply_channel = 'facebook_page_comment';

          if (shouldPrivateInvite && inviteGroupUrl) {
            try {
              const quotaRow = (await this.pool.query<{ sent_today: number; daily_limit: number }>(
                `SELECT
                   (SELECT count(*)::int FROM community_invite_logs WHERE workspace_id = $1 AND status = 'invited' AND invited_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AT TIME ZONE 'Asia/Ho_Chi_Minh')) AS sent_today,
                   COALESCE((SELECT daily_invite_limit FROM community_hub_settings WHERE workspace_id = $1), 12) AS daily_limit`,
                [event.workspace_id],
              )).rows[0];
              const limit = Math.max(10, Math.min(15, quotaRow?.daily_limit ?? 12));
              if ((quotaRow?.sent_today ?? 0) < limit) {
                const privHandler = this.commentHandlers.sendPrivateReply ?? sendPrivateReplyToComment;
                const greetingName = authorName ? ` ${authorName}` : '';
                const groupTitle = communityName || 'Cộng đồng Du lịch & Sống tại Việt Nam';
                const inviteText = `Chào${greetingName}! Bên mình vừa trả lời bình luận của bạn. Mời bạn tham gia nhóm "${groupTitle}" để nhận thêm nhiều cẩm nang & hỏi đáp thực tế: ${inviteGroupUrl}`;
                const privRes = await privHandler(targetCommentId, inviteText);
                extraMeta.private_invite_sent = true;
                extraMeta.private_invite_message_id = privRes.message_id ?? null;
                await this.pool.query(
                  `INSERT INTO community_invite_logs (workspace_id, target_ref, display_name, channel, status, detail)
                   VALUES ($1, $2, $3, 'page_private_reply_invite', 'invited', $4)`,
                  [
                    event.workspace_id,
                    `cmt:${targetCommentId}`.slice(0, 255),
                    (authorName || 'Người bình luận Fanpage').slice(0, 255),
                    `Private reply invite (msg: ${privRes.message_id ?? 'sent'})`,
                  ],
                ).catch(() => {});
              } else {
                extraMeta.private_invite_sent = false;
                extraMeta.private_invite_note = 'daily_quota_reached';
              }
            } catch (privErr) {
              extraMeta.private_invite_sent = false;
              extraMeta.private_invite_error = (privErr as Error).message.slice(0, 240);
            }
          }
        }
      } else {
        sent = await this.send(recipient, text);
      }

      await this.pool.query(
        `UPDATE community_messages SET status = 'replied', metadata = metadata || $3::jsonb, updated_at = now()
          WHERE workspace_id = $1 AND id = $2`,
        [event.workspace_id, messageId, JSON.stringify({
          reply_message_id: sent.message_id ?? null,
          reply_text: text,
          replied_at: new Date().toISOString(),
          auto_matched_community: true,
          ...extraMeta,
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
