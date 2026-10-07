import { describe, it, expect } from 'vitest';
import { computeRetry, DEFAULT_RETRY_POLICY } from '../src/jobs/RetryPolicy';

const job = (over: Partial<{ attempt: number; max_attempts: number; deadline: Date }> = {}) => ({
  attempt: over.attempt ?? 1,
  max_attempts: over.max_attempts ?? 50,
  deadline: over.deadline ?? new Date(Date.now() + 60_000),
});

describe('computeRetry (W1-MY-01 retry policy)', () => {
  it('lên lịch retry với exponential backoff có cap', () => {
    const d1 = computeRetry(job({ attempt: 1 }));
    expect(d1).toMatchObject({ shouldRetry: true, reason: 'scheduled', delayMs: 1_000, nextAttempt: 2 });

    const d2 = computeRetry(job({ attempt: 2 }));
    expect(d2.delayMs).toBe(2_000);

    const d3 = computeRetry(job({ attempt: 3 }));
    expect(d3.delayMs).toBe(4_000);

    // cap: attempt lớn → maxDelayMs
    const dBig = computeRetry(job({ attempt: 20 }));
    expect(dBig.delayMs).toBe(DEFAULT_RETRY_POLICY.maxDelayMs);
  });

  it('dừng ở max_attempts', () => {
    const d = computeRetry(job({ attempt: 3, max_attempts: 3 }));
    expect(d).toMatchObject({ shouldRetry: false, reason: 'max_attempts_reached', delayMs: 0 });
  });

  it('dừng khi quá deadline tuyệt đối', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const past = new Date('2025-12-31T23:00:00Z');
    const d = computeRetry(job({ deadline: past }), {}, {}, now);
    expect(d).toMatchObject({ shouldRetry: false, reason: 'deadline_exceeded' });
  });

  it('lỗi permanent không retry', () => {
    const d = computeRetry(job({ attempt: 1 }), { permanent: true });
    expect(d).toMatchObject({ shouldRetry: false, reason: 'permanent_error' });
  });

  it('tôn trọng policy custom', () => {
    const d = computeRetry(job({ attempt: 1 }), {}, { baseDelayMs: 50, backoffFactor: 3, maxDelayMs: 60 });
    expect(d.delayMs).toBe(50);
    const d2 = computeRetry(job({ attempt: 2 }), {}, { baseDelayMs: 50, backoffFactor: 3, maxDelayMs: 60 });
    expect(d2.delayMs).toBe(60); // 150 bị cap về 60
  });
});