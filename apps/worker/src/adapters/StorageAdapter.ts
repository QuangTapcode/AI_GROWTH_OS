import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Nơi lưu kết quả job (W1-MY-01). Job CHỈ completed sau khi persist thành
 * công tại đây và `result_ref` đã được ghi vào job state.
 * Ref có dạng `<scheme>://...` để sau này đổi sang storage/S3/DB không đổi caller.
 */
export interface ResultStorage {
  persist(jobId: string, result: unknown): Promise<string>;
}

export class MemoryResultStorage implements ResultStorage {
  private readonly entries = new Map<string, unknown>();
  private readonly counts = new Map<string, number>();

  async persist(jobId: string, result: unknown): Promise<string> {
    const n = (this.counts.get(jobId) ?? 0) + 1;
    this.counts.set(jobId, n);
    const ref = `memory://results/${jobId}/${n}`;
    this.entries.set(ref, structuredClone(result));
    return ref;
  }

  get(ref: string): unknown {
    return this.entries.get(ref);
  }

  has(ref: string): boolean {
    return this.entries.has(ref);
  }
}

/** Durable qua restart: kết quả ghi file JSON trong state dir (W1 baseline, không cần DB). */
export class FileResultStorage implements ResultStorage {
  private readonly dir: string;
  private initialized = false;

  constructor(dir: string) {
    this.dir = dir;
  }

  private async ensureDir(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.dir, { recursive: true });
    this.initialized = true;
  }

  async persist(jobId: string, result: unknown): Promise<string> {
    await this.ensureDir();
    if (!/^[A-Za-z0-9._-]+$/.test(jobId)) throw new Error('INVALID_JOB_ID');
    const id = randomUUID();
    const tmp = path.join(this.dir, `${id}.tmp`);
    const target = path.join(this.dir, `${id}.json`);
    await fs.writeFile(tmp, JSON.stringify({ job_id: jobId, result }), 'utf8');
    await fs.rename(tmp, target);
    return `file://results/${id}.json`;
  }

  async get(ref: string): Promise<unknown> {
    const m = /^file:\/\/results\/([A-Za-z0-9._-]+\.json)$/.exec(ref);
    if (!m) return null;
    try {
      const raw = await fs.readFile(path.join(this.dir, m[1]), 'utf8');
      return (JSON.parse(raw) as { result: unknown }).result;
    } catch {
      return null;
    }
  }
}
