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
    // Mock reconcile returns success with empty externalPostId — assert reconciled.
    expect(result.success).toBe(true);
    expect(result.externalPostId).toBe('');
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
    expect(packs[0].instructions[0]).toContain('Open Facebook business page');
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
});