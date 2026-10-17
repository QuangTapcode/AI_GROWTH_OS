/**
 * Tests for FeedbackEventScheduler — independent, mock-based (preparation for MY-07).
 * Run: npm test (vitest)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FeedbackEventScheduler, defaultSchedulerConfig } from '../FeedbackEventScheduler';

describe('FeedbackEventScheduler', () => {
  let scheduler: FeedbackEventScheduler;

  beforeEach(() => {
    scheduler = new FeedbackEventScheduler();
  });

  it('should create a feedback event with dedup key', () => {
    const event = scheduler.createEvent(
      'lead_created',
      'ws_1',
      { leadId: 'lead_1', contactEmail: 'a@b.com' }
    );
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe('lead_created');
    expect(event!.workspaceId).toBe('ws_1');
    expect(event!.dedupKey).toContain('lead_created:ws_1:');
  });

  it('should skip duplicate event within dedup window', () => {
    const first = scheduler.createEvent('lead_created', 'ws_1', { leadId: 'lead_1' });
    const second = scheduler.createEvent('lead_created', 'ws_1', { leadId: 'lead_1' });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it('should allow different events for same workspace', () => {
    const e1 = scheduler.createEvent('lead_created', 'ws_1', { leadId: 'lead_1' });
    const e2 = scheduler.createEvent('approval_changed', 'ws_1', { contentId: 'c1' });
    expect(e1).not.toBeNull();
    expect(e2).not.toBeNull();
    expect(e1!.dedupKey).not.toBe(e2!.dedupKey);
  });

  it('should enforce max iterations', () => {
    expect(scheduler.shouldContinueLoop(0, 0, defaultSchedulerConfig)).toBe(true);
    expect(scheduler.shouldContinueLoop(5, 0, defaultSchedulerConfig)).toBe(false);
  });

  it('should enforce cost cap', () => {
    const config = { ...defaultSchedulerConfig, costCapUsd: 10 };
    expect(scheduler.shouldContinueLoop(0, 5, config)).toBe(true);
    expect(scheduler.shouldContinueLoop(0, 10, config)).toBe(false);
  });

  it('should flag missing metrics in growth lead analysis', () => {
    const event = scheduler.buildGrowthLeadAnalysisEvent('ws_1', [
      { source: 'ga4', dataStatus: 'insufficient_data' },
      { source: 'gsc', dataStatus: 'active', value: 100 },
    ], 5);
    expect(event).not.toBeNull();
    expect(event!.payload.missingData).toBe(true);
    expect(event!.payload.recommendation).toContain('Insufficient metrics');
  });

  it('should not flag missing metrics when all active', () => {
    const event = scheduler.buildGrowthLeadAnalysisEvent('ws_1', [
      { source: 'ga4', dataStatus: 'active', value: 100 },
      { source: 'gsc', dataStatus: 'active', value: 50 },
    ], 3);
    expect(event!.payload.missingData).toBe(false);
  });
});