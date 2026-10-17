/**
 * Reconciliation service — scheduled publish verification (preparation for MY-05).
 *
 * Independent of other pending tasks. Implements:
 * - Reconcile publish jobs whose CMS outcome was unknown (timeout/retry).
 * - Prevent duplicate posts by checking idempotency marker/external ID before retry.
 * - Timeout-before-retry: do not create new post until CMS state is known.
 * - All timestamps stored in UTC; workspace timezone used for display only.
 */

import type { PublishJob } from '../jobs/JobState';

export interface ReconcileResult {
  jobId: string;
  externalPostId?: string;
  publishedUrl?: string;
  status: 'confirmed_published' | 'confirmed_failed' | 'still_unknown' | 'duplicate_prevented' | 'retry_allowed';
  actionTaken: 'none' | 'reconciled' | 'retry_allowed' | 'retry_blocked';
  reason: string;
}

export class ReconciliationService {
  /**
   * Reconcile a publish job after CMS timeout or unknown outcome.
   * Checks idempotency marker / external ID before allowing retry.
   *
   * Rules:
   * - If CMS confirms post exists → confirmed_published, no retry.
   * * If CMS confirms post does not exist → retry_allowed (safe to create new).
   * - If CMS still unknown → still_unknown, retry_blocked (wait longer).
   * - If same idempotency key already has a successful response → duplicate_prevented.
   */
  async reconcile(
    job: Pick<PublishJob, 'id'> & { externalPostId?: string; idempotencyKey?: string },
    cmsReconcile: (externalPostId: string) => Promise<{ exists: boolean; url?: string }>,
    knownSuccessResponses: Map<string, { externalPostId: string }>
  ): Promise<ReconcileResult> {
    // 1. Check if we already have a successful response for this idempotency key
    if (job.idempotencyKey && knownSuccessResponses.has(job.idempotencyKey)) {
      const cached = knownSuccessResponses.get(job.idempotencyKey)!;
      return {
        jobId: job.id,
        externalPostId: cached.externalPostId,
        status: 'duplicate_prevented',
        actionTaken: 'retry_blocked',
        reason: 'Idempotency key already has a successful response; duplicate post prevented.',
      };
    }

    // 2. If we have an externalPostId from previous attempt, ask CMS
    if (job.externalPostId) {
      const cmsState = await cmsReconcile(job.externalPostId);
      if (cmsState.exists) {
        return {
          jobId: job.id,
          externalPostId: job.externalPostId,
          publishedUrl: cmsState.url,
          status: 'confirmed_published',
          actionTaken: 'reconciled',
          reason: 'CMS confirms post exists; no retry needed.',
        };
      }
      // CMS says post does not exist → safe to retry
      return {
        jobId: job.id,
        externalPostId: job.externalPostId,
        status: 'retry_allowed',
        actionTaken: 'retry_allowed',
        reason: 'CMS confirms post does not exist; retry is safe.',
      };
    }

    // 3. No externalPostId and CMS outcome unknown → wait, do not create new post blindly
    return {
      jobId: job.id,
      status: 'still_unknown',
      actionTaken: 'retry_blocked',
      reason: 'No external post ID and CMS outcome unknown. Waiting for confirmation before retry.',
    };
  }

  /**
   * Check if a publish job has exceeded its retry budget.
   * Only recoverable errors should be retried; bad schema/missing facts need review.
   */
  isRetryExceeded(job: Pick<PublishJob, 'retryCount'>, maxRetries: number = 2): boolean {
    return (job.retryCount || 0) >= maxRetries;
  }

  /**
   * Determine if error is recoverable for retry.
   * Non-recoverable: bad schema, missing permissions, missing facts, idempotency conflict.
   * Recoverable: CMS timeout, network error, temporary 5xx.
   */
  isRecoverableError(errorCode: string): boolean {
    const nonRecoverable = [
      'INVALID_PAYLOAD',
      'IDEMPOTENCY_CONFLICT',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'VERSION_CONFLICT',
      'MISSING_FACTS',
      'APPROVAL_REVOKED',
    ];
    return !nonRecoverable.includes(errorCode);
  }

  /**
   * Format UTC timestamp for storage; workspace timezone for display.
   * Never use server local timezone to interpret scheduled time.
   */
  toUtcIso(date: Date): string {
    return date.toISOString();
  }

  /**
   * Parse workspace-aware scheduled time. Input is UTC string from API.
   */
  parseScheduledAt(utcIso: string): Date {
    return new Date(utcIso);
  }
}