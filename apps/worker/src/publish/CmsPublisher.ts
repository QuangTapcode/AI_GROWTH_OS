/**
 * CMS Publisher interface & mock implementation (preparation for MY-04/MY-05).
 *
 * This file is independent of other pending tasks. When TQ-04 contract is ready,
 * replace HttpCmsPublisher with real CMS adapter. Until then, MockCmsPublisher
 * simulates success/failure/timeout so publish flow can be tested locally.
 */

import type { PublishJob } from '../jobs/JobState';

export type PublishChannel = 'Website' | 'Facebook' | 'Instagram' | 'Newsletter';

export interface CmsPublishRequest {
  contentId: string;
  channel: PublishChannel;
  bodyMarkdown: string;
  metaTitle?: string;
  metaDescription?: string;
  slug?: string;
  scheduledAt?: Date;
  idempotencyKey: string;
  workspaceId: string;
}

export interface CmsPublishResult {
  externalPostId?: string;
  publishedUrl?: string;
  publishedAt?: Date;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export abstract class CmsPublisher {
  abstract channel: PublishChannel;
  abstract publish(req: CmsPublishRequest): Promise<CmsPublishResult>;
  abstract reconcile(externalPostId: string): Promise<CmsPublishResult>;
}

/**
 * Mock CMS publisher — simulates real CMS behavior for local testing.
 * Modes: success | timeout | conflict | unknown.
 */
export class MockCmsPublisher extends CmsPublisher {
  constructor(public channel: PublishChannel, private mode: 'success' | 'timeout' | 'conflict' | 'unknown' = 'success') {
    super();
  }

  async publish(req: CmsPublishRequest): Promise<CmsPublishResult> {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (this.mode === 'timeout') {
      return { success: false, errorCode: 'CMS_TIMEOUT', errorMessage: 'CMS did not respond within timeout' };
    }

    if (this.mode === 'conflict') {
      return {
        success: false,
        errorCode: 'IDEMPOTENCY_CONFLICT',
        errorMessage: 'Same idempotency key with different payload',
      };
    }

    if (this.mode === 'unknown') {
      return {
        success: false,
        errorCode: 'CMS_UNKNOWN_OUTCOME',
        errorMessage: 'CMS did not confirm whether post was created',
      };
    }

    return {
      externalPostId: `mock_${this.channel}_${req.idempotencyKey.slice(0, 8)}`,
      publishedUrl: `https://tripc.vn/${req.channel.toLowerCase()}/${req.slug || req.contentId}`,
      publishedAt: new Date(),
      success: true,
    };
  }

  async reconcile(externalPostId: string): Promise<CmsPublishResult> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      externalPostId,
      success: true,
      publishedUrl: `https://tripc.vn/reconciled/${externalPostId}`,
      publishedAt: new Date(),
    };
  }
}

/**
 * Publisher registry — maps channel to publisher instance.
 * Easy to swap mock for real adapter when TQ-04/TQ-06 contract is ready.
 */
export class PublisherRegistry {
  private publishers = new Map<PublishChannel, CmsPublisher>();

  register(channel: PublishChannel, publisher: CmsPublisher) {
    this.publishers.set(channel, publisher);
  }

  get(channel: PublishChannel): CmsPublisher | undefined {
    return this.publishers.get(channel);
  }

  has(channel: PublishChannel): boolean {
    return this.publishers.has(channel);
  }
}

export const defaultRegistry = new PublisherRegistry();

// Register mock publishers for all channels (MY-02 decided manual pack for social)
defaultRegistry.register('Website', new MockCmsPublisher('Website', 'success'));
defaultRegistry.register('Facebook', new MockCmsPublisher('Facebook', 'success'));
defaultRegistry.register('Instagram', new MockCmsPublisher('Instagram', 'success'));
defaultRegistry.register('Newsletter', new MockCmsPublisher('Newsletter', 'success'));