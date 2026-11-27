/**
 * Tests for PublishJobProcessor — independent, mock-based (preparation for MY-04/MY-05).
 * Run: npm test (vitest)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PublisherRegistry, MockCmsPublisher } from '../CmsPublisher';
import { PublishJobProcessor } from '../PublishJobProcessor';
import { generateManualPack, generateManualPacks } from '../ManualPackGenerator';

describe('PublishJobProcessor', () => {
  let registry: PublisherRegistry;
  let processor: PublishJobProcessor;

  beforeEach(() => {
    registry = new PublisherRegistry();
    registry.register('Website', new MockCmsPublisher('Website', 'success'));
    registry.register('Facebook', new MockCmsPublisher('Facebook', 'timeout'));
    processor = new PublishJobProcessor(registry);
  });

  it('should publish successfully to Website channel', async () => {
    const result = await processor.publish({
      jobId: 'job_1',
      workspaceId: 'ws_1',
      contentId: 'content_1',
      channel: 'Website',
      scheduledAt: new Date(Date.now() + 60000),
      idempotencyKey: 'publish:ws_1:content_1:Website:1',
      bodyMarkdown: '# Hello',
      expectedVersion: 1,
      contentHash: 'abc123',
    });
    expect(result.success).toBe(true);
    expect(result.externalPostId).toBeDefined();
    expect(result.publishedUrl).toBeDefined();
  });

  it('should handle timeout without blind retry', async () => {
    const result = await processor.publish({
      jobId: 'job_2',
      workspaceId: 'ws_1',
      contentId: 'content_2',
      channel: 'Facebook',
      scheduledAt: new Date(Date.now() + 60000),
      idempotencyKey: 'publish:ws_1:content_2:Facebook:1',
      bodyMarkdown: '# Hello',
      expectedVersion: 1,
      contentHash: 'abc123',
    });
    // Timeout triggers reconcile path (no blind duplicate post).
    // Without an external id the reconcile looks the post up by idempotency key.
    expect(result.success).toBe(true);
    expect(result.externalPostId).toBe('publish:ws_1:content_2:Facebook:1');
  });

  it('should build idempotency key correctly', () => {
    const key = processor.buildIdempotencyKey({
      jobId: 'job_3',
      workspaceId: 'ws_1',
      contentId: 'content_3',
      channel: 'Website',
      scheduledAt: new Date(),
      idempotencyKey: '',
      bodyMarkdown: '# Test',
      expectedVersion: 2,
      contentHash: 'hash',
    });
    expect(key).toBe('publish:ws_1:content_3:Website:2');
  });

  it('should generate manual pack for social channels', () => {
    const packs = processor.generateManualPack(
      {
        jobId: 'job_4',
        workspaceId: 'ws_1',
        contentId: 'content_4',
        channel: 'Facebook',
        scheduledAt: new Date(),
        idempotencyKey: 'key',
        bodyMarkdown: '# Visit Da Nang',
        metaTitle: 'Da Nang Guide',
        expectedVersion: 1,
        contentHash: 'hash',
        utmSource: 'facebook',
        utmMedium: 'social',
        utmCampaign: 'da-nang-housing',
      },
      ['Facebook', 'Instagram']
    );
    expect(packs).toHaveLength(2);
    expect(packs[0].label).toBe('manual-pack');
    expect(packs[0].channel).toBe('Facebook');
    expect(packs[1].channel).toBe('Instagram');
    expect(packs[0].instructions[0]).toContain('Mở Meta Business Suite');
  });

  it('should validate scheduled_at is in future', () => {
    const future = new Date(Date.now() + 60000);
    const past = new Date(Date.now() - 60000);
    expect(processor.isScheduledInFuture(future)).toBe(true);
    expect(processor.isScheduledInFuture(past)).toBe(false);
  });

  it('should fail fast when gateway denies at execution (MY-05 recheck)', async () => {
    const result = await processor.publish({
      jobId: 'job_gw',
      workspaceId: 'ws_1',
      contentId: 'content_gw',
      channel: 'Website',
      scheduledAt: new Date(Date.now() + 60000),
      idempotencyKey: 'publish:ws_1:content_gw:Website:1',
      bodyMarkdown: '# Hello',
      expectedVersion: 1,
      contentHash: 'abc123',
      gatewayCheck: async () => ({ authorized: false, denialReason: 'APPROVAL_NOT_GRANTED' }),
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('GATEWAY_DENIED');
  });

  it('should publish when gateway allows at execution', async () => {
    const result = await processor.publish({
      jobId: 'job_gw2',
      workspaceId: 'ws_1',
      contentId: 'content_gw2',
      channel: 'Website',
      scheduledAt: new Date(Date.now() + 60000),
      idempotencyKey: 'publish:ws_1:content_gw2:Website:1',
      bodyMarkdown: '# Hello',
      expectedVersion: 1,
      contentHash: 'abc123',
      gatewayCheck: async () => ({ authorized: true }),
    });
    expect(result.success).toBe(true);
  });

  it('should fail-fast with MISSING_MEDIA_ASSET when post requires image but media is absent', async () => {
    const result = await processor.publish({
      jobId: 'job_img_missing',
      workspaceId: 'ws_1',
      contentId: 'content_img_missing',
      channel: 'Facebook',
      scheduledAt: new Date(Date.now() + 60000),
      idempotencyKey: 'publish:ws_1:content_img_missing:Facebook:1',
      bodyMarkdown: '# Post with missing image',
      expectedVersion: 1,
      contentHash: 'abc123',
      requiresImage: true,
      imageContentHash: 'e'.repeat(64),
      mediaUrl: undefined,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('MISSING_MEDIA_ASSET');
    expect(result.errorMessage).toContain('không tìm thấy file ảnh hợp lệ từ media_assets');
  });
});

describe('ManualPackGenerator', () => {
  it('should generate pack with instructions and UTM', () => {
    const job: any = {
      contentId: 'c1',
      workspaceId: 'ws_1',
      title: 'Da Nang Housing',
      bodyMarkdown: '# Da Nang Housing Guide',
      metaTitle: 'Da Nang Housing',
      slug: 'da-nang-housing',
      utmSource: 'facebook',
      utmMedium: 'social',
      utmCampaign: 'da-nang-housing',
    };
    const pack = generateManualPack(job, 'Facebook');
    expect(pack.label).toBe('manual-pack');
    expect(pack.utmSource).toBe('facebook');
    expect(pack.utmMedium).toBe('social');
    expect(pack.utmCampaign).toBe('da-nang-housing');
    expect(pack.instructions.length).toBeGreaterThan(0);
  });

  it('should attach image file, content_hash and storage_key to ManualPack when image is present', () => {
    const fakeHash = 'a'.repeat(64);
    const job: any = {
      contentId: 'c2',
      workspaceId: 'ws_1',
      title: 'Studio Apartment',
      bodyMarkdown: 'Chi tiết phòng Studio view biển',
      mediaUrl: 'http://localhost:3000/uploads/generated/studio_room.webp',
      mediaType: 'image',
      isAiGenerated: true,
      imageContentHash: fakeHash,
      storageKey: 'generated/studio_room.webp',
      imageFileName: 'studio_room.webp',
      imageFileContent: 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==',
    };
    const pack = generateManualPack(job, 'FacebookGroup');
    expect(pack.imageContentHash).toBe(fakeHash);
    expect(pack.storageKey).toBe('generated/studio_room.webp');
    expect(pack.imageFileName).toBe('studio_room.webp');
    expect(pack.hasMissingAsset).toBeFalsy();
    expect(pack.files['studio_room.webp']).toBe('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==');
    expect(pack.files['media_urls.txt']).toContain(`Content Hash (SHA-256): ${fakeHash}`);
    expect(pack.files['media_urls.txt']).toContain('Storage Key: generated/studio_room.webp');
    expect(pack.files['metadata.json']).toContain(fakeHash);
    expect(pack.instructions.some((inst) => inst.includes(fakeHash))).toBe(true);
  });

  it('should clearly reject and warn with ERROR_MISSING_IMAGE when required image is absent', () => {
    const fakeHash = 'b'.repeat(64);
    const job: any = {
      contentId: 'c3',
      workspaceId: 'ws_1',
      title: 'Studio Apartment Without Image',
      bodyMarkdown: 'Mô tả căn hộ nhưng không có ảnh',
      requiresImage: true,
      imageContentHash: fakeHash,
      mediaUrl: undefined,
      storageKey: undefined,
    };
    const pack = generateManualPack(job, 'FacebookGroup');
    expect(pack.hasMissingAsset).toBe(true);
    expect(pack.missingAssetReason).toContain('Thiếu file ảnh hợp lệ từ media_assets');
    expect(pack.files['ERROR_MISSING_IMAGE.txt']).toBeDefined();
    expect(pack.files['ERROR_MISSING_IMAGE.txt']).toContain('KHÔNG ĐƯỢC ĐĂNG BÀI HỎNG');
    expect(pack.instructions[0]).toContain('CẢNH BÁO QUAN TRỌNG: Bài viết này bị thiếu file ảnh');
  });
});