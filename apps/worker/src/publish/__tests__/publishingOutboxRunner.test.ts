import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { PublishingOutboxRunner } from '../PublishingOutboxRunner';
import { CmsPublisher, type CmsPublishRequest, type CmsPublishResult } from '../CmsPublisher';
import { computeSha256Hex } from '../gateway_recheck';

/**
 * Mock Publisher ghi nhận số lần gọi publish và hỗ trợ mô phỏng timeout / reconcile
 */
class TrackableMockPublisher extends CmsPublisher {
  channel: 'Facebook' | 'TikTok';
  behavior: 'success' | 'timeout_reconciled' | 'timeout_not_reconciled';
  publishCalls: number = 0;
  reconcileCalls: number = 0;

  constructor(
    channel: 'Facebook' | 'TikTok' = 'Facebook',
    behavior: 'success' | 'timeout_reconciled' | 'timeout_not_reconciled' = 'success'
  ) {
    super();
    this.channel = channel;
    this.behavior = behavior;
  }

  async publish(req: CmsPublishRequest): Promise<CmsPublishResult> {
    this.publishCalls++;

    if (this.behavior === 'timeout_reconciled' || this.behavior === 'timeout_not_reconciled') {
      return {
        success: false,
        errorCode: 'CMS_TIMEOUT',
        errorMessage: 'Connection to platform timed out after 30000ms',
      };
    }

    return {
      success: true,
      externalPostId: `ext_post_${this.channel.toLowerCase()}_${Date.now()}`,
      publishedUrl: `https://${this.channel.toLowerCase()}.com/post/123`,
      publishedAt: new Date(),
    };
  }

  async reconcile(idempotencyKey: string): Promise<CmsPublishResult> {
    this.reconcileCalls++;

    if (this.behavior === 'timeout_reconciled') {
      // Đối soát: Platform xác nhận bài ĐÃ được tạo thành công!
      return {
        success: true,
        externalPostId: `reconciled_post_${this.channel.toLowerCase()}_999`,
        publishedUrl: `https://${this.channel.toLowerCase()}.com/post/reconciled_999`,
        publishedAt: new Date(),
      };
    }

    // Platform xác nhận bài chưa hề được tạo
    return {
      success: false,
      errorCode: 'POST_NOT_FOUND',
      errorMessage: 'Post with key not found on platform',
    };
  }
}

describe('CM-27: PublishingOutboxRunner (PgBoss) & TC-15', () => {
  it('1. TC-15 Idempotency: Gửi trùng cùng idempotency key chỉ ra một bài, trả cùng post_id (0 bài trùng)', async () => {
    const mockPublisher = new TrackableMockPublisher('Facebook', 'success');
    const registry = new Map<string, CmsPublisher>([['Facebook', mockPublisher]]);

    const publishedStore = new Map<string, any>();
    const executedQueries: string[] = [];

    const mockPool = {
      query: async (sql: string, params: any[] = []) => {
        executedQueries.push(sql);

        // Claim event
        if (sql.includes('candidate AS')) {
          return {
            rows: [
              {
                id: 'evt_tc15_01',
                payload: { job_id: 'job_tc15_01' },
                retry_count: 1,
              },
            ],
          };
        }

        // Job query with FOR UPDATE
        if (sql.includes('FROM publishing_jobs j')) {
          return {
            rows: [
              {
                id: 'job_tc15_01',
                workspace_id: 'ws_danang_01',
                content_id: 'pack_sontra_01',
                approval_id: 'appr_01',
                scheduled_for: new Date(Date.now() - 1000).toISOString(),
                status: 'scheduled',
                mode: 'automated',
                body_markdown: 'Khám phá bán đảo Sơn Trà tuyệt đẹp!',
                content_title: 'Sơn Trà 2026',
                artifact_id: 'art_01',
                artifact_version: 1,
                content_hash: computeSha256Hex({ text: 'Khám phá bán đảo Sơn Trà tuyệt đẹp!' }),
                artifact_payload: { text: 'Khám phá bán đảo Sơn Trà tuyệt đẹp!' },
                platform_name: 'facebook',
                channel_identifier: 'page_danang',
                utm_url: null,
                approval_status: 'approved',
                parent_version: 1,
                external_post_id: null,
              },
            ],
          };
        }

        // Check existing published by idempotencyKey
        if (sql.includes('WHERE workspace_id = $1 AND idempotency_key = $2')) {
          const key = params[1];
          if (publishedStore.has(key)) {
            return { rows: [publishedStore.get(key)] };
          }
          return { rows: [] };
        }

        // Record published
        if (sql.includes("UPDATE publishing_jobs SET status = 'published'")) {
          const key = 'publish:ws_danang_01:pack_sontra_01:facebook:1';
          publishedStore.set(key, {
            external_post_id: params[2] || 'ext_post_first_run',
            published_at: new Date(),
          });
          return { rows: [] };
        }

        return { rows: [] };
      },
    };

    const runner = new PublishingOutboxRunner(mockPool as any, registry as any);

    // Lần 1: Xuất bản bài viết lần đầu
    const result1 = await runner.runOnce();
    assert.equal(result1, 'published');
    assert.equal(mockPublisher.publishCalls, 1);

    // Lần 2: Gửi trùng sự kiện với cùng idempotency key (publish:ws_danang_01:pack_sontra_01:facebook:1)
    const result2 = await runner.runOnce();
    assert.equal(result2, 'published');

    // Quan trọng nhất của TC-15: Không gọi publisher lần 2, không có bài trùng!
    assert.equal(mockPublisher.publishCalls, 1, 'TC-15 VIOLATION: Duplicate post created on remote platform!');
  });

  it('2. Chỉ nhận bản đã approved; chặn bản pending hoặc chưa duyệt', async () => {
    let failedEventRecorded = false;
    let failedReason = '';

    const mockPool = {
      query: async (sql: string, params: any[] = []) => {
        if (sql.includes('candidate AS')) {
          return {
            rows: [{ id: 'evt_unapproved_01', payload: { job_id: 'job_unapproved_01' }, retry_count: 1 }],
          };
        }
        if (sql.includes('FROM publishing_jobs j')) {
          return {
            rows: [
              {
                id: 'job_unapproved_01',
                workspace_id: 'ws_danang_01',
                content_id: 'pack_02',
                approval_id: null, // Chưa có approval!
                scheduled_for: new Date(Date.now() - 1000).toISOString(),
                status: 'scheduled',
                mode: 'automated',
                body_markdown: 'Bản nháp chưa duyệt',
                content_title: 'Draft',
                artifact_id: 'art_02',
                artifact_version: 1,
                content_hash: 'b'.repeat(64),
                artifact_payload: {},
                platform_name: 'facebook',
                channel_identifier: 'page_1',
                utm_url: null,
                approval_status: 'pending', // Trạng thái pending!
                parent_version: 1,
                external_post_id: null,
              },
            ],
          };
        }
        if (sql.includes("UPDATE publishing_jobs SET status = 'failed'")) {
          failedEventRecorded = true;
          failedReason = params[1];
          return { rows: [] };
        }
        return { rows: [] };
      },
    };

    const mockPublisher = new TrackableMockPublisher('Facebook');
    const runner = new PublishingOutboxRunner(mockPool as any, new Map([['Facebook', mockPublisher]]) as any);

    const outcome = await runner.runOnce();
    assert.equal(outcome, 'failed');
    assert.equal(mockPublisher.publishCalls, 0, 'CẤM xuất bản khi bài chưa được duyệt!');
    assert.equal(failedEventRecorded, true);
    assert.match(failedReason, /APPROVAL_NOT_APPROVED/);
  });

  it('3. Mô phỏng Timeout: Khi timeout phải gọi bước đối soát (reconcile); phát hiện bài ĐÃ lên -> không retry, trả cùng post_id', async () => {
    // Publisher mô phỏng mạng bị timeout lúc gọi, nhưng platform thực tế đã nhận bài
    const timeoutPublisher = new TrackableMockPublisher('Facebook', 'timeout_reconciled');
    const registry = new Map<string, CmsPublisher>([['Facebook', timeoutPublisher]]);

    let recordedExternalPostId = '';

    const mockPool = {
      query: async (sql: string, params: any[] = []) => {
        if (sql.includes('candidate AS')) {
          return { rows: [{ id: 'evt_timeout_01', payload: { job_id: 'job_timeout_01' }, retry_count: 1 }] };
        }
        if (sql.includes('FROM publishing_jobs j')) {
          return {
            rows: [
              {
                id: 'job_timeout_01',
                workspace_id: 'ws_danang_01',
                content_id: 'pack_timeout_01',
                approval_id: 'appr_01',
                scheduled_for: new Date(Date.now() - 1000).toISOString(),
                status: 'scheduled',
                mode: 'automated',
                body_markdown: 'Test timeout & reconcile',
                content_title: 'Timeout Test',
                artifact_id: 'art_01',
                artifact_version: 1,
                content_hash: computeSha256Hex({ text: 'Test timeout & reconcile' }),
                artifact_payload: { text: 'Test timeout & reconcile' },
                platform_name: 'facebook',
                channel_identifier: 'page_1',
                utm_url: null,
                approval_status: 'approved',
                parent_version: 1,
                external_post_id: null,
              },
            ],
          };
        }
        if (sql.includes("UPDATE publishing_jobs SET status = 'published'")) {
          recordedExternalPostId = params[2];
          return { rows: [] };
        }
        return { rows: [] };
      },
    };

    const runner = new PublishingOutboxRunner(mockPool as any, registry as any);
    const result = await runner.runOnce();

    assert.equal(result, 'published');
    assert.equal(timeoutPublisher.publishCalls, 1);
    assert.equal(timeoutPublisher.reconcileCalls, 1, 'Bắt buộc phải gọi reconcile khi gặp timeout!');
    assert.equal(recordedExternalPostId, 'reconciled_post_facebook_999');
  });

  it('4. Mô phỏng Timeout: Đối soát xác nhận bài CHƯA lên -> Thử lại theo Exponential Backoff (deferred)', async () => {
    // Publisher timeout và đối soát xác nhận bài chưa lên
    const timeoutPublisher = new TrackableMockPublisher('Facebook', 'timeout_not_reconciled');
    const registry = new Map<string, CmsPublisher>([['Facebook', timeoutPublisher]]);

    let retryScheduled = false;

    const mockPool = {
      query: async (sql: string, params: any[] = []) => {
        if (sql.includes('candidate AS')) {
          return { rows: [{ id: 'evt_retry_01', payload: { job_id: 'job_retry_01' }, retry_count: 2 }] };
        }
        if (sql.includes('FROM publishing_jobs j')) {
          return {
            rows: [
              {
                id: 'job_retry_01',
                workspace_id: 'ws_danang_01',
                content_id: 'pack_retry_01',
                approval_id: 'appr_01',
                scheduled_for: new Date(Date.now() - 1000).toISOString(),
                status: 'scheduled',
                mode: 'automated',
                body_markdown: 'Test exponential backoff',
                content_title: 'Retry Test',
                artifact_id: 'art_01',
                artifact_version: 1,
                content_hash: computeSha256Hex({ text: 'Test exponential backoff' }),
                artifact_payload: { text: 'Test exponential backoff' },
                platform_name: 'facebook',
                channel_identifier: 'page_1',
                utm_url: null,
                approval_status: 'approved',
                parent_version: 1,
                external_post_id: null,
              },
            ],
          };
        }
        if (sql.includes('RETRY_EXPONENTIAL_BACKOFF') || params.some((p) => String(p).includes('RETRY_EXPONENTIAL_BACKOFF'))) {
          retryScheduled = true;
          return { rows: [] };
        }
        return { rows: [] };
      },
    };

    const runner = new PublishingOutboxRunner(mockPool as any, registry as any);
    const result = await runner.runOnce();

    assert.equal(result, 'deferred');
    assert.equal(timeoutPublisher.publishCalls, 1);
    assert.equal(timeoutPublisher.reconcileCalls, 1);
    assert.equal(retryScheduled, true, 'Phải lập lịch retry theo Exponential Backoff!');
  });

  it('4b. Manual fallback (Meta chặn quyền) không được ghi là đã đăng', async () => {
    const fallbackPublisher = new TrackableMockPublisher('Facebook', 'success');
    fallbackPublisher.publish = async () => ({
      success: true,
      isManualFallback: true,
      externalPostId: 'manual_pack_facebook_pack_fb_01',
      errorCode: 'FACEBOOK_PERMISSION_DENIED',
      errorMessage: 'API access blocked. Fallback to Manual Pack generated.',
    });
    const registry = new Map<string, CmsPublisher>([['Facebook', fallbackPublisher]]);
    const updates: { sql: string; params: any[] }[] = [];

    const mockPool = {
      query: async (sql: string, params: any[] = []) => {
        if (sql.includes('candidate AS')) return { rows: [{ id: 'evt_fb_01', payload: { job_id: 'job_fb_01' }, retry_count: 1 }] };
        if (sql.includes('FROM publishing_jobs j')) {
          return {
            rows: [{
              id: 'job_fb_01', workspace_id: 'ws_danang_01', content_id: 'pack_fb_01', approval_id: 'appr_01',
              scheduled_for: new Date(Date.now() - 1000).toISOString(), status: 'scheduled', mode: 'automated',
              body_markdown: 'Meta blocked', content_title: 'Blocked', artifact_id: 'art_01', artifact_version: 1,
              content_hash: computeSha256Hex({ text: 'Meta blocked' }), artifact_payload: { text: 'Meta blocked' },
              platform_name: 'facebook', channel_identifier: 'page_1', utm_url: null, approval_status: 'approved',
              parent_version: 1, external_post_id: null,
            }],
          };
        }
        if (sql.includes('UPDATE')) updates.push({ sql, params });
        return { rows: [] };
      },
    };

    const result = await new PublishingOutboxRunner(mockPool as any, registry as any).runOnce();

    assert.equal(result, 'failed');
    assert.ok(!updates.some((u) => u.sql.includes("status = 'published', published_at = COALESCE")), 'Không được đánh dấu published');
    const failed = updates.find((u) => u.sql.includes("SET status = 'failed'") && u.params[0] === 'job_fb_01');
    assert.ok(failed && String(failed.params[1]).includes('FACEBOOK_PERMISSION_DENIED'));
  });

  it('5. Hai Worker chạy song song cùng lúc: SKIP LOCKED chia đều công việc và không trùng lặp bài đăng', async () => {
    const publisher = new TrackableMockPublisher('TikTok', 'success');
    const registry = new Map<string, CmsPublisher>([['TikTok', publisher]]);

    // Mô phỏng 2 event độc lập trong hàng đợi
    const pendingEvents = [
      { id: 'evt_parallel_A', payload: { job_id: 'job_A' }, retry_count: 1 },
      { id: 'evt_parallel_B', payload: { job_id: 'job_B' }, retry_count: 1 },
    ];

    const claimedIds = new Set<string>();

    const makeMockPoolForWorker = (workerName: string) => ({
      query: async (sql: string, params: any[] = []) => {
        // Claim SKIP LOCKED: Worker chỉ lấy event chưa bị worker khác khóa
        if (sql.includes('candidate AS')) {
          const available = pendingEvents.find((e) => !claimedIds.has(e.id));
          if (available) {
            claimedIds.add(available.id);
            return { rows: [available] };
          }
          return { rows: [] };
        }

        if (sql.includes('FROM publishing_jobs j')) {
          const jobId = params[0];
          return {
            rows: [
              {
                id: jobId,
                workspace_id: 'ws_danang_01',
                content_id: `pack_${jobId}`,
                approval_id: 'appr_01',
                scheduled_for: new Date(Date.now() - 1000).toISOString(),
                status: 'scheduled',
                mode: 'automated',
                body_markdown: `Nội dung từ ${jobId}`,
                content_title: `Title ${jobId}`,
                artifact_id: `art_${jobId}`,
                artifact_version: 1,
                content_hash: computeSha256Hex({ text: `Nội dung từ ${jobId}` }),
                artifact_payload: { text: `Nội dung từ ${jobId}` },
                platform_name: 'tiktok',
                channel_identifier: '@tripc',
                utm_url: null,
                approval_status: 'approved',
                parent_version: 1,
                external_post_id: null,
              },
            ],
          };
        }

        return { rows: [] };
      },
    });

    const worker1 = new PublishingOutboxRunner(makeMockPoolForWorker('Worker_1') as any, registry as any);
    const worker2 = new PublishingOutboxRunner(makeMockPoolForWorker('Worker_2') as any, registry as any);

    // Chạy đồng thời cả 2 worker
    const [result1, result2] = await Promise.all([worker1.runOnce(), worker2.runOnce()]);

    assert.equal(result1, 'published');
    assert.equal(result2, 'published');
    assert.equal(claimedIds.size, 2, '2 Worker phải xử lý 2 event khác nhau nhờ SKIP LOCKED');
    assert.equal(publisher.publishCalls, 2, 'Mỗi job chỉ được xuất bản đúng 1 lần duy nhất');
  });
});
