import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileJobStore } from '../src/jobs/JobStore';
import { createJobState } from '../src/jobs/JobState';

// On Windows a file another process is reading cannot be replaced for a moment:
// measured 794 EPERM in 19827 renames with one reader, which made a job fail for no real reason.
const busy = (code: string) => Object.assign(new Error(code), { code });
const job = () => createJobState({ workspace_id: 'ws-1', organization_id: 'org-1', operation: 'research', max_attempts: 3 });

describe('a job file shared with another process', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'job-share-')); });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it.each(['EPERM', 'EBUSY', 'EACCES'])('an update survives %s while another process holds the file', async (code) => {
    const store = new FileJobStore(dir);
    const created = job();
    await store.insert(created);
    vi.spyOn(fs, 'rename').mockRejectedValueOnce(busy(code)).mockRejectedValueOnce(busy(code));
    await expect(store.update(created.id, { progress_percent: 30 })).resolves.toMatchObject({ progress_percent: 30 });
    expect((await store.get(created.id))?.progress_percent).toBe(30);
  });

  it('a read survives the moment the file is being replaced', async () => {
    const store = new FileJobStore(dir);
    const created = job();
    await store.insert(created);
    vi.spyOn(fs, 'readFile').mockRejectedValueOnce(busy('EBUSY')).mockRejectedValueOnce(busy('ENOENT'));
    await expect(store.get(created.id)).resolves.toMatchObject({ id: created.id });
  });

  it('a job that really does not exist is still reported as missing', async () => {
    await expect(new FileJobStore(dir).get('no-such-job')).resolves.toBeNull();
  });

  it('a file that stays locked is an error, not a silent loss of the update', async () => {
    const store = new FileJobStore(dir);
    const created = job();
    await store.insert(created);
    vi.spyOn(fs, 'rename').mockRejectedValue(busy('EPERM'));
    await expect(store.update(created.id, { progress_percent: 30 })).rejects.toMatchObject({ code: 'EPERM' });
  });
});
