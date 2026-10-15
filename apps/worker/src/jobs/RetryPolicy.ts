import type { JobState } from './JobState';

/**
 * Retry policy cho worker jobs (W1-MY-01).
 * - Exponential backoff có cap: base * factor^(attempt-1), khoá tại maxDelayMs.
 * - Dừng khi chạm max_attempts, quá deadline tuyệt đối, hoặc lỗi permanent.
 */
export interface RetryPolicyOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

export const DEFAULT_RETRY_POLICY: Required<RetryPolicyOptions> = {
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  backoffFactor: 2,
};

export type RetrySkipReason =
  | 'scheduled'
  | 'max_attempts_reached'
  | 'deadline_exceeded'
  | 'permanent_error';

export interface RetryDecision {
  shouldRetry: boolean;
  reason: RetrySkipReason;
  /** Delay trước lần chạy kế tiếp (ms) */
  delayMs: number;
  /** Attempt kế tiếp sẽ chạy (chỉ có nghĩa khi shouldRetry) */
  nextAttempt: number;
}

export function computeRetry(
  job: Pick<JobState, 'attempt' | 'max_attempts' | 'deadline'>,
  opts: { permanent?: boolean } = {},
  policy: RetryPolicyOptions = {},
  now: Date = new Date(),
): RetryDecision {
  const { baseDelayMs, maxDelayMs, backoffFactor } = { ...DEFAULT_RETRY_POLICY, ...policy };
  const nextAttempt = job.attempt + 1;

  if (opts.permanent) {
    return { shouldRetry: false, reason: 'permanent_error', delayMs: 0, nextAttempt: job.attempt };
  }
  if (nextAttempt > job.max_attempts) {
    return { shouldRetry: false, reason: 'max_attempts_reached', delayMs: 0, nextAttempt: job.attempt };
  }
  if (now.getTime() > job.deadline.getTime()) {
    return { shouldRetry: false, reason: 'deadline_exceeded', delayMs: 0, nextAttempt: job.attempt };
  }
  const delayMs = Math.min(baseDelayMs * Math.pow(backoffFactor, job.attempt - 1), maxDelayMs);
  return { shouldRetry: true, reason: 'scheduled', delayMs, nextAttempt };
}