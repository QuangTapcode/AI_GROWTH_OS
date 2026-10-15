import { describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { MemoryJobStore, FileJobStore } from '../src/jobs/JobStore';
import { createJobState } from '../src/jobs/JobState';
import type { JobStore } from '../src/jobs/JobStore';

function jobFixture(id?: string) {
  return createJobState({
    id,
    workspace_id: 'ws-1',
    organization_id: 'org-1',
    operation: 'research',
    payload: { q: 'housing' },
  });
}

function contractSuite(name: string, makeStore: () => Promise<{ store: JobStore; cleanup?: () => Promise<void> }>) {
  describe(name, () => {
    it('insert/get round-trip giữ nguyên field + Date', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const job = jobFixture();
        await store.insert(job);
        const got = await store.get(job.id);
        expect(got).not.toBeNull();
        expect(got!.id).toBe(job.id);
        expect(got!.status).toBe('queued');
        expect(got!.attempt).toBe(1);
        expect(got!.progress_percent).toBe(0);
        expect(got!.result_ref).toBeNull();
        expect(got!.provider_calls).toBe(0);
        expect(got!.payload).toEqual({ q: 'housing' });
        expect(got!.deadline).toBeInstanceOf(Date);
        expect(got!.created_at).toBeInstanceOf(Date);
        expect(got!.last_heartbeat_at).toBeNull();
      } finally {
        await cleanup?.();
      }
    });

    it('update merge patch và throw khi job thiếu', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const job = jobFixture();
        await store.insert(job);
        const updated = await store.update(job.id, { status: 'running', progress_percent: 42 });
        expect(updated.status).toBe('running');
        expect(updated.progress_percent).toBe(42);
        expect(updated.updated_at.getTime()).toBeGreaterThanOrEqual(job.created_at.getTime());
        await expect(store.update('missing-job', { status: 'failed' })).rejects.toThrow('JOB_NOT_FOUND');
      } finally {
        await cleanup?.();
      }
    });

    it('listByStatus chỉ trả đúng record', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const a = jobFixture();
        const b = jobFixture();
        await store.insert(a);
        await store.insert(b);
        await store.update(a.id, { status: 'running' });
        expect((await store.listByStatus('running')).map((j) => j.id)).toEqual([a.id]);
        expect((await store.listByStatus('queued')).map((j) => j.id)).toEqual([b.id]);
        expect(await store.listByStatus('completed')).toEqual([]);
      } finally {
        await cleanup?.();
      }
    });

    it('duplicate insert bị chặn', async () => {
      const { store, cleanup } = await makeStore();
      try {
        const job = jobFixture();
        await store.insert(job);
        await expect(store.insert(job)).rejects.toThrow('JOB_ALREADY_EXISTS');
      } finally {
        await cleanup?.();
      }
    });
  });
}

contractSuite('MemoryJobStore', async () => ({ store: new MemoryJobStore() }));

contractSuite('FileJobStore', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'worker-jobs-'));
  return {
    store: new FileJobStore(dir),
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
});

describe('FileJobStore durable (W1-MY-01)', () => {
  it('state đọc lại được từ store mới (mô phỏng restart process)', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'worker-jobs-'));
    try {
      const store1 = new FileJobStore(dir);
      const job = jobFixture();
      await store1.insert(job);
      await store1.update(job.id, { status: 'running', progress_percent: 70, provider_calls: 1 });

      // "restart": store instance mới đọc cùng thư mục
      const store2 = new FileJobStore(dir);
      const got = await store2.get(job.id);
      expect(got).toMatchObject({ status: 'running', progress_percent: 70, provider_calls: 1, attempt: 1 });
      expect(got!.deadline).toBeInstanceOf(Date);
      expect((await store2.listByStatus('running')).map((j) => j.id)).toEqual([job.id]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});