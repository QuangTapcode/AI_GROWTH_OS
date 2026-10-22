/**
 * Feedback event scheduler — creates tasks from metrics/lead/approval events (preparation for MY-07).
 *
 * Independent of other pending tasks. Defines event types, dedup keys, and scheduling config.
 * When MY-06 and QQ-06 are ready, this integrates with the workflow runner to enqueue
 * tasks for the next growth loop iteration.
 */

export type FeedbackEventType =
  | 'metrics_synced'
  | 'lead_created'
  | 'approval_changed'
  | 'publication_completed'
  | 'source_revoked'
  | 'retry_exceeded';

export interface FeedbackEvent {
  eventType: FeedbackEventType;
  workspaceId: string;
  payload: Record<string, unknown>;
  dedupKey: string;
  maxIterations?: number;
  reason?: string;
  createdAt: Date;
}

export interface SchedulerConfig {
  maxIterations: number;
  costCapUsd: number;
  dedupWindowHours: number;
}

export const defaultSchedulerConfig: SchedulerConfig = {
  maxIterations: 5,
  costCapUsd: 0, // Paid-provider budget default 0 USD (CR-002)
  dedupWindowHours: 1,
}

export class FeedbackEventScheduler {
  private emittedEvents = new Set<string>(); // dedup keys already processed

  /**
   * Create a feedback event with dedup key. Returns null if duplicate within window.
   */
  createEvent(
    eventType: FeedbackEventType,
    workspaceId: string,
    payload: Record<string, unknown>,
    config: Partial<SchedulerConfig> = {}
  ): FeedbackEvent | null {
    const cfg = { ...defaultSchedulerConfig, ...config };
    const dedupKey = `${eventType}:${workspaceId}:${this.hashPayload(payload)}`;

    if (this.emittedEvents.has(dedupKey)) {
      return null; // Duplicate event within window — skip
    }

    this.emittedEvents.add(dedupKey);

    return {
      eventType,
      workspaceId,
      payload,
      dedupKey,
      maxIterations: cfg.maxIterations,
      createdAt: new Date(),
    };
  }

  /**
   * Check if a task loop should continue based on iteration count and cost cap.
   * Missing metrics must NOT fabricate conclusions (CR-002).
   */
  shouldContinueLoop(iteration: number, costUsd: number, config: SchedulerConfig): boolean {
    if (iteration >= config.maxIterations) {
      return false;
    }
    if (config.costCapUsd > 0 && costUsd >= config.costCapUsd) {
      return false;
    }
    return true;
  }

  /**
   * Build event for Growth Lead to analyze and propose next tasks.
   * If metrics are missing, event carries 'insufficient_data' label — Growth Lead
   * must not fabricate conclusions.
   */
  buildGrowthLeadAnalysisEvent(
    workspaceId: string,
    metrics: { source: string; dataStatus: string; value?: number }[],
    leadsCount: number
  ): FeedbackEvent | null {
    const hasMissing = metrics.some((m) => m.dataStatus === 'insufficient_data');
    return this.createEvent(
      'metrics_synced',
      workspaceId,
      {
        metrics,
        leadsCount,
        missingData: hasMissing,
        recommendation: hasMissing
          ? 'Insufficient metrics — Growth Lead must not fabricate conclusions'
          : 'Proceed with analysis',
      },
      { maxIterations: 3 }
    );
  }

  private hashPayload(payload: Record<string, unknown>): string {
    const str = JSON.stringify(payload, Object.keys(payload).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

export const feedbackEventScheduler = new FeedbackEventScheduler();