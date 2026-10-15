import { v4 as uuid } from 'uuid';

/**
 * Persisted worker job entity.
 * W1-BE-01/W1-MY-01: chốt fields/state machine queued|retrying -> running -> completed|failed|retrying|cancelled
 * - persisted status/attempt/deadline/progress/result_ref + heartbeat/provider_calls
 * - completed chỉ được set SAU khi result đã được persist (result_ref != null)
 * - deadline là hạn tuyệt đối của job (không gia hạn khi retry)
 */

export type JobStatus =
  | 'queued'
  | 'running'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type JobOperator =
  | 'ingest'
  | 'ingest_revoke'
  | 'ingest_delete'
  | 'research'
  | 'score'
  | 'strategy'
  | 'content'
  | 'publish'
  | 'metrics'
  | 'lead'
  | 'integrations';

export interface JobState {
  id: string;
  workspace_id: string;
  organization_id: string;
  operation: JobOperator;
  status: JobStatus;
  attempt: number;
  max_attempts: number;
  deadline: Date;
  progress_percent: number;
  input_version: number;
  result_ref: string | null;
  error_code: string | null;
  error_message: string | null;
  request_id: string;
  trace_id: string;
  retry_after_ms: number | null;
  /** Beat cuối từ worker đang giữ job; null nếu chưa từng claim (dùng cho lease/kill recovery) */
  last_heartbeat_at: Date | null;
  /** Số lần gọi provider đã tiêu (persist qua restart — retry không reset budget) */
  provider_calls: number;
  /** Input của job, giữ tại đây để worker restart/kill vẫn tái chạy được */
  payload: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

export function createJobState(input: {
  id?: string;
  workspace_id: string;
  organization_id: string;
  operation: JobOperator;
  status?: JobStatus;
  attempt?: number;
  max_attempts?: number;
  input_version?: number;
  request_id?: string;
  trace_id?: string;
  payload?: Record<string, unknown>;
  deadline?: Date;
  now?: Date;
}): JobState {
  const now = input.now ?? new Date();
  const attempt = input.attempt ?? 1;
  const maxAttempts = input.max_attempts ?? 3;
  return {
    id: input.id ?? uuid(),
    workspace_id: input.workspace_id,
    organization_id: input.organization_id,
    operation: input.operation,
    status: input.status ?? 'queued',
    attempt,
    max_attempts: maxAttempts,
    deadline: input.deadline ?? defaultDeadline(now, attempt),
    progress_percent: 0,
    input_version: input.input_version ?? 1,
    result_ref: null,
    error_code: null,
    error_message: null,
    request_id: input.request_id ?? uuid(),
    trace_id: input.trace_id ?? uuid(),
    retry_after_ms: null,
    last_heartbeat_at: null,
    provider_calls: 0,
    payload: input.payload ?? {},
    created_at: now,
    updated_at: now,
  };
}

function defaultDeadline(now: Date, attempt: number): Date {
  const base = new Date(now.getTime());
  const delayHours = Math.min(attempt, 24) * 2;
  base.setHours(base.getHours() + delayHours);
  return base;
}

/**
 * Deterministic {"a":1,"b":2} <=> {"b":2,"a":1} key for idempotency/payload hash
 */
export function payloadKey(parts: Array<string | number | null | undefined>): string {
  const normalized = parts
    .map((p) => (p === undefined || p === null ? '' : String(p)))
    .sort();
  return normalized.join('|');
}

/**
 * Worker limits from W1-PM-02: max provider calls/job
 */
export const WorkerLimits = {
  AI_CONCURRENCY: 1,
  MAX_PROVIDER_CALLS_PER_JOB: 2,
  JOB_EXECUTION_TIMEOUT_MS: 600_000,
  HEARTBEAT_INTERVAL_MS: 5_000,
  HEARTBEAT_TTL_MS: 30_000,
} as const;
