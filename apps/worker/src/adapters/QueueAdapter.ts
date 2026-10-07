import { v4 as uuid } from 'uuid';
import type PgBoss from 'pg-boss';

/**
 * Transport queue (W1-MY-01): pg-boss cho runtime thật; MemoryQueue cho test
 * không cần Postgres. Message chỉ mang `{job_id}` — trạng thái bền vững nằm ở JobStore.
 */
export interface QueueMessageHandler {
  (data: Record<string, unknown>): Promise<void>;
}

export interface QueueEnqueueOptions {
  /** Hoãn xử lý (retry có delay) */
  startAfterMs?: number;
}

export interface QueueTransport {
  start(): Promise<void>;
  enqueue(name: string, data: Record<string, unknown>, opts?: QueueEnqueueOptions): Promise<string>;
  register(name: string, handler: QueueMessageHandler): Promise<void>;
  stop(): Promise<void>;
}

export class PgBossQueue implements QueueTransport {
  constructor(private readonly boss: PgBoss) {}

  async start(): Promise<void> {
    await this.boss.start();
  }

  async enqueue(name: string, data: Record<string, unknown>, opts?: QueueEnqueueOptions): Promise<string> {
    const options: PgBoss.SendOptions = opts?.startAfterMs
      ? { startAfter: new Date(Date.now() + opts.startAfterMs) }
      : {};
    const id = await this.boss.send(name, data, options);
    return String(id);
  }

  async register(name: string, handler: QueueMessageHandler): Promise<void> {
    await this.boss.work(name, async (job) => {
      await handler(job.data as Record<string, unknown>);
    });
  }

  async stop(): Promise<void> {
    await this.boss.stop();
  }
}

/** In-memory queue: trả message cho handler đã register, hỗ trợ startAfterMs (retry). */
export class MemoryQueue implements QueueTransport {
  private readonly handlers = new Map<string, QueueMessageHandler>();
  private readonly pending: Array<{ id: string; name: string; data: Record<string, unknown>; notBefore: number }> = [];
  private started = false;

  async start(): Promise<void> {
    this.started = true;
  }

  async enqueue(name: string, data: Record<string, unknown>, opts?: QueueEnqueueOptions): Promise<string> {
    const id = uuid();
    this.pending.push({ id, name, data, notBefore: Date.now() + (opts?.startAfterMs ?? 0) });
    return id;
  }

  async register(name: string, handler: QueueMessageHandler): Promise<void> {
    this.handlers.set(name, handler);
  }

  /** Xử lý các message đã đến hạn; trả về số message đã xử lý. */
  async drain(now: number = Date.now()): Promise<number> {
    if (!this.started) throw new Error('QUEUE_NOT_STARTED');
    let processed = 0;
    for (;;) {
      const idx = this.pending.findIndex((m) => m.notBefore <= now);
      if (idx === -1) break;
      const msg = this.pending.splice(idx, 1)[0];
      const handler = this.handlers.get(msg.name);
      if (!handler) throw new Error(`NO_HANDLER_FOR_${msg.name}`);
      await handler(msg.data);
      processed += 1;
    }
    return processed;
  }

  pendingCount(): number {
    return this.pending.length;
  }

  async stop(): Promise<void> {
    this.started = false;
  }
}
