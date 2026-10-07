import type { JobOperator, JobState, JobStatus } from './JobState';
import type { JobStore } from './JobStore';
import type { ResultStorage } from '../adapters/StorageAdapter';
import type { AiAdapter, AiRunRequest, AiRunResult } from '../adapters/AiAdapter';
import { Heartbeat, isLeaseExpired } from './Heartbeat';
import { computeRetry, DEFAULT_RETRY_POLICY, type RetryPolicyOptions } from './RetryPolicy';
import { WorkerLimits } from './JobState';

/** Lỗi không được retry — job failed ngay attempt hiện tại. */
export class PermanentJobError extends Error {
  readonly code = 'PERMANENT_FAILURE';
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

/** Tiêu vượt budget provider-call cho job (budget persist qua restart). */
export class ProviderCallLimitError extends Error {
  readonly code = 'PROVIDER_CALL_LIMIT_EXCEEDED';
  constructor(readonly limit: number) {
    super(`provider call limit ${limit} exceeded for job`);
    this.name = 'ProviderCallLimitError';
  }
}

/** Chạy quá `executionTimeoutMs`. */
export class JobTimeoutError extends Error {
  readonly code = 'JOB_TIMEOUT';
  constructor(readonly timeoutMs: number) {
    super(`job execution exceeded ${timeoutMs}ms`);
    this.name = 'JobTimeoutError';
  }
}

export interface JobContext {
  /** Snapshot job tại thời điểm claim */
  job: JobState;
  now(): Date;
  /** Ghi tiến độ vào store (persist ngay) */
  progress(percent: number): Promise<void>;
  /** Adapter AI đã qua bao kiểm budget provider-call */
  ai: { run(req: AiRunRequest): Promise<AiRunResult> };
}

export type OperationHandler = (ctx: JobContext) => Promise<unknown>;

export interface JobRunnerOptions {
  store: JobStore;
  storage: ResultStorage;
  ai: AiAdapter;
  /** registry operation → handler; run() resolve theo job.operation nếu không truyền override */
  handlers?: Partial<Record<JobOperator, OperationHandler>>;
  heartbeatIntervalMs?: number;
  /** Job mất beat quá TTL được coi là của worker đã chết */
  leaseTtlMs?: number;
  executionTimeoutMs?: number;
  maxProviderCallsPerJob?: number;
  retry?: RetryPolicyOptions;
  now?: () => Date;
}

export interface JobRunOutcome {
  jobId: string;
  /** Trạng thái cuối của job sau lần gọi này */
  status: JobStatus;
  attempt: number;
  /** false = bỏ qua (đã terminal / đang được worker khác giữ / chưa đến hạn retry) */
  claimed: boolean;
  result_ref: string | null;
  error_code: string | null;
  /** Có nghĩa khi status === 'retrying': delay trước attempt kế (main sẽ re-enqueue) */
  retry_after_ms: number | null;
}

/**
 * Orchestration một job: claim → running (+heartbeat) → handler → persist result
 * → completed. Lỗi → retry policy → retrying/failed. Không bao giờ completed
 * trước khi result_ref được persist.
 */
export class JobRunner {
  private readonly store: JobStore;
  private readonly storage: ResultStorage;
  private readonly ai: AiAdapter;
  private readonly handlers: Partial<Record<JobOperator, OperationHandler>>;
  private readonly heartbeatIntervalMs: number;
  private readonly leaseTtlMs: number;
  private readonly executionTimeoutMs: number;
  private readonly maxProviderCalls: number;
  private readonly retry: RetryPolicyOptions;
  private readonly now: () => Date;

  constructor(opts: JobRunnerOptions) {
    this.store = opts.store;
    this.storage = opts.storage;
    this.ai = opts.ai;
    this.handlers = opts.handlers ?? {};
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? WorkerLimits.HEARTBEAT_INTERVAL_MS;
    this.leaseTtlMs = opts.leaseTtlMs ?? Math.max(this.heartbeatIntervalMs * 3, WorkerLimits.HEARTBEAT_TTL_MS);
    this.executionTimeoutMs = opts.executionTimeoutMs ?? WorkerLimits.JOB_EXECUTION_TIMEOUT_MS;
    this.maxProviderCalls = opts.maxProviderCallsPerJob ?? WorkerLimits.MAX_PROVIDER_CALLS_PER_JOB;
    this.retry = opts.retry ?? DEFAULT_RETRY_POLICY;
    this.now = opts.now ?? (() => new Date());
  }

  async run(jobId: string, handlerOverride?: OperationHandler): Promise<JobRunOutcome> {
    const job = await this.store.get(jobId);
    if (!job) throw new Error('JOB_NOT_FOUND');

    // Terminal/redelivery: đã kết thúc thì không chạy lại (idempotent).
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return this.outcome(job, false);
    }

    // Đang chạy bởi process khác (lease còn sống) → bỏ qua, không double-run.
    if (job.status === 'running') {
      if (!isLeaseExpired(job, this.leaseTtlMs, this.now())) {
        return this.outcome(job, false);
      }
      // Lease chết (worker kill giữa chừng) → recover trước rồi claim tiếp.
      const recovered = await this.interrupt(job);
      if (recovered.status !== 'retrying') return this.outcome(recovered, false);
      return this.execute(recovered, handlerOverride);
    }

    // queued | retrying
    if (job.retry_after_ms !== null && job.retry_after_ms > 0) {
      const dueAt = job.updated_at.getTime() + job.retry_after_ms;
      if (this.now().getTime() < dueAt) return this.outcome(job, false); // chưa đến hạn
    }
    return this.execute(job, handlerOverride);
  }

  private async execute(job: JobState, handlerOverride?: OperationHandler): Promise<JobRunOutcome> {
    const now = this.now();
    if (now.getTime() > job.deadline.getTime()) {
      const failed = await this.store.update(job.id, {
        status: 'failed',
        error_code: 'DEADLINE_EXCEEDED',
        error_message: 'job deadline passed before execution',
        retry_after_ms: null,
        updated_at: now,
      });
      return this.outcome(failed, false);
    }

    const handler = handlerOverride ?? this.handlers[job.operation];
    if (!handler) throw new Error(`NO_HANDLER_FOR_OPERATION_${job.operation}`);

    const claimed = await this.store.update(job.id, {
      status: 'running',
      retry_after_ms: null,
      last_heartbeat_at: now,
      updated_at: now,
    });

    const heartbeat = new Heartbeat({
      store: this.store,
      jobId: job.id,
      intervalMs: this.heartbeatIntervalMs,
      now: this.now,
    });
    heartbeat.start();

    const ctx: JobContext = {
      job: claimed,
      now: this.now,
      progress: async (percent: number) => {
        const p = Math.max(0, Math.min(100, Math.round(percent)));
        await this.store.update(job.id, { progress_percent: p, updated_at: this.now() });
      },
      ai: {
        run: async (req: AiRunRequest) => {
          // Persist budget TRƯỚC khi gọi provider: kill giữa chừng vẫn tính.
          const fresh = (await this.store.get(job.id)) ?? claimed;
          if (fresh.provider_calls >= this.maxProviderCalls) {
            throw new ProviderCallLimitError(this.maxProviderCalls);
          }
          await this.store.update(job.id, {
            provider_calls: fresh.provider_calls + 1,
            updated_at: this.now(),
          });
          return this.ai.run(req);
        },
      },
    };

    let timer: NodeJS.Timeout | null = null;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new JobTimeoutError(this.executionTimeoutMs)), this.executionTimeoutMs);
        timer.unref?.();
      });
      const result = await Promise.race([handler(ctx), timeout]);

      // Persist result TRƯỚC khi completed.
      const result_ref = await this.storage.persist(job.id, result);
      const done = await this.store.update(job.id, {
        status: 'completed',
        progress_percent: 100,
        result_ref,
        error_code: null,
        error_message: null,
        retry_after_ms: null,
        updated_at: this.now(),
      });
      return this.outcome(done, true);
    } catch (err) {
      const failure = await this.handleFailure(claimed, err);
      return this.outcome(failure.job, false, failure.retryAfterMs);
    } finally {
      if (timer) clearTimeout(timer);
      await heartbeat.stop();
    }
  }

  private async handleFailure(
    job: JobState,
    err: unknown,
  ): Promise<{ job: JobState; retryAfterMs: number | null }> {
    const error = err instanceof Error ? err : new Error(String(err));
    const errorCode: string =
      (err as { code?: string }).code ?? 'JOB_EXECUTION_FAILED';
    const permanent = err instanceof PermanentJobError || err instanceof ProviderCallLimitError;

    const decision = computeRetry(job, { permanent }, this.retry, this.now());

    if (decision.shouldRetry) {
      const next = await this.store.update(job.id, {
        status: 'retrying',
        attempt: decision.nextAttempt,
        retry_after_ms: decision.delayMs,
        error_code: errorCode,
        error_message: error.message.slice(0, 500),
        updated_at: this.now(),
      });
      return { job: next, retryAfterMs: decision.delayMs };
    }
    const failedCode = decision.reason === 'deadline_exceeded' ? 'DEADLINE_EXCEEDED' : errorCode;
    const failed = await this.store.update(job.id, {
      status: 'failed',
      error_code: failedCode,
      error_message: error.message.slice(0, 500),
      retry_after_ms: null,
      updated_at: this.now(),
    });
    return { job: failed, retryAfterMs: null };
  }

  /**
   * Đưa job đang `running` với lease đã chết về retrying/failed.
   * Gọi định kỳ (sweep) và khi claim thấy lease_expired — mô phỏng pg-boss
   * expire/retry sau khi worker bị kill.
   */
  async recoverStale(ttlMs: number = this.leaseTtlMs): Promise<JobState[]> {
    const running = await this.store.listByStatus('running');
    const recovered: JobState[] = [];
    for (const job of running) {
      if (!isLeaseExpired(job, ttlMs, this.now())) continue;
      recovered.push(await this.interrupt(job));
    }
    return recovered;
  }

  private async interrupt(job: JobState): Promise<JobState> {
    const now = this.now();
    const attemptsExhausted = job.attempt >= job.max_attempts;
    const pastDeadline = now.getTime() > job.deadline.getTime();
    if (attemptsExhausted || pastDeadline) {
      return this.store.update(job.id, {
        status: 'failed',
        error_code: pastDeadline ? 'DEADLINE_EXCEEDED' : 'WORKER_INTERRUPTED',
        error_message: pastDeadline
          ? 'job deadline passed while worker was interrupted'
          : 'worker interrupted and no attempts left',
        retry_after_ms: null,
        updated_at: now,
      });
    }
    return this.store.update(job.id, {
      status: 'retrying',
      attempt: job.attempt + 1,
      retry_after_ms: 0,
      error_code: 'WORKER_INTERRUPTED',
      error_message: 'worker heartbeat lost; job requeued for retry',
      updated_at: now,
    });
  }

  private outcome(job: JobState, claimed: boolean, retryAfterMs: number | null = null): JobRunOutcome {
    return {
      jobId: job.id,
      status: job.status,
      attempt: job.attempt,
      claimed,
      result_ref: job.result_ref,
      error_code: job.error_code,
      retry_after_ms: retryAfterMs ?? (job.status === 'retrying' ? job.retry_after_ms : null),
    };
  }

}
