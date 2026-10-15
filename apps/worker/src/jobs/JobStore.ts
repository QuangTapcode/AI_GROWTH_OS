import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { JobState, JobStatus } from './JobState';

/**
 * Persistence seam cho job state (W1-MY-01).
 * - MemoryJobStore: test/dev, cùng-process.
 * - FileJobStore: durable qua process restart/kill, không phụ thuộc DB schema.
 * Store-backed Postgres (kysely) sẽ thay thế lúc `database/migrations` của
 * Thiệu Quang sẵn sàng — mọi caller chỉ phụ thuộc interface này.
 */
export interface JobStore {
  insert(job: JobState): Promise<void>;
  get(id: string): Promise<JobState | null>;
  /** Merge patch vào record hiện có; throw JOB_NOT_FOUND nếu thiếu. */
  update(id: string, patch: Partial<JobState>): Promise<JobState>;
  listByStatus(status: JobStatus): Promise<JobState[]>;
}

function clone(job: JobState): JobState {
  return structuredClone(job);
}

/**
 * Serialize read-modify-write theo từng job id trong process:
 * heartbeat/progress/cập nhật trạng thái có thể chạy song song — nếu để
 * xen kẽ thì beat ghi đè mất status (race đã bắt được qua test SIGKILL).
 */
abstract class LockedStore {
  private readonly locks = new Map<string, Promise<void>>();

  protected withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const run = prev.then(fn);
    // chuỗi tail luôn resolve để caller kế không bị block bởi lỗi của fn
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    this.locks.set(id, tail);
    void tail.then(() => {
      if (this.locks.get(id) === tail) this.locks.delete(id);
    });
    return run;
  }
}

export class MemoryJobStore extends LockedStore implements JobStore {
  private readonly jobs = new Map<string, JobState>();

  async insert(job: JobState): Promise<void> {
    await this.withLock(job.id, async () => {
      if (this.jobs.has(job.id)) throw new Error('JOB_ALREADY_EXISTS');
      this.jobs.set(job.id, clone(job));
    });
  }

  async get(id: string): Promise<JobState | null> {
    const job = this.jobs.get(id);
    return job ? clone(job) : null;
  }

  async update(id: string, patch: Partial<JobState>): Promise<JobState> {
    return this.withLock(id, async () => {
      const current = this.jobs.get(id);
      if (!current) throw new Error('JOB_NOT_FOUND');
      const next: JobState = { ...current, ...patch, id: current.id, updated_at: patch.updated_at ?? new Date() };
      this.jobs.set(id, clone(next));
      return clone(next);
    });
  }

  async listByStatus(status: JobStatus): Promise<JobState[]> {
    return [...this.jobs.values()].filter((j) => j.status === status).map(clone);
  }
}

interface SerializedJob extends Omit<JobState, 'deadline' | 'created_at' | 'updated_at' | 'last_heartbeat_at'> {
  deadline: string;
  created_at: string;
  updated_at: string;
  last_heartbeat_at: string | null;
}

function serialize(job: JobState): SerializedJob {
  return {
    ...job,
    deadline: job.deadline.toISOString(),
    created_at: job.created_at.toISOString(),
    updated_at: job.updated_at.toISOString(),
    last_heartbeat_at: job.last_heartbeat_at ? job.last_heartbeat_at.toISOString() : null,
  };
}

function deserialize(raw: string): JobState {
  const o = JSON.parse(raw) as SerializedJob;
  return {
    ...o,
    deadline: new Date(o.deadline),
    created_at: new Date(o.created_at),
    updated_at: new Date(o.updated_at),
    last_heartbeat_at: o.last_heartbeat_at ? new Date(o.last_heartbeat_at) : null,
  };
}

/**
 * Job store trên filesystem: mỗi job một file JSON, ghi atomic (tmp + rename).
 * Đủ để worker sống sót qua kill/restart mà không cần DB schema.
 * Một process ghi chính (single-writer) theo thiết kế W1.
 */
export class FileJobStore extends LockedStore implements JobStore {
  private readonly dir: string;
  private initialized = false;

  constructor(dir: string) {
    super();
    this.dir = dir;
  }

  private async ensureDir(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.dir, { recursive: true });
    this.initialized = true;
  }

  private fileOf(id: string): string {
    // id là uuid do server sinh; path-safe theo format
    if (!/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('INVALID_JOB_ID');
    return path.join(this.dir, `${id}.json`);
  }

  private async write(id: string, job: JobState): Promise<void> {
    await this.ensureDir();
    const target = this.fileOf(id);
    const tmp = `${target}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(serialize(job)), 'utf8');
    await fs.rename(tmp, target);
  }

  async insert(job: JobState): Promise<void> {
    return this.withLock(job.id, async () => {
      await this.ensureDir();
      try {
        await fs.access(this.fileOf(job.id));
        throw new Error('JOB_ALREADY_EXISTS');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && (err as Error).message !== 'JOB_ALREADY_EXISTS') throw err;
        if ((err as Error).message === 'JOB_ALREADY_EXISTS') throw err;
      }
      await this.write(job.id, job);
    });
  }

  async get(id: string): Promise<JobState | null> {
    try {
      const raw = await fs.readFile(this.fileOf(id), 'utf8');
      return deserialize(raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async update(id: string, patch: Partial<JobState>): Promise<JobState> {
    // read-modify-write nằm trọn trong lock để beat/progress không ghi đè nhau
    return this.withLock(id, async () => {
      const current = await this.get(id);
      if (!current) throw new Error('JOB_NOT_FOUND');
      const next: JobState = { ...current, ...patch, id: current.id, updated_at: patch.updated_at ?? new Date() };
      await this.write(id, next);
      return next;
    });
  }

  async listByStatus(status: JobStatus): Promise<JobState[]> {
    await this.ensureDir();
    const files = await fs.readdir(this.dir);
    const jobs: JobState[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(this.dir, file), 'utf8');
        const job = deserialize(raw);
        if (job.status === status) jobs.push(job);
      } catch {
        // bỏ qua file hỏng/ghi dở (kill giữa rename là tmp file, không trùng suffix .json)
      }
    }
    return jobs;
  }
}