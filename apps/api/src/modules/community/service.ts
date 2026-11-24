import type { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../lib/errors';
import { enqueueAiTask } from '../campaignPlans/aiTasks';
import { PgCommunityRepository } from './repository';
import { BookingConciergeService, DM_PLATFORMS } from '../booking/concierge';
import { classifySentiment } from '../merchant/sentiment';
import { loadMerchantProfile } from '../merchant/profile';
import { alertOwner } from '../merchant/notify';
import {
  receiveMessageInputSchema,
  updateMessageStatusSchema,
  type ReceiveMessageInput,
  type UpdateMessageStatusInput,
  type CommunityMessageRecord,
} from './schemas';

export class CommunityService {
  private readonly repo: PgCommunityRepository;

  constructor(private readonly pool: Pool) {
    this.repo = new PgCommunityRepository(pool);
  }

  async processPendingMessages(
    workspaceId: string,
    actorId: string,
    snapshotId: string,
    limit = 10,
  ): Promise<number> {
    return processReceivedCommunityMessages(this.pool, workspaceId, actorId, snapshotId, limit);
  }

  async receiveMessage(
    workspaceId: string,
    actorId: string,
    rawInput: unknown,
  ): Promise<{ message: CommunityMessageRecord; task_id?: string }> {
    const parsed = receiveMessageInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Invalid community message payload', parsed.error.flatten().fieldErrors);
    }
    const input: ReceiveMessageInput = parsed.data;

    // 1. Lưu bản ghi tin nhắn vào hộp thư
    const message = await this.repo.insertMessage(workspaceId, input);

    // 2. Nếu auto_enqueue được bật (mặc định), tự động đưa vào hàng đợi AI
    if (input.auto_enqueue !== false) {
      const contextRes = await this.pool.query<{ snapshot_id: string }>(
        `SELECT snapshot_id FROM knowledge_contexts WHERE workspace_id = $1 AND current = true LIMIT 1`,
        [workspaceId],
      );
      const snapshotId = contextRes.rows[0]?.snapshot_id;
      if (snapshotId) {
        const history = input.author_contact
          ? await conversationHistory(this.pool, workspaceId, input.platform, input.author_contact, message.id).catch(() => [])
          : [];
        const taskId = randomUUID();
        await enqueueAiTask(this.pool, workspaceId, actorId, {
          task_id: taskId,
          context_snapshot_id: snapshotId,
          input: {
            operation: 'community.response',
            question: input.content,
            ...(history.length > 0 ? { history } : {}),
          },
        });

        const updated = await this.repo.updateTaskLink(workspaceId, message.id, taskId, 'queued');
        return { message: updated || message, task_id: taskId };
      }
    }

    return { message };
  }

  async listMessages(
    workspaceId: string,
    filters?: { status?: any; platform?: string; limit?: number },
  ): Promise<CommunityMessageRecord[]> {
    return this.repo.listMessages(workspaceId, filters);
  }

  async getMessage(workspaceId: string, messageId: string): Promise<CommunityMessageRecord> {
    const msg = await this.repo.findById(workspaceId, messageId);
    if (!msg) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Community message not found');
    }
    return msg;
  }

  async updateMessageStatus(
    workspaceId: string,
    messageId: string,
    rawInput: unknown,
  ): Promise<CommunityMessageRecord> {
    const parsed = updateMessageStatusSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Invalid message status payload', parsed.error.flatten().fieldErrors);
    }
    const input: UpdateMessageStatusInput = parsed.data;

    const existing = await this.repo.findById(workspaceId, messageId);
    if (!existing) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Community message not found');
    }

    const updated = await this.repo.updateStatusAndLead(
      workspaceId,
      messageId,
      input.status,
      input.lead_id,
    );
    if (!updated) {
      throw new AppError(500, 'UPDATE_FAILED', 'Failed to update community message');
    }
    return updated;
  }
}

/**
 * Autopilot helper: enqueues pending received community messages into workflow_tasks.
 */
/** A reply counts only once it was sent: a draft nobody sent was never said to this person. */
/** How far back an earlier question still belongs to the same conversation. A group moves on faster. */
export const HISTORY_WINDOW_MINUTES = { group: 30, private: 180 } as const;
const HISTORY_TURNS = 4;

/**
 * The asker's own earlier questions in this chat, oldest first: context for a follow-up such as "Khu vực Đà Nẵng".
 * A Telegram group shares one author_contact (the group's chat id), so there the sender's id picks out their own
 * turns; commands and join notices (no AI task) and anything older than the window are not part of the conversation.
 */
export async function conversationHistory(pool: Pick<Pool, 'query'>, workspaceId: string, platform: string, contact: string, messageId: string) {
  const isGroup = contact.startsWith('-');
  const prior = (await pool.query<{ content: string; reply: string | null }>(
    `WITH cur AS (
       SELECT received_at, metadata->>'sender_id' AS sender_id FROM community_messages WHERE id = $4
     )
     SELECT m.content,
            CASE WHEN m.status = 'replied'
                 THEN COALESCE(a.payload->'result'->>'reply', m.metadata->>'reply_text')
            END AS reply
       FROM community_messages m
       CROSS JOIN cur
       LEFT JOIN content_artifacts a ON a.workspace_id = m.workspace_id AND a.task_id = m.task_id
      WHERE m.workspace_id = $1 AND m.platform = $2 AND m.author_contact = $3 AND m.id <> $4
        AND m.task_id IS NOT NULL
        AND m.received_at <= cur.received_at
        AND m.received_at > cur.received_at - make_interval(mins => $5::int)
        AND (cur.sender_id IS NULL OR m.metadata->>'sender_id' = cur.sender_id)
        AND lower(m.content) <> lower((SELECT content FROM community_messages WHERE id = $4))
      ORDER BY m.received_at DESC LIMIT $6`,
    [workspaceId, platform, contact, messageId,
      isGroup ? HISTORY_WINDOW_MINUTES.group : HISTORY_WINDOW_MINUTES.private, HISTORY_TURNS],
  )).rows;
  // The same message delivered twice is one turn.
  const seen = new Set<string>();
  const unique = prior.filter((row) => {
    const key = row.content.trim().toLowerCase();
    return seen.has(key) ? false : (seen.add(key), true);
  });
  return unique.reverse().map((row) => ({
    question: row.content.slice(0, 300),
    ...(row.reply ? { reply: row.reply.slice(0, 300) } : {}),
  }));
}

/**
 * Pulls any unanswered customer messages directly from the Page's Messenger conversations via Graph API
 * into community_messages (status='received') so replies work even without a public webhook tunnel.
 */
const lastSyncByWorkspace = new Map<string, number>();

async function syncInboundMessengerMessages(pool: Pool, workspaceId: string): Promise<void> {
  const now = Date.now();
  if (now - (lastSyncByWorkspace.get(workspaceId) ?? 0) < 4000) return;
  lastSyncByWorkspace.set(workspaceId, now);
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
  if (!token || !pageId) return;
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/me/conversations?fields=participants,messages.limit(2){id,message,from,created_time}&limit=10&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return;
    const json = (await res.json()) as {
      data?: {
        participants?: { data?: { id: string; name?: string }[] };
        messages?: { data?: { id?: string; message?: string; from?: { id?: string; name?: string }; created_time?: string }[] };
      }[];
    };
    for (const conv of json.data ?? []) {
      const msgs = conv.messages?.data ?? [];
      const latest = msgs[0];
      if (!latest?.id || !latest.message?.trim() || !latest.from?.id || latest.from.id === pageId) continue;
      const senderId = latest.from.id;
      const senderName = latest.from.name || 'Facebook user';
      await pool.query(
        `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, metadata, received_at)
         SELECT $1::uuid, 'facebook_message', $2::varchar, $3::varchar, $4::varchar, $5::text, $6::jsonb, NOW()
          WHERE NOT EXISTS (
            SELECT 1 FROM community_messages
             WHERE workspace_id = $1::uuid AND platform = 'facebook_message' AND external_id = $2::varchar
          )`,
        [
          workspaceId,
          latest.id,
          senderName.slice(0, 250),
          senderId,
          latest.message.trim().slice(0, 4000),
          JSON.stringify({ page_id: pageId, fb_created_time: latest.created_time ?? null }),
        ],
      );
    }
  } catch {
    // Ignore transient Graph API errors during background polling
  }
}

const COMMENT_PLATFORMS = new Set(['facebook_comment', 'instagram_comment']);

export async function processReceivedCommunityMessages(
  pool: Pool,
  workspaceId: string,
  actorId: string,
  /** null: chưa có knowledge context — chỉ chạy Agent 6/7 (cầu chì bình luận, đặt bàn), chưa gửi sang AI hỏi-đáp. */
  snapshotId: string | null,
  limit = 10,
): Promise<number> {
  let autoReplyComments = true;
  try {
    const sRow = (
      await pool.query<{ auto_reply_comments?: boolean | null }>(
        `SELECT auto_reply_comments FROM community_hub_settings WHERE workspace_id = $1 LIMIT 1`,
        [workspaceId],
      )
    ).rows[0];
    if (sRow?.auto_reply_comments === false) {
      autoReplyComments = false;
    }
  } catch {
    // Settings table may not exist in minimal unit fixtures; default to enabled.
  }

  await syncInboundMessengerMessages(pool, workspaceId);
  const pending = (
    await pool.query<{ id: string; content: string; platform: string; author_contact: string | null; author_name: string | null; post_url: string | null; metadata: Record<string, unknown> | null }>(
      `SELECT id, content, platform, author_contact, author_name, post_url, metadata FROM community_messages
       WHERE workspace_id = $1 AND status = 'received' AND task_id IS NULL
       ORDER BY received_at ASC LIMIT $2`,
      [workspaceId, limit],
    )
  ).rows;

  let enqueued = 0;
  const concierge = new BookingConciergeService(pool);
  for (const msg of pending) {
    if (COMMENT_PLATFORMS.has(msg.platform) && !autoReplyComments) continue;

    // Agent 7 — Booking Concierge: tin nhắn riêng thuộc luồng đặt bàn được state machine xử lý (không qua RAG).
    if (DM_PLATFORMS.has(msg.platform)) {
      const outcome = await concierge
        .handleInbound(workspaceId, { id: msg.id, platform: msg.platform, author_contact: msg.author_contact, author_name: msg.author_name, content: msg.content, metadata: msg.metadata })
        .catch((err) => {
          console.warn('[concierge] falling back to RAG reply:', (err as Error).message);
          return { handled: false };
        });
      if (outcome.handled) continue;
    }

    // Agent 6 — Comment Reply: "cầu chì" thương hiệu trước khi AI trả lời công khai.
    if (COMMENT_PLATFORMS.has(msg.platform)) {
      const sentiment = classifySentiment(msg.content);
      if (sentiment.label === 'spam') {
        await pool.query(
          `UPDATE community_messages SET status = 'ignored', metadata = metadata || $3::jsonb, updated_at = now() WHERE workspace_id = $1 AND id = $2`,
          [workspaceId, msg.id, JSON.stringify({ agent: 'comment_reply', sentiment: 'spam', sentiment_matched: sentiment.matched })],
        );
        continue;
      }
      if (sentiment.label === 'crisis' || sentiment.label === 'negative') {
        await pool.query(
          `UPDATE community_messages SET status = 'escalated', metadata = metadata || $3::jsonb, updated_at = now() WHERE workspace_id = $1 AND id = $2`,
          [workspaceId, msg.id, JSON.stringify({ agent: 'comment_reply', sentiment: sentiment.label, sentiment_matched: sentiment.matched })],
        );
        const profile = await loadMerchantProfile(pool, workspaceId).catch(() => null);
        if (profile) {
          await alertOwner(
            profile,
            `${sentiment.label === 'crisis' ? '🚨 CẢNH BÁO PHỐT' : '⚠️ Bình luận tiêu cực'} (${msg.platform === 'instagram_comment' ? 'Instagram' : 'Facebook'})
${msg.author_name ?? 'Khách'}: "${msg.content.slice(0, 400)}"
${msg.post_url ? `Bài viết: ${msg.post_url}
` : ''}AI KHÔNG tự trả lời bình luận này — anh/chị xử lý trong Hộp thư cộng đồng.`,
          );
        }
        continue;
      }
    }
    if (!snapshotId) continue;
    const history = msg.author_contact ? await conversationHistory(pool, workspaceId, msg.platform, msg.author_contact, msg.id) : [];
    const taskId = randomUUID();
    await enqueueAiTask(pool, workspaceId, actorId, {
      task_id: taskId,
      context_snapshot_id: snapshotId,
      input: {
        operation: 'community.response',
        question: msg.content,
        ...(history.length > 0 ? { history } : {}),
      },
    });
    await pool.query(
      `UPDATE community_messages SET task_id = $1, status = 'queued', updated_at = now() WHERE workspace_id = $2 AND id = $3`,
      [taskId, workspaceId, msg.id],
    );
    enqueued++;
  }
  return enqueued;
}
