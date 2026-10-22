import type { Pool } from 'pg';
import { createGatewayCheck } from './GatewayRecheckClient.js';
import { defaultRegistry } from './CmsPublisher.js';
import { PublishJobProcessor, type PublishContext } from './PublishJobProcessor.js';

type PublishChannel = PublishContext['channel'];

/**
 * Durable consumer for API `publishing.scheduled` outbox events.
 * It is intentionally independent from AI task queues: an approved artifact
 * can be published even when no model job is running.
 */
export class PublishingOutboxRunner {
  private readonly processor = new PublishJobProcessor(defaultRegistry);

  constructor(private readonly pool: Pool) {}

  async runOnce(): Promise<'idle' | 'published' | 'deferred' | 'failed'> {
    const claimed = await this.pool.query<{ id: string; payload: Record<string, unknown> }>(`
      WITH candidate AS (
        SELECT id FROM outbox_events
         WHERE event_type = 'publishing.scheduled' AND status = 'pending'
         ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE outbox_events o SET status = 'processing', retry_count = retry_count + 1
       FROM candidate c WHERE o.id = c.id
       RETURNING o.id, o.payload`);
    const event = claimed.rows[0];
    if (!event) return 'idle';

    const jobId = typeof event.payload?.job_id === 'string' ? event.payload.job_id : null;
    if (!jobId) return this.failEvent(event.id, null, 'PUBLISH_JOB_ID_MISSING');

    const jobResult = await this.pool.query<{
      id: string; workspace_id: string; content_id: string; approval_id: string | null;
      scheduled_for: string; status: string; mode: string; body_markdown: string | null; content_title: string;
      artifact_id: string | null; artifact_version: number | null; content_hash: string | null;
      artifact_payload: Record<string, unknown> | null; platform_name: string;
      channel_identifier: string | null; utm_url: string | null;
    }>(`
      SELECT j.id, j.workspace_id, j.content_id, j.approval_id, j.scheduled_for, j.status,
             c.body_markdown, c.title AS content_title, j.artifact_id,
             a.version AS artifact_version, a.content_hash, a.payload AS artifact_payload,
             ch.platform_name, ch.channel_identifier, j.utm_url
        FROM publishing_jobs j
        JOIN contents c ON c.id = j.content_id AND c.workspace_id = j.workspace_id
        JOIN channels ch ON ch.id = j.channel_id AND ch.workspace_id = j.workspace_id
        LEFT JOIN content_artifacts a ON a.id = j.artifact_id
       WHERE j.id = $1 AND j.workspace_id = (SELECT workspace_id FROM outbox_events WHERE id = $2)`,
      [jobId, event.id]);
    const job = jobResult.rows[0];
    if (!job) return this.failEvent(event.id, null, 'PUBLISH_JOB_NOT_FOUND');
    if (job.status === 'cancelled' || job.status === 'published') return this.completeEvent(event.id);

    const scheduledAt = new Date(job.scheduled_for);
    if (scheduledAt.getTime() > Date.now()) {
      await this.pool.query(`UPDATE outbox_events SET status = 'pending', retry_count = GREATEST(retry_count - 1, 0) WHERE id = $1`, [event.id]);
      return 'deferred';
    }

    // A disconnected channel is deliberately scheduled in manual mode. The
    // event has been consumed, but the publishing job must remain scheduled so
    // the operator can post it manually and then use “Mark published” in the
    // Distribution UI. Do not call an unavailable provider or turn this into a
    // false failure.
    if (job.mode === 'manual') {
      await this.pool.query(`UPDATE outbox_events SET status = 'published', published_at = NOW() WHERE id = $1`, [event.id]);
      return 'published';
    }

    const channel = toPublishChannel(job.platform_name);
    if (!channel || !job.artifact_version || !job.content_hash) return this.failEvent(event.id, job.id, 'PUBLISH_ARTIFACT_MISSING');
    await this.pool.query(`UPDATE publishing_jobs SET status = 'publishing' WHERE id = $1 AND status = 'scheduled'`, [job.id]);

    const payload = job.artifact_payload ?? {};
    const gatewayCheck = createGatewayCheck();
    const result = await this.processor.publish({
      jobId: job.id,
      workspaceId: job.workspace_id,
      contentId: job.content_id,
      channel,
      scheduledAt,
      idempotencyKey: `publish:${job.workspace_id}:${job.content_id}:${channel}:${job.artifact_version}`,
      bodyMarkdown: job.body_markdown ?? '',
      metaTitle: job.content_title,
      linkUrl: job.utm_url ?? undefined,
      mediaUrl: asString(payload.media_url ?? payload.mediaUrl),
      mediaType: asMediaType(payload.media_type ?? payload.mediaType),
      expectedVersion: job.artifact_version,
      contentHash: job.content_hash,
      approvalId: job.approval_id ?? undefined,
      ...(gatewayCheck ? { gatewayCheck } : {}),
    });
    if (!result.success) return this.failEvent(event.id, job.id, result.errorCode ?? 'PUBLISH_FAILED', result.errorMessage);

    await this.pool.query(
      `UPDATE publishing_jobs SET status = 'published', published_at = COALESCE($2, NOW()), external_post_id = $3, error_message = NULL WHERE id = $1;
       UPDATE contents SET status = 'published', published_at = COALESCE($2, NOW()) WHERE id = $4`,
      [job.id, result.publishedAt ?? new Date(), result.externalPostId ?? null, job.content_id],
    );
    await this.pool.query(`UPDATE outbox_events SET status = 'published', published_at = NOW() WHERE id = $1`, [event.id]);
    return 'published';
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
  const map: Record<string, PublishChannel> = { website: 'Website', facebook: 'Facebook', tiktok: 'TikTok', instagram: 'Instagram', email: 'Newsletter' };
  return map[platform] ?? null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asMediaType(value: unknown): 'video' | 'image' | undefined {
  return value === 'video' || value === 'image' ? value : undefined;
}
