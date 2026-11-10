import type { PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';

interface LeadProposal {
  intent?: string;
  status?: string;
  contact?: {
    email?: string;
    phone?: string;
  };
}

interface DirectMessage {
  id: string;
  platform: string;
  author_contact: string | null;
  author_name?: string | null;
  post_url?: string | null;
  content?: string | null;
  metadata: {
    business_connection_id?: string;
    comment_id?: string;
    post_id?: string;
    comment_source?: 'page' | 'group';
    permalink_url?: string | null;
    from_name?: string | null;
  } | null;
}

/**
 * Persists a lead from an approved Community artifact into PostgreSQL leads table (TQ-05 / W2).
 */
/**
 * An approved grounded reply to a Messenger, Telegram, or Facebook Comment inquiry is queued for the worker.
 * Escalations without recipient or disabled auto-reply comments are left for human handling.
 */
async function queueDirectReply(
  client: PoolClient,
  workspaceId: string,
  message: DirectMessage,
  artifactId: string,
  result: { reply?: string; status?: string; escalation_required?: boolean; missing_facts?: string[]; lead_proposal?: unknown },
) {
  let settings: {
    group_url?: string | null;
    auto_reply_comments?: boolean | null;
    auto_invite_enabled?: boolean | null;
    daily_invite_limit?: number | null;
  } | undefined;
  let alreadyInvited = false;
  let todayInviteCount = 0;

  try {
    await client.query('SAVEPOINT sp_queue_direct_settings');
    settings = (
      await client.query<{
        group_url?: string | null;
        auto_reply_comments?: boolean | null;
        auto_invite_enabled?: boolean | null;
        daily_invite_limit?: number | null;
      }>(
        `SELECT group_url, auto_reply_comments, auto_invite_enabled, daily_invite_limit
           FROM community_hub_settings WHERE workspace_id = $1 LIMIT 1`,
        [workspaceId],
      )
    ).rows[0];
    if (message.author_contact) {
      const logRes = (
        await client.query<{ invited_before: boolean; today_count: number }>(
          `SELECT
             EXISTS (
               SELECT 1 FROM community_invite_logs
                WHERE workspace_id = $1 AND target_ref = $2 AND status = 'invited'
             ) AS invited_before,
             (
               SELECT count(*)::int FROM community_invite_logs
                WHERE workspace_id = $1 AND status = 'invited' AND invited_at >= CURRENT_DATE
             ) AS today_count`,
          [workspaceId, message.author_contact],
        )
      ).rows[0];
      alreadyInvited = Boolean(logRes?.invited_before);
      todayInviteCount = Number(logRes?.today_count ?? 0);
    }
    await client.query('RELEASE SAVEPOINT sp_queue_direct_settings');
  } catch {
    await client.query('ROLLBACK TO SAVEPOINT sp_queue_direct_settings').catch(() => {});
  }

  if (message.platform === 'facebook_comment' && settings?.auto_reply_comments === false) {
    return;
  }

  const groupUrl = settings?.group_url?.trim() || 'https://www.facebook.com/groups/1134282109069209';
  const dailyCap = Math.max(10, Math.min(15, Number(settings?.daily_invite_limit ?? 12)));
  const canInviteToday = settings?.auto_invite_enabled !== false && !alreadyInvited && todayInviteCount < dailyCap;

  const isComment = message.platform === 'facebook_comment';
  const commentSource = message.metadata?.comment_source === 'group' ? 'group' : 'page';
  const commentId = message.metadata?.comment_id;
  const recipient = message.author_contact || (isComment && commentId ? `comment:${commentId}` : null);

  let text = result.reply?.trim();
  const groupFallback = `Chào bạn! Cảm ơn bạn đã bình luận và chia sẻ trong Cộng đồng. Hiện tại cẩm nang TripC đang cập nhật thêm thông tin chi tiết về chủ đề này — các thành viên và quản trị viên sẽ hỗ trợ thêm cho bạn ngay bên dưới nhé!`;
  const pageFallback = `Chào bạn! Cảm ơn bạn đã liên hệ TripC. Hiện tại cẩm nang của chúng tôi đang liên tục cập nhật thêm dữ liệu về chủ đề này. Bạn có thể tham gia thảo luận cùng người dân địa phương và cộng đồng tại nhóm Facebook của chúng tôi: ${groupUrl} để nhận được gợi ý nhanh nhất nhé!`;
  if (!text || text.includes("The verified information needed for this question is unavailable") || text.includes("A human needs to review it")) {
    text = isComment && commentSource === 'group' ? groupFallback : pageFallback;
  }

  if (!recipient) {
    await client.query(
      `UPDATE community_messages SET status = 'escalated', updated_at = NOW() WHERE workspace_id = $1 AND id = $2 AND status IN ('received', 'queued')`,
      [workspaceId, message.id],
    );
    return;
  }

  // Only on Fanpage comments do we attach an invite link to join the Facebook Group; users in Group are already members.
  let outboxText = text;
  if (isComment && commentSource === 'page' && canInviteToday && !outboxText.includes('facebook.com/groups/')) {
    outboxText = `${outboxText}\n\n👉 Mời bạn tham gia Cộng đồng Du lịch & Sống tại Việt Nam để hỏi đáp thêm kinh nghiệm thực tế: ${groupUrl}`;
  }

  await client.query(
    `INSERT INTO outbox_events (workspace_id, event_type, dedup_key, payload) VALUES ($1, 'community.reply', $2, $3)
     ON CONFLICT (workspace_id, dedup_key) DO UPDATE SET payload = EXCLUDED.payload, status = 'pending', retry_count = 0, published_at = NULL`,
    [workspaceId, `community-reply:${message.id}`,
      JSON.stringify({
        message_id: message.id,
        artifact_id: artifactId,
        recipient,
        text: outboxText,
        platform: message.platform,
        business_connection_id: message.metadata?.business_connection_id,
        ...(isComment ? {
          comment_id: commentId,
          comment_source: commentSource,
          post_url: message.metadata?.permalink_url || message.post_url || null,
          author_name: message.metadata?.from_name || message.author_name || null,
          question_snippet: message.content ? message.content.slice(0, 140) : null,
          comment_snippet: message.content ? message.content.slice(0, 140) : null,
          invite_group_url: commentSource === 'page' && canInviteToday ? groupUrl : null,
          should_private_invite: commentSource === 'page' && Boolean(commentId) && canInviteToday,
        } : {}),
      })],
  );
}

export async function persistCommunityLead(
  client: PoolClient,
  workspaceId: string,
  artifactId: string,
  actorId: string,
  options: { consentVerified?: boolean } = {},
): Promise<string | null> {
  const artifactRow = (
    await client.query<{
      id: string;
      role: string;
      task_id: string;
      payload: {
        result?: {
          lead_proposal?: LeadProposal | null;
          reply?: string;
        };
      };
    }>(
      `SELECT id, role, task_id, payload FROM content_artifacts WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, artifactId],
    )
  ).rows[0];

  if (!artifactRow || artifactRow.role !== 'community') return null;

  const direct = artifactRow.task_id ? (await client.query<DirectMessage>(
    `SELECT id, platform, author_contact, author_name, post_url, content, metadata FROM community_messages WHERE workspace_id = $1 AND task_id = $2 AND (platform IN ('facebook_message', 'telegram_message') OR platform = 'facebook_comment') LIMIT 1`,
    [workspaceId, artifactRow.task_id],
  )).rows[0] : undefined;
  if (direct) await queueDirectReply(client, workspaceId, direct, artifactId, artifactRow.payload?.result ?? {});

  const proposal = artifactRow.payload?.result?.lead_proposal;
  if (!proposal) {
    // If no lead proposal was generated (e.g. pure informational reply), mark the linked message as
    // replied upon approval; a direct message is marked only once the worker has sent the reply.
    if (artifactRow.task_id && !direct) {
      await client.query(
        `UPDATE community_messages SET status = 'replied', updated_at = NOW()
         WHERE workspace_id = $1 AND task_id = $2 AND status IN ('received', 'queued')`,
        [workspaceId, artifactRow.task_id],
      );
    }
    return null;
  }

  // Check if community message is linked to this task
  const msgRow = (
    await client.query<{
      id: string;
      author_name: string;
      author_contact: string | null;
      content: string;
    }>(
      `SELECT id, author_name, author_contact, content FROM community_messages WHERE workspace_id = $1 AND task_id = $2 LIMIT 1`,
      [workspaceId, artifactRow.task_id],
    )
  ).rows[0];

  const contactEmail =
    proposal.contact?.email ||
    (msgRow?.author_contact?.includes('@') ? msgRow.author_contact : null) ||
    `community.${artifactId.slice(0, 8)}@tripc.internal`;

  const contactName = msgRow?.author_name || 'Community Member';
  // A direct message's author_contact is a platform user id, not a phone number.
  const phoneNumber =
    proposal.contact?.phone ||
    (!direct && !msgRow?.author_contact?.includes('@') ? msgRow?.author_contact : null);

  const interestTopic = 'Housing & Community Consultation';
  const notes = `Lead originated from Community inquiry: "${(msgRow?.content || 'Community question').slice(0, 200)}". Reply draft: "${(artifactRow.payload?.result?.reply || '').slice(0, 200)}"`;

  const idempotencyKey = `community-lead-${artifactId}`;
  const payloadHash = createHash('sha256')
    .update(JSON.stringify({ contactEmail, contactName, phoneNumber, idempotencyKey }))
    .digest('hex');

  const leadId = randomUUID();

  const insertRes = await client.query<{ lead_id: string }>(
    `INSERT INTO leads (
      lead_id, workspace_id, site_id, idempotency_key, payload_hash,
      contact_email, contact_name, phone_number, interest_topic,
      consent_accepted, consent_policy_version, utm_source, utm_medium,
      utm_campaign, lead_status, lead_owner, notes, context
    ) VALUES (
      $1, $2, 'tripc', $3, $4,
      $5, $6, $7, $8,
      $12, $13, 'community', 'social_comment',
      'expat_inquiry', 'New', $9, $10,
      $11
    ) ON CONFLICT (workspace_id, idempotency_key) DO UPDATE
      SET updated_at = NOW()
    RETURNING lead_id`,
    [
      leadId,
      workspaceId,
      idempotencyKey,
      payloadHash,
      contactEmail,
      contactName,
      phoneNumber,
      interestTopic,
      actorId,
      notes,
      JSON.stringify({
        artifact_id: artifactId,
        task_id: artifactRow.task_id,
        intent: proposal.intent,
      }),
      // A person's approval is the consent check; the scheduler has only the customer's own message.
      options.consentVerified !== false,
      options.consentVerified !== false ? 'community-consent-v1' : 'community-unverified',
    ],
  );

  const savedLeadId = insertRes.rows[0]?.lead_id || leadId;

  // Link to community message if present
  if (msgRow) {
    // Direct messages become 'replied' only after the worker has actually sent the reply.
    await client.query(
      direct
        ?`UPDATE community_messages SET lead_id = $3, updated_at = NOW() WHERE workspace_id = $1 AND id = $2`
        : `UPDATE community_messages SET lead_id = $3, status = 'replied', updated_at = NOW() WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, msgRow.id, savedLeadId],
    );
  }

  return savedLeadId;
}
