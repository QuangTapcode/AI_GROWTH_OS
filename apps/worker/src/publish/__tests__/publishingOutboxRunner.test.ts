import { describe, expect, it, vi } from 'vitest';
import { PublishingOutboxRunner } from '../PublishingOutboxRunner';

describe('PublishingOutboxRunner', () => {
  it('claims an approved scheduled event and records published state', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'event-1', payload: { job_id: 'job-1' } }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'job-1', workspace_id: 'ws-1', content_id: 'content-1', approval_id: 'approval-1',
        scheduled_for: new Date(Date.now() - 1000).toISOString(), status: 'scheduled',
        body_markdown: '# Hello', content_title: 'Hello', artifact_id: 'artifact-1',
        artifact_version: 1, content_hash: 'a'.repeat(64), artifact_payload: {},
        platform_name: 'facebook', channel_identifier: 'page-1', utm_url: null,
      }] })
      .mockResolvedValue({ rows: [] });
    const runner = new PublishingOutboxRunner({ query } as any);
    await expect(runner.runOnce()).resolves.toBe('published');
    expect(query).toHaveBeenCalledTimes(5);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("status = 'published'"))).toBe(true);
  });

  it('does not publish a future event and returns it to pending', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'event-2', payload: { job_id: 'job-2' } }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'job-2', workspace_id: 'ws-1', content_id: 'content-2', approval_id: 'approval-2',
        scheduled_for: new Date(Date.now() + 60_000).toISOString(), status: 'scheduled',
        body_markdown: '# Future', content_title: 'Future', artifact_id: 'artifact-2',
        artifact_version: 1, content_hash: 'b'.repeat(64), artifact_payload: {},
        platform_name: 'tiktok', channel_identifier: '@tripc', utm_url: null,
      }] })
      .mockResolvedValue({ rows: [] });
    const runner = new PublishingOutboxRunner({ query } as any);
    await expect(runner.runOnce()).resolves.toBe('deferred');
    expect(query.mock.calls.some(([sql]) => String(sql).includes("status = 'pending'"))).toBe(true);
  });

  it('consumes a manual-mode event without calling a provider', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'event-3', payload: { job_id: 'job-3' } }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'job-3', workspace_id: 'ws-1', content_id: 'content-3', approval_id: 'approval-3',
        scheduled_for: new Date(Date.now() - 1000).toISOString(), status: 'scheduled', mode: 'manual',
        body_markdown: '# Manual', content_title: 'Manual', artifact_id: 'artifact-3',
        artifact_version: 1, content_hash: 'c'.repeat(64), artifact_payload: {},
        platform_name: 'facebook', channel_identifier: null, utm_url: null,
      }] })
      .mockResolvedValue({ rows: [] });
    const runner = new PublishingOutboxRunner({ query } as any);
    await expect(runner.runOnce()).resolves.toBe('published');
    expect(query.mock.calls.some(([sql]) => String(sql).includes("outbox_events SET status = 'published'"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes("publishing_jobs SET status = 'publishing'"))).toBe(false);
  });
});
