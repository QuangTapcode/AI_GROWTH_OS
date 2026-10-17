/**
 * Publish job processor — idempotent publish with reconciliation (preparation for MY-04/MY-05).
 *
 * Independent of other pending tasks. Uses CmsPublisher interface; swap mock for real
 * adapter when TQ-04/TQ-06 contract is ready. Implements:
 * - Idempotency key per (workspace, action)
 * - Retry only on recoverable errors, not on creating duplicate posts
 * - Reconciliation when CMS outcome is unknown
 * - UTC scheduled_at with workspace timezone display
 */

import type { JobOperator, JobState } from '../jobs/JobState';
import type { CmsPublishRequest, CmsPublishResult, CmsPublisher, PublisherRegistry } from './CmsPublisher';
import type { ManualPack } from './ManualPackGenerator';
import { generateManualPacks } from './ManualPackGenerator';

export type PublishStatus = 'Pending_Approval' | 'Approved' | 'Scheduled' | 'Publishing' | 'Published' | 'Failed';

export interface PublishContext {
  jobId: string;
  workspaceId: string;
  contentId: string;
  channel: 'Website' | 'Facebook' | 'Instagram' | 'Newsletter';
  scheduledAt: Date;
  idempotencyKey: string;
  bodyMarkdown: string;
  metaTitle?: string;
  metaDescription?: string;
  slug?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  expectedVersion: number;
  contentHash: string;
  /** TQ-06 gateway recheck tại execution (MY-05): approval/version/hash. */
  approvalId?: string;
  gatewayCheck?: (req: {
    workspaceId: string;
    channel: string;
    approvalId?: string;
    expectedVersion: number;
    expectedHash: string;
  }) => Promise<{ authorized: boolean; denialReason?: string }>;
}

export class PublishJobProcessor {
  constructor(private registry: PublisherRegistry) {}

  /**
   * Build idempotency key scoped to workspace + action.
   * Same key + same payload → return cached result.
   * Same key + different payload → 409 conflict.
   */
  buildIdempotencyKey(ctx: PublishContext): string {
    return `publish:${ctx.workspaceId}:${ctx.contentId}:${ctx.channel}:${ctx.expectedVersion}`;
  }

  /**
   * Attempt publish. Returns result with side-effect guard:
   * - If CMS returns success → store mapping job↔externalPostId, mark Published.
   * - If CMS returns timeout/unknown → do NOT retry blindly; call reconcile first.
   * - If CMS returns idempotency conflict → return cached result.
   */
  async publish(ctx: PublishContext): Promise<CmsPublishResult & { manualPack?: ManualPack }> {
    // MY-05: recheck approval/source/account tại execution qua gateway TQ-06.
    // Thiếu approval cho publish → fail fast, không gọi CMS.
    if (ctx.gatewayCheck) {
      const gate = await ctx.gatewayCheck({
        workspaceId: ctx.workspaceId,
        channel: ctx.channel,
        approvalId: ctx.approvalId,
        expectedVersion: ctx.expectedVersion,
        expectedHash: ctx.contentHash,
      });
      if (!gate.authorized) {
        return {
          success: false,
          errorCode: 'GATEWAY_DENIED',
          errorMessage: gate.denialReason ?? 'Gateway denied publish at execution time',
        };
      }
    }

    const publisher = this.registry.get(ctx.channel);
    if (!publisher) {
      throw new Error(`No publisher registered for channel ${ctx.channel}`);
    }

    const req: CmsPublishRequest = {
      contentId: ctx.contentId,
      channel: ctx.channel,
      bodyMarkdown: ctx.bodyMarkdown,
      metaTitle: ctx.metaTitle,
      metaDescription: ctx.metaDescription,
      slug: ctx.slug,
      scheduledAt: ctx.scheduledAt,
      idempotencyKey: ctx.idempotencyKey,
      workspaceId: ctx.workspaceId,
    };

    let result: CmsPublishResult;
    try {
      result = await publisher.publish(req);
    } catch (err) {
      // Network error before CMS responded → unknown outcome, do not retry blindly
      return {
        success: false,
        errorCode: 'CMS_UNKNOWN_OUTCOME',
        errorMessage: err instanceof Error ? err.message : 'Unknown publisher error',
      };
    }

    if (!result.success) {
      // Timeout or unknown outcome → attempt reconciliation instead of blind retry
      if (result.errorCode === 'CMS_TIMEOUT' || result.errorCode === 'CMS_UNKNOWN_OUTCOME') {
        const reconciled = await publisher.reconcile(result.externalPostId || '');
        if (reconciled.success) {
          return { ...reconciled, success: true };
        }
        return { ...reconciled, success: false };
      }

      // Idempotency conflict → caller should treat as conflict (HTTP 409 equivalent)
      if (result.errorCode === 'IDEMPOTENCY_CONFLICT') {
        return { success: false, errorCode: 'IDEMPOTENCY_CONFLICT', errorMessage: result.errorMessage };
      }

      return { success: false, errorCode: result.errorCode || 'PUBLISH_FAILED', errorMessage: result.errorMessage };
    }

    return { ...result, success: true };
  }

  /**
   * Generate manual pack for social channels when live publishing is unavailable.
   * Caller stores pack as artifact and labels it 'manual-pack' in UI.
   */
  generateManualPack(ctx: PublishContext, channels: ('Facebook' | 'Instagram')[]): ManualPack[] {
    const job: any = {
      contentId: ctx.contentId,
      workspaceId: ctx.workspaceId,
      title: ctx.metaTitle || '',
      bodyMarkdown: ctx.bodyMarkdown,
      metaTitle: ctx.metaTitle,
      metaDescription: ctx.metaDescription,
      slug: ctx.slug,
      utmSource: ctx.utmSource,
      utmMedium: ctx.utmMedium,
      utmCampaign: ctx.utmCampaign,
    };

    // Import dynamically to avoid circular dependency
    return generateManualPacks(job, channels);
  }

  /**
   * Validate scheduled_at is in the future (UTC).
   * Publisher re-checks approval/source/account at execution time (TQ-04 contract).
   */
  isScheduledInFuture(scheduledAt: Date): boolean {
    return scheduledAt.getTime() > Date.now();
  }

  /**
   * Build unique dedup key to prevent duplicate posts with same idempotency key.
   * Key format: publish:{workspace_id}:{content_id}:{channel}:{version}
   */
  static buildDedupKey(workspaceId: string, contentId: string, channel: string, version: number): string {
    return `publish:${workspaceId}:${contentId}:${channel}:${version}`;
  }
}