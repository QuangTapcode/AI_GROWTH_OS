/**
 * Tests for ReconciliationService — independent, mock-based (preparation for MY-05).
 * Run: npm test (vitest)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReconciliationService } from '../../reconcile/ReconciliationService';

describe('ReconciliationService', () => {
  let service: ReconciliationService;

  beforeEach(() => {
    service = new ReconciliationService();
  });

  it('should prevent duplicate when idempotency key already succeeded', async () => {
    const known = new Map<string, { externalPostId: string }>([
      ['key_1', { externalPostId: 'post_1' }],
    ]);
    const result = await service.reconcile(
      { id: 'job_1', externalPostId: 'post_1', idempotencyKey: 'key_1' },
      async () => ({ exists: false }),
      known
    );
    expect(result.status).toBe('duplicate_prevented');
    expect(result.actionTaken).toBe('retry_blocked');
    expect(result.reason).toContain('Idempotency key already');
  });

  it('should confirm published when CMS confirms post exists', async () => {
    const result = await service.reconcile(
      { id: 'job_2', externalPostId: 'post_2' },
      async () => ({ exists: true, url: 'https://tripc.vn/post/2' }),
      new Map()
    );
    expect(result.status).toBe('confirmed_published');
    expect(result.actionTaken).toBe('reconciled');
    expect(result.publishedUrl).toBe('https://tripc.vn/post/2');
  });

  it('should allow retry when CMS confirms post does not exist', async () => {
    const result = await service.reconcile(
      { id: 'job_3', externalPostId: 'post_3' },
      async () => ({ exists: false }),
      new Map()
    );
    expect(result.status).toBe('retry_allowed');
    expect(result.actionTaken).toBe('retry_allowed');
  });

  it('should block retry when no externalPostId and unknown outcome', async () => {
    const result = await service.reconcile(
      { id: 'job_4' },
      async () => ({ exists: false }),
      new Map()
    );
    expect(result.status).toBe('still_unknown');
    expect(result.actionTaken).toBe('retry_blocked');
  });

  it('should identify recoverable vs non-recoverable errors', () => {
    expect(service.isRecoverableError('CMS_TIMEOUT')).toBe(true);
    expect(service.isRecoverableError('NETWORK_ERROR')).toBe(true);
    expect(service.isRecoverableError('IDEMPOTENCY_CONFLICT')).toBe(false);
    expect(service.isRecoverableError('UNAUTHORIZED')).toBe(false);
    expect(service.isRecoverableError('VERSION_CONFLICT')).toBe(false);
  });

  it('should check retry cap exceeded', () => {
    expect(service.isRetryExceeded({ retryCount: 2 } as any, 2)).toBe(true);
    expect(service.isRetryExceeded({ retryCount: 1 } as any, 2)).toBe(false);
  });

  it('should format UTC ISO correctly', () => {
    const date = new Date('2026-10-15T08:00:00Z');
    const iso = service.toUtcIso(date);
    expect(iso).toBe('2026-10-15T08:00:00.000Z');
  });
});