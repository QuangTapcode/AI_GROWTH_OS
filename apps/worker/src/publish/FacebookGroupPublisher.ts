import type { CmsPublisher, CmsPublishRequest, CmsPublishResult, PublishChannel } from './CmsPublisher';
import { generateManualPack, type ManualPack } from './ManualPackGenerator';
import { FacebookGroupBot } from './FacebookGroupBot';

const DEFAULT_GROUP_URL = 'https://www.facebook.com/groups/1134282109069209';

function resolveGroupUrl(linkUrl?: string, groupId?: string): string {
  if (linkUrl && /^https:\/\/(www\.|m\.)?facebook\.com\/groups\//i.test(linkUrl)) {
    return linkUrl;
  }
  if (groupId) {
    return `https://www.facebook.com/groups/${groupId}`;
  }
  return process.env.FACEBOOK_GROUP_URL?.trim() || DEFAULT_GROUP_URL;
}

function toPlainText(md?: string): string {
  if (!md) return '';
  return md
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .trim();
}

/**
 * Facebook Group Publisher hỗ trợ cả hai chế độ:
 * 1. Graph API v21.0 qua Page Admin Access Token (CM-28 / CM-29) kèm Fallback ManualPack 1-click.
 * 2. Puppeteer FacebookGroupBot automation qua session (.fb-session.json hoặc FB_ADMIN_COOKIE).
 */
export class FacebookGroupPublisher implements CmsPublisher {
  channel: PublishChannel = 'FacebookGroup';
  private readonly groupId?: string;
  private readonly accessToken?: string;
  readonly graphVersion: string;

  constructor(
    groupId?: string,
    accessToken?: string,
    graphVersion = process.env.FACEBOOK_GRAPH_API_VERSION || 'v21.0',
  ) {
    this.groupId = groupId;
    this.accessToken = accessToken;
    this.graphVersion = FacebookGroupPublisher.validateAndNormalizeVersion(graphVersion);
  }

  static validateAndNormalizeVersion(version: string): string {
    const trimmed = version.trim();
    const match = trimmed.match(/^v(\d+)\.(\d+)$/);
    if (!match) return 'v21.0';
    const major = parseInt(match[1], 10);
    if (major < 21) return 'v21.0';
    return trimmed;
  }

  private endpoint(path: string): string {
    return `https://graph.facebook.com/${this.graphVersion}/${this.groupId}/${path}`;
  }

  async publish(req: CmsPublishRequest): Promise<CmsPublishResult & { manualPack?: ManualPack }> {
    // Chế độ 1: Graph API v21.0 Publisher (khi có groupId và accessToken)
    if (this.groupId && this.accessToken) {
      const text = toPlainText(req.bodyMarkdown);
      let message = text;
      if (!message && !req.mediaUrl) {
        return { success: false, errorCode: 'GROUP_EMPTY_MESSAGE', errorMessage: 'Facebook Group post requires text or image' };
      }

      const isAiGenerated = Boolean(req.isAiGenerated || req.aiImageMeta);

      // Gắn nhãn ảnh AI minh bạch theo chính sách của Meta
      if (isAiGenerated && !message.includes('[Ảnh tạo bởi AI]')) {
        message = `${message}\n\n[Ảnh tạo bởi AI]\n#AIgenerated #ImaginedWithAI`;
      }

      const hasImage = Boolean(req.mediaUrl && (req.mediaType === 'image' || !req.mediaType));
      const targetPath = hasImage ? 'photos' : 'feed';

      const body = new URLSearchParams();
      body.set('access_token', this.accessToken);

      if (hasImage && req.mediaUrl) {
        body.set('url', req.mediaUrl);
        if (message) body.set('caption', message);
        if (isAiGenerated) {
          body.set('is_ai_generated', 'true');
          body.set('ai_source_type', 'trainedAlgorithmicMedia');
        }
      } else {
        if (message) body.set('message', message);
      }

      try {
        const response = await fetch(this.endpoint(targetPath), {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
          signal: AbortSignal.timeout(Number(process.env.SOCIAL_REQUEST_TIMEOUT_MS || 10000)),
        });

        const payload = (await response.json().catch(() => ({}))) as any;

        if (!response.ok || (typeof payload?.id !== 'string' && typeof payload?.post_id !== 'string')) {
          // Tự động rơi về ManualPack 1-click cho Quản trị viên Group
          const manualPack = generateManualPack(
            {
              contentId: req.contentId,
              workspaceId: req.workspaceId,
              title: req.metaTitle,
              bodyMarkdown: message,
              mediaUrl: req.mediaUrl,
              mediaType: req.mediaType,
              isAiGenerated,
            },
            'FacebookGroup'
          );

          return {
            success: true,
            isManualFallback: true,
            externalPostId: `manual_group_${req.contentId}`,
            publishedUrl: `https://www.facebook.com/groups/${this.groupId}`,
            publishedAt: new Date(),
            manualPack,
          };
        }

        const externalPostId = (payload.id || payload.post_id) as string;
        return {
          success: true,
          externalPostId,
          publishedUrl: `https://www.facebook.com/groups/${this.groupId}/posts/${externalPostId}`,
          publishedAt: new Date(),
        };
      } catch {
        // Fallback về ManualPack khi kết nối lỗi
        const manualPack = generateManualPack(
          {
            contentId: req.contentId,
            workspaceId: req.workspaceId,
            title: req.metaTitle,
            bodyMarkdown: message,
            mediaUrl: req.mediaUrl,
            mediaType: req.mediaType,
            isAiGenerated,
          },
          'FacebookGroup'
        );

        return {
          success: true,
          isManualFallback: true,
          externalPostId: `manual_group_${req.contentId}`,
          publishedUrl: `https://www.facebook.com/groups/${this.groupId}`,
          publishedAt: new Date(),
          manualPack,
        };
      }
    }

    // Chế độ 2: FacebookGroupBot (Puppeteer browser automation)
    const groupUrl = resolveGroupUrl(req.linkUrl, this.groupId);
    if (!FacebookGroupBot.hasSavedSession()) {
      return {
        success: false,
        errorCode: 'FACEBOOK_GROUP_SESSION_MISSING',
        errorMessage:
          'Chưa có phiên đăng nhập Quản trị viên Facebook Group (.fb-session.json hoặc FB_ADMIN_COOKIE). Hệ thống dừng đăng bài để không đăng nhầm lên Fanpage.',
      };
    }

    const message = req.bodyMarkdown?.trim() || req.metaTitle?.trim() || '';
    if (!message && !req.mediaUrl) {
      return {
        success: false,
        errorCode: 'FACEBOOK_GROUP_EMPTY_MESSAGE',
        errorMessage: 'Bài viết Facebook Group yêu cầu có nội dung văn bản hoặc hình ảnh.',
      };
    }

    try {
      const bot = new FacebookGroupBot();
      const res = await bot.postToGroup({
        groupUrl,
        title: req.metaTitle?.trim() || 'Cẩm nang Cộng đồng Du lịch & Sống tại Việt Nam',
        body: message,
        imageUrl: req.mediaUrl,
        headless: true,
      });

      return {
        success: true,
        externalPostId: res.externalPostId || `fb_group_${req.idempotencyKey.slice(0, 16)}`,
        publishedUrl: res.postUrl || res.groupUrl || groupUrl,
        publishedAt: new Date(res.publishedAt),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Facebook Group bot publish failed';
      const errorCode = msg.startsWith('FACEBOOK_GROUP_SESSION_MISSING')
        ? 'FACEBOOK_GROUP_SESSION_MISSING'
        : 'FACEBOOK_GROUP_PUBLISH_FAILED';
      return {
        success: false,
        errorCode,
        errorMessage: msg,
      };
    }
  }

  async reconcile(externalPostId: string): Promise<CmsPublishResult> {
    if (externalPostId.startsWith('manual_group_')) {
      return {
        success: true,
        externalPostId,
        publishedUrl: this.groupId ? `https://www.facebook.com/groups/${this.groupId}` : resolveGroupUrl(undefined, this.groupId),
        publishedAt: new Date(),
        reconciled: true,
      };
    }

    if (this.groupId && this.accessToken && !externalPostId.startsWith('http')) {
      const url = new URL(`https://graph.facebook.com/${this.graphVersion}/${externalPostId}`);
      url.searchParams.set('fields', 'id,permalink_url');
      url.searchParams.set('access_token', this.accessToken);

      try {
        const response = await fetch(url.toString(), {
          signal: AbortSignal.timeout(Number(process.env.SOCIAL_REQUEST_TIMEOUT_MS || 10000)),
        });
        const payload = (await response.json().catch(() => ({}))) as any;
        if (!response.ok || typeof payload?.id !== 'string') {
          return {
            success: false,
            errorCode: 'FACEBOOK_GROUP_RECONCILE_FAILED',
            errorMessage: payload?.error?.message || `Facebook Group API HTTP ${response.status}`,
          };
        }
        return {
          success: true,
          externalPostId: payload.id,
          publishedUrl: typeof payload.permalink_url === 'string'
            ? payload.permalink_url
            : `https://www.facebook.com/groups/${this.groupId}/posts/${payload.id}`,
          publishedAt: new Date(),
          reconciled: true,
        };
      } catch (error) {
        return {
          success: false,
          errorCode: 'CMS_UNKNOWN_OUTCOME',
          errorMessage: error instanceof Error ? error.message : 'Facebook Group reconcile failed',
        };
      }
    }

    if (
      externalPostId &&
      /^https:\/\/(www\.|m\.)?facebook\.com\/groups\/.*\/(posts|permalink)\//i.test(externalPostId)
    ) {
      return {
        success: true,
        externalPostId,
        publishedUrl: externalPostId,
        publishedAt: new Date(),
        reconciled: true,
      };
    }

    return {
      success: false,
      errorCode: 'POST_NOT_FOUND',
      errorMessage: 'Không thể đối soát bài Facebook Group chưa có permalink xác nhận.',
    };
  }
}
