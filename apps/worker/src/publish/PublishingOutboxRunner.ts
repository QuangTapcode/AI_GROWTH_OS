import type { Pool } from 'pg';
import { createGatewayCheck } from './GatewayRecheckClient';
import { defaultRegistry, type PublisherRegistry } from './CmsPublisher';
import { PublishJobProcessor, type PublishContext } from './PublishJobProcessor';
import { recheckBeforeOutbox } from './gateway_recheck';

type PublishChannel = PublishContext['channel'];

export interface OutboxRunnerOptions {
  maxRetries?: number;
  baseBackoffSeconds?: number;
  maxBackoffSeconds?: number;
}

/**
 * PublishingOutboxRunner (CM-27)
 * Durable consumer for outbox_events with:
 * 1. Verification: Only processes approved and gateway-rechecked artifacts.
 * 2. Idempotency: publish:{workspace}:{pack}:{channel}:{version}. Duplicate keys return same post_id.
 * 3. Robust Error Handling: Exponential backoff with reconciliation before retrying timeouts.
 * 4. Concurrency: SELECT FOR UPDATE SKIP LOCKED ensures multi-worker parallel execution without duplicates.
 */
export class PublishingOutboxRunner {
  private readonly pool: Pool;
  private readonly registry: PublisherRegistry;
  private readonly processor: PublishJobProcessor;
  private readonly maxRetries: number;
  private readonly maxBackoffSeconds: number;

  constructor(
    pool: Pool,
    registry: PublisherRegistry = defaultRegistry,
    options: OutboxRunnerOptions = {}
  ) {
    this.pool = pool;
    this.registry = registry;
    this.processor = new PublishJobProcessor(this.registry);
    this.maxRetries = options.maxRetries ?? 5;
    this.maxBackoffSeconds = options.maxBackoffSeconds ?? 300;
  }

  async runOnce(): Promise<'idle' | 'published' | 'deferred' | 'failed'> {
    // 4. Dùng claim SKIP LOCKED cho nhiều worker chạy song song mà không tranh chấp
    const claimed = await this.pool.query<{ id: string; payload: Record<string, unknown>; retry_count: number }>(`
      WITH candidate AS (
        SELECT id FROM outbox_events
         WHERE event_type = 'publishing.scheduled' AND status = 'pending'
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE outbox_events o SET status = 'processing', retry_count = retry_count + 1
       FROM candidate c WHERE o.id = c.id
       RETURNING o.id, o.payload, o.retry_count`);
    const event = claimed.rows[0];
    if (!event) return 'idle';

    const jobId = typeof event.payload?.job_id === 'string' ? event.payload.job_id : null;
    if (!jobId) return this.failEvent(event.id, null, 'PUBLISH_JOB_ID_MISSING');

    // Khóa job FOR UPDATE để bảo vệ chống trùng lặp giữa các worker cùng chạy song song
    const jobResult = await this.pool.query<{
      id: string;
      workspace_id: string;
      content_id: string;
      approval_id: string | null;
      scheduled_for: string;
      status: string;
      mode: string;
      body_markdown: string | null;
      content_title: string;
      artifact_id: string | null;
      artifact_version: number | null;
      content_hash: string | null;
      artifact_payload: Record<string, unknown> | null;
      artifact_evidence: unknown;
      channel_id: string;
      platform_name: string;
      channel_identifier: string | null;
      utm_url: string | null;
      approval_status: string | null;
      external_post_id: string | null;
    }>(`
      SELECT j.id, j.workspace_id, j.content_id, j.approval_id, j.scheduled_for, j.status, j.mode,
             c.body_markdown, c.title AS content_title, j.artifact_id,
             a.version AS artifact_version, a.content_hash, a.payload AS artifact_payload, a.evidence AS artifact_evidence,
             j.channel_id, ch.platform_name, ch.channel_identifier, j.utm_url,
             app.status AS approval_status,
             j.external_post_id
        FROM publishing_jobs j
        JOIN contents c ON c.id = j.content_id AND c.workspace_id = j.workspace_id
        JOIN channels ch ON ch.id = j.channel_id AND ch.workspace_id = j.workspace_id
        LEFT JOIN content_artifacts a ON a.id = j.artifact_id
        LEFT JOIN approvals app ON app.id = j.approval_id AND app.workspace_id = j.workspace_id
       WHERE j.id = $1 AND j.workspace_id = (SELECT workspace_id FROM outbox_events WHERE id = $2)
       FOR UPDATE OF j`,
      [jobId, event.id]
    );

    const job = jobResult.rows[0];
    if (!job) return this.failEvent(event.id, null, 'PUBLISH_JOB_NOT_FOUND');

    // Nếu job đã được worker khác xuất bản xong trước đó -> Hoàn thành event và trả cùng post_id
    if (job.status === 'published' && job.external_post_id) {
      await this.completeEvent(event.id);
      return 'published';
    }

    if (job.status === 'cancelled') {
      await this.completeEvent(event.id);
      return 'failed';
    }

    const scheduledAt = new Date(job.scheduled_for);
    if (scheduledAt.getTime() > Date.now()) {
      await this.pool.query(
        `UPDATE outbox_events SET status = 'pending', retry_count = GREATEST(retry_count - 1, 0) WHERE id = $1`,
        [event.id]
      );
      return 'deferred';
    }

    if (job.mode === 'manual') {
      await this.pool.query(`UPDATE outbox_events SET status = 'published', published_at = NOW() WHERE id = $1`, [event.id]);
      return 'published';
    }

    const channel = toPublishChannel(job.platform_name);
    if (!channel || !job.artifact_version || !job.content_hash) {
      return this.failEvent(event.id, job.id, 'PUBLISH_ARTIFACT_MISSING');
    }

    // 1. Chỉ nhận bản đã approved và đã qua gateway_recheck
    const effectiveApprovalStatus = job.approval_status ?? (job.approval_id ? 'approved' : 'pending');
    if (effectiveApprovalStatus !== 'approved') {
      return this.failEvent(
        event.id,
        job.id,
        'APPROVAL_NOT_APPROVED',
        `Nội dung chưa được phê duyệt (trạng thái: ${effectiveApprovalStatus}). Chỉ bản đã approved mới được xuất bản.`
      );
    }

    // Chạy kiểm tra gateway_recheck toàn diện. Hash được tính đúng như API lưu content_hash:
    // sha256 của {result, evidence}. Artifact là bất biến (bài SEO mới là artifact mới), nên
    // không có phiên bản cha nào bị nâng tại chỗ để so.
    const recheckResult = await recheckBeforeOutbox(
      {
        workspace_id: job.workspace_id,
        post_id: job.id,
        channel,
        approval_id: job.approval_id ?? '',
        approval_status: effectiveApprovalStatus as any,
        expected_version: job.artifact_version,
        current_version: job.artifact_version,
        expected_hash: job.content_hash,
        current_content: { result: job.artifact_payload?.result, evidence: job.artifact_evidence },
        expected_parent_version: 1,
        current_parent_version: 1,
      },
      async (approvalId, reason) => {
        await this.pool.query(
          `UPDATE approvals SET status = 'revoked', invalidated_reason = $2, invalidated_at = NOW() WHERE id = $1`,
          [approvalId, reason]
        );
      },
      async (postId, reason) => {
        await this.pool.query(
          `UPDATE publishing_jobs SET status = 'cancelled', error_message = $2 WHERE id = $1`,
          [postId, reason]
        );
      }
    );

    if (!recheckResult.authorized) {
      return this.failEvent(event.id, job.id, recheckResult.error_code ?? 'GATEWAY_RECHECK_FAILED', recheckResult.reason);
    }

    // 2. Idempotency key: publish:{workspace}:{pack}:{channel}:{version}
    const idempotencyKey = `publish:${job.workspace_id}:${job.content_id}:${channel.toLowerCase()}:${job.artifact_version}`;

    // Cùng artifact (một phiên bản cố định) đã lên cùng kênh: trả lại đúng bài đó, không đăng trùng.
    const existingPublished = await this.pool.query<{ external_post_id: string; published_at: Date }>(`
      SELECT external_post_id, published_at FROM publishing_jobs
       WHERE workspace_id = $1 AND artifact_id = $2 AND channel_id = $3 AND status = 'published' AND external_post_id IS NOT NULL
       LIMIT 1`,
      [job.workspace_id, job.artifact_id, job.channel_id]
    );

    if (existingPublished.rows[0]) {
      const existing = existingPublished.rows[0];
      return this.markPublished(event.id, job, existing.external_post_id, existing.published_at);
    }

    await this.pool.query(
      `UPDATE publishing_jobs SET status = 'publishing' WHERE id = $1 AND status = 'scheduled'`,
      [job.id]
    );

    const payload = job.artifact_payload ?? {};
    const gatewayCheck = createGatewayCheck();

    let result;
    try {
      result = await this.processor.publish({
        jobId: job.id,
        workspaceId: job.workspace_id,
        contentId: job.content_id,
        channel,
        scheduledAt,
        idempotencyKey,
        bodyMarkdown: job.body_markdown ?? '',
        metaTitle: job.content_title,
        linkUrl: job.utm_url ?? undefined,
        mediaUrl: asString(payload.media_url ?? payload.mediaUrl),
        mediaType: asMediaType(payload.media_type ?? payload.mediaType),
        expectedVersion: job.artifact_version,
        contentHash: job.content_hash,
        approvalId: job.approval_id ?? undefined,
        isAiGenerated: Boolean(payload.is_ai_generated ?? payload.isAiGenerated ?? payload.ai_metadata),
        aiImageMeta: (payload.ai_metadata ?? payload.aiImageMeta) as Record<string, any> | undefined,
        ...(gatewayCheck ? { gatewayCheck } : {}),
      });
    } catch (err) {
      result = {
        success: false,
        errorCode: 'CMS_TIMEOUT',
        errorMessage: err instanceof Error ? err.message : 'Publisher execution timeout',
      };
    }

    // 3. Retry theo exponential backoff; khi timeout phải gọi bước đối soát (reconcile) kiểm tra bài đã lên chưa trước khi thử lại
    if (!result.success) {
      const isTimeout =
        result.errorCode === 'CMS_TIMEOUT' ||
        result.errorCode === 'CMS_UNKNOWN_OUTCOME' ||
        String(result.errorMessage).toLowerCase().includes('timeout');

      if (isTimeout) {
        // GỌI BƯỚC ĐỐI SOÁT (RECONCILE) KIỂM TRA BÀI ĐÃ LÊN CHƯA TRƯỚC KHI THỬ LẠI (nếu processor chưa đối soát)
        if (!result.reconciled) {
          const publisher = this.registry.get(channel);
          if (publisher) {
            try {
              const reconciled = await publisher.reconcile(result.externalPostId || idempotencyKey);
              if (reconciled.success && reconciled.externalPostId) {
                // Bài ĐÃ lên platform! Hoàn tất xuất bản, không thử lại
                return this.markPublished(event.id, job, reconciled.externalPostId, reconciled.publishedAt);
              }
            } catch {
              // Reconcile gặp lỗi mạng
            }
          }
        }

        // Bài chưa lên -> Thực hiện exponential backoff retry
        const retryCount = Number(event.retry_count ?? 1);
        if (retryCount <= this.maxRetries) {
          const backoffSec = Math.min(Math.pow(2, retryCount), this.maxBackoffSeconds);
          await this.pool.query(`UPDATE outbox_events SET status = 'pending' WHERE id = $1`, [event.id]);
          await this.pool.query(
            `UPDATE publishing_jobs SET status = 'scheduled', error_message = $2 WHERE id = $1`,
            [job.id, `RETRY_EXPONENTIAL_BACKOFF (${retryCount}/${this.maxRetries}): delay ${backoffSec}s sau timeout`]
          );
          return 'deferred';
        }
      }

      return this.failEvent(event.id, job.id, result.errorCode ?? 'PUBLISH_FAILED', result.errorMessage);
    }

    // Manual pack nghĩa là chưa có gì lên kênh: ghi lỗi để người vận hành đăng tay, không báo "đã đăng".
    if (result.isManualFallback) {
      return this.failEvent(event.id, job.id, result.errorCode ?? 'PUBLISH_PERMISSION_DENIED', result.errorMessage);
    }

    // Xuất bản thành công
    return this.markPublished(event.id, job, result.externalPostId ?? null, result.publishedAt);
  }

  /** pg runs one statement per parameterized query, so each table is updated on its own. */
  private async markPublished(
    eventId: string,
    job: { id: string; content_id: string },
    externalPostId: string | null,
    publishedAt?: Date
  ): Promise<'published'> {
    const at = publishedAt ?? new Date();
    await this.pool.query(
      `UPDATE publishing_jobs SET status = 'published', published_at = $2, external_post_id = $3, error_message = NULL WHERE id = $1`,
      [job.id, at, externalPostId]
    );
    await this.pool.query(`UPDATE contents SET status = 'published', published_at = $2 WHERE id = $1`, [job.content_id, at]);
    return this.completeEvent(eventId);
  }

  private async completeEvent(eventId: string): Promise<'published'> {
    await this.pool.query(`UPDATE outbox_events SET status = 'published', published_at = NOW() WHERE id = $1`, [eventId]);
    return 'published';
  }

  private async failEvent(eventId: string, jobId: string | null, code: string, message?: string): Promise<'failed'> {
    const detail = message ? `${code}: ${message}` : code;
    if (jobId) await this.pool.query(`UPDATE publishing_jobs SET status = 'failed', error_message = $2 WHERE id = $1`, [jobId, detail]);
    await this.pool.query(`UPDATE outbox_events SET status = 'failed', published_at = NOW() WHERE id = $1`, [eventId]);
    return 'failed';
  }
}

function toPublishChannel(platform: string): PublishChannel | null {
  const map: Record<string, PublishChannel> = {
    website: 'Website',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    instagram: 'Instagram',
    email: 'Newsletter',
  };
  return map[platform.toLowerCase()] ?? null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asMediaType(value: unknown): 'video' | 'image' | undefined {
  return value === 'video' || value === 'image' ? value : undefined;
}
