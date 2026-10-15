import type { JobState } from './JobState';
import type { JobStore } from './JobStore';

/**
 * Heartbeat/lease cho job đang chạy (W1-MY-01).
 * Beat định kỳ ghi `last_heartbeat_at` vào store; worker khác (hoặc process
 * phục hồi) coi job mất beat quá TTL là của worker đã chết và recover lại.
 */
export interface HeartbeatOptions {
  store: JobStore;
  jobId: string;
  intervalMs: number;
  now?: () => Date;
  onError?: (err: unknown) => void;
}

export class Heartbeat {
  private timer: NodeJS.Timeout | null = null;
  private beating = false;
  private stopped = false;
  readonly lastBeatAt: Date | null = null;
  private readonly opts: HeartbeatOptions;

  constructor(opts: HeartbeatOptions) {
    if (opts.intervalMs <= 0) throw new Error('HEARTBEAT_INTERVAL_MUST_BE_POSITIVE');
    this.opts = opts;
  }

  start(): void {
    if (this.timer || this.stopped) return;
    void this.beat();
    this.timer = setInterval(() => void this.beat(), this.opts.intervalMs);
    this.timer.unref?.();
  }

  private async beat(): Promise<void> {
    if (this.stopped || this.beating) return;
    this.beating = true;
    try {
      const now = this.opts.now?.() ?? new Date();
      await this.opts.store.update(this.opts.jobId, { last_heartbeat_at: now, updated_at: now });
      (this as { lastBeatAt: Date | null }).lastBeatAt = now;
    } catch (err) {
      this.opts.onError?.(err);
    } finally {
      this.beating = false;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // chờ beat đang chạy dở để không bỏ sót trạng thái cuối
    for (let i = 0; i < 50 && this.beating; i++) {
      await new Promise((r) => setTimeout(r, 2));
    }
  }
}

/** Job mất beat quá TTL => worker giữ job đã chết (kill/crash) → cần recover. */
export function isLeaseExpired(job: JobState, ttlMs: number, now: Date): boolean {
  const anchor = job.last_heartbeat_at ?? job.updated_at;
  return now.getTime() - anchor.getTime() > ttlMs;
}