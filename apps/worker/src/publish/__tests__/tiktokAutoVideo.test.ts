import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ensureAutoTikTokVideo, extractSourceIdFromEvidence } from '../TikTokAutoVideoRenderer';
import { PublishingOutboxRunner } from '../PublishingOutboxRunner';
import { CmsPublisher, PublisherRegistry, type CmsPublishRequest, type CmsPublishResult } from '../CmsPublisher';
import { computeSha256Hex } from '../gateway_recheck';

class CapturingTikTokPublisher extends CmsPublisher {
  readonly channel = 'TikTok' as const;
  public requests: CmsPublishRequest[] = [];

  async publish(req: CmsPublishRequest): Promise<CmsPublishResult> {
    this.requests.push(req);
    return {
      success: true,
      externalPostId: 'v_pub_auto_001',
      publishedUrl: 'https://www.tiktok.com/@aisoeasy',
      publishedAt: new Date(),
    };
  }

  async reconcile(_idempotencyKey: string): Promise<CmsPublishResult> {
    return { success: false, errorCode: 'POST_NOT_FOUND', errorMessage: 'not found' };
  }
}

describe('TikTok Auto Video Renderer & Outbox Auto-Upload Pipeline', () => {
  let tmpRoot = '';

  beforeAll(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tiktok-auto-video-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('extracts source_id from artifact evidence', () => {
    expect(extractSourceIdFromEvidence([{ source_id: 'src_abc_123' }])).toBe('src_abc_123');
    expect(extractSourceIdFromEvidence([])).toBeNull();
    expect(extractSourceIdFromEvidence(null)).toBeNull();
  });

  it('reuses topic MP4 from COMMUNITY_VIDEO_DIR/manifest.json when available', async () => {
    const communityDir = path.join(tmpRoot, 'community_videos');
    const wsId = '10000000-0000-4000-8000-000000000001';
    fs.mkdirSync(communityDir, { recursive: true });
    const topicFile = path.join(communityDir, 'topic-serviced-apt.mp4');
    fs.writeFileSync(topicFile, Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]));
    fs.writeFileSync(
      path.join(communityDir, 'manifest.json'),
      JSON.stringify({
        videos: [
          {
            workspace_id: wsId,
            source_id: 'src_serviced_apt',
            file: 'topic-serviced-apt.mp4',
          },
        ],
      }),
    );

    const out = await ensureAutoTikTokVideo(
      {
        workspaceId: wsId,
        jobId: 'job_topic_01',
        title: 'Serviced Apartment Da Nang',
        sourceId: 'src_serviced_apt',
      },
      {
        uploadRoot: path.join(tmpRoot, 'uploads'),
        communityVideoDir: communityDir,
      },
    );

    expect(out).toBe(topicFile);
  });

  it('renders valid H.264 MP4 when no pre-rendered topic video exists and caches by jobId', async () => {
    const uploadRoot = path.join(tmpRoot, 'uploads_rendered');
    const wsId = '10000000-0000-4000-8000-000000000001';
    const mp4Path = await ensureAutoTikTokVideo(
      {
        workspaceId: wsId,
        jobId: 'job_render_01',
        title: 'Kinh nghiệm thuê căn hộ Đà Nẵng',
        hook: 'Cẩm nang người nước ngoài làm việc từ xa',
        cta: 'Xem chi tiết tại TripC Community',
        imageUrl: null,
      },
      {
        uploadRoot,
        communityVideoDir: null,
      },
    );

    expect(fs.existsSync(mp4Path)).toBe(true);
    const buf = fs.readFileSync(mp4Path);
    expect(buf.length).toBeGreaterThan(20_000);
    expect(buf.subarray(4, 8).toString('ascii')).toBe('ftyp');

    // Second call returns cached path immediately
    const secondPath = await ensureAutoTikTokVideo(
      {
        workspaceId: wsId,
        jobId: 'job_render_01',
        title: 'Different title ignored once cached',
      },
      { uploadRoot, communityVideoDir: null },
    );
    expect(secondPath).toBe(mp4Path);
  }, 45_000);

  it('PublishingOutboxRunner auto-renders MP4 for TikTok job with Unsplash image URL and forces FILE_UPLOAD', async () => {
    const fakeMp4 = path.join(tmpRoot, 'auto-rendered-outbox.mp4');
    fs.writeFileSync(fakeMp4, Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 1, 2, 3, 4]));

    const publisher = new CapturingTikTokPublisher();
    const registry = new PublisherRegistry();
    registry.register('TikTok', publisher);

    const result = {
      caption: 'Kinh nghiệm thuê căn hộ dịch vụ tại Đà Nẵng #TripC #DaNang',
      cta: 'Tham gia cộng đồng TripC',
      image_assets: [{ url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200' }],
    };
    const evidence = [{ source_id: 'src_apt_01', quote: 'Da Nang remote work guide' }];
    const contentHash = computeSha256Hex({ result, evidence });

    const sqlCalls: Array<{ sql: string; params: unknown[] }> = [];
    const mockPool = {
      query: async (sql: string, params: unknown[] = []) => {
        sqlCalls.push({ sql, params });
        if (sql.includes('candidate AS')) {
          return {
            rows: [{ id: 'evt_tt_auto_1', payload: { job_id: 'job_tt_auto_1' }, retry_count: 1 }],
          };
        }
        if (sql.includes('FROM publishing_jobs j')) {
          return {
            rows: [
              {
                id: 'job_tt_auto_1',
                workspace_id: '10000000-0000-4000-8000-000000000001',
                content_id: 'cnt_tt_auto_1',
                approval_id: 'appr_tt_auto_1',
                scheduled_for: new Date(Date.now() - 1000).toISOString(),
                status: 'scheduled',
                mode: 'live',
                media_url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200',
                media_path: null,
                media_type: 'video',
                custom_caption: result.caption,
                tiktok_video_id: 'ttvid_auto_1',
                body_markdown: result.caption,
                content_title: 'Serviced Apartment in Da Nang',
                artifact_id: 'art_tt_auto_1',
                artifact_version: 1,
                content_hash: contentHash,
                artifact_payload: { result },
                artifact_evidence: evidence,
                channel_id: 'chan_tt_1',
                platform_name: 'tiktok',
                channel_identifier: '-000JvtQLhT5vDvZfvn1ILhclrK2XOs5qiyP',
                utm_url: null,
                approval_status: 'approved',
                external_post_id: null,
              },
            ],
          };
        }
        if (sql.includes('tiktok_oauth_tokens')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
    } as any;

    let rendererCalled = 0;
    const runner = new PublishingOutboxRunner(mockPool, registry, {
      autoVideoRenderer: async (input) => {
        rendererCalled++;
        expect(input.imageUrl).toContain('images.unsplash.com');
        expect(input.sourceId).toBe('src_apt_01');
        return fakeMp4;
      },
    });

    const outcome = await runner.runOnce();
    expect(outcome).toBe('published');
    expect(rendererCalled).toBe(1);
    expect(publisher.requests).toHaveLength(1);
    expect(publisher.requests[0].mediaPath).toBe(fakeMp4);
    expect(publisher.requests[0].mediaType).toBe('video');
    expect(publisher.requests[0].mediaUrl).toBeUndefined();
    expect(
      sqlCalls.some(
        (c) => c.sql.includes("UPDATE publishing_jobs SET media_path = $2, media_type = 'video'") && c.params[1] === fakeMp4,
      ),
    ).toBe(true);
    expect(
      sqlCalls.some((c) => c.sql.includes('UPDATE tiktok_videos SET file_path = $2') && c.params[1] === fakeMp4),
    ).toBe(true);
  });
});
