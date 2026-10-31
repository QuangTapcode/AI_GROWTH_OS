import type { CmsPublisher, CmsPublishRequest, CmsPublishResult } from './CmsPublisher';
import { generateManualPack, type ManualPack } from './ManualPackGenerator';

/**
 * Facebook Page Graph API Publisher (Graph API v21.0).
 *
 * Tuân thủ chính sách hiện hành của Meta:
 * 1. Graph API v21.0 (kiểm tra phiên bản hiện hành trước khi dùng).
 * 2. Đăng Caption + Ảnh (endpoint /photos) hoặc Text/Link (endpoint /feed).
 * 3. Ảnh AI phải gắn nhãn rõ ràng: thông báo trong caption và cờ metadata theo chuẩn Meta IPTC.
 * 4. Fallback tự động sang ManualPackGenerator khi bị từ chối quyền (401/403 Permission Denied - chưa duyệt app).
 */
export class FacebookPagePublisher implements CmsPublisher {
  channel = 'Facebook' as const;
  private readonly pageId: string;
  private readonly accessToken: string;
  readonly graphVersion: string;

  constructor(
    pageId: string,
    accessToken: string,
    graphVersion = process.env.FACEBOOK_GRAPH_API_VERSION || 'v21.0',
  ) {
    this.pageId = pageId;
    this.accessToken = accessToken;
    this.graphVersion = FacebookPagePublisher.validateAndNormalizeVersion(graphVersion);
  }

  /**
   * Kiểm tra và chuẩn hóa Graph API version. Đảm bảo dùng v21.0 trở lên theo chuẩn Meta 2026.
   */
  static validateAndNormalizeVersion(version: string): string {
    const trimmed = version.trim();
    const match = trimmed.match(/^v(\d+)\.(\d+)$/);
    if (!match) {
      return 'v21.0';
    }
    const major = parseInt(match[1], 10);
    // Nếu truyền phiên bản cũ hơn v21, nâng cấp lên v21.0 hiện hành
    if (major < 21) {
      return 'v21.0';
    }
    return trimmed;
  }

  private endpoint(path: string): string {
    return `https://graph.facebook.com/${this.graphVersion}/${this.pageId}/${path}`;
  }

  async publish(req: CmsPublishRequest): Promise<CmsPublishResult & { manualPack?: ManualPack }> {
    let message = toPlainText(req.bodyMarkdown);
    if (!message && !req.mediaUrl) {
      return { success: false, errorCode: 'FACEBOOK_EMPTY_MESSAGE', errorMessage: 'Facebook Page post requires text or image' };
    }

    const isAiGenerated = Boolean(req.isAiGenerated || req.aiImageMeta);

    // Gắn nhãn ảnh AI theo chính sách minh bạch của Meta
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
      if (req.linkUrl) body.set('link', req.linkUrl);
    }

    try {
      const response = await fetch(this.endpoint(targetPath), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(Number(process.env.SOCIAL_REQUEST_TIMEOUT_MS || 10000)),
      });

      const payload = await readJson(response);

      if (!response.ok || (typeof payload?.id !== 'string' && typeof payload?.post_id !== 'string')) {
        const isPermissionDenied =
          response.status === 401 ||
          response.status === 403 ||
          payload?.error?.code === 190 || // Invalid OAuth access token
          payload?.error?.code === 200 || // Permission error
          payload?.error?.code === 10 || // Application does not have permission
          String(payload?.error?.message).toLowerCase().includes('permission');

        if (isPermissionDenied) {
          // Tự động rơi về ManualPackGenerator khi chưa được duyệt Meta App Review
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
            'Facebook'
          );

          return {
            success: true,
            isManualFallback: true,
            externalPostId: `manual_pack_facebook_${req.contentId}`,
            manualPack,
            errorCode: 'FACEBOOK_PERMISSION_DENIED',
            errorMessage: `Meta App Review pending / Permission denied (${providerError(payload, response.status)}). Fallback to Manual Pack generated.`,
          };
        }

        return {
          success: false,
          errorCode: 'FACEBOOK_PUBLISH_FAILED',
          errorMessage: providerError(payload, response.status),
        };
      }

      const externalId = (payload.id || payload.post_id) as string;
      return {
        success: true,
        externalPostId: externalId,
        publishedUrl: `https://www.facebook.com/${externalId}`,
        publishedAt: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        errorCode: 'CMS_UNKNOWN_OUTCOME',
        errorMessage: error instanceof Error ? error.message : 'Facebook request failed',
      };
    }
  }

  async reconcile(externalPostId: string): Promise<CmsPublishResult> {
    if (!externalPostId) return { success: false, errorCode: 'FACEBOOK_RECONCILE_MISSING_ID' };

    // Nếu là manual fallback pack, đối soát thành công ngay
    if (externalPostId.startsWith('manual_pack_')) {
      return { success: true, externalPostId, publishedAt: new Date() };
    }

    const url = new URL(`https://graph.facebook.com/${this.graphVersion}/${externalPostId}`);
    url.searchParams.set('fields', 'id,permalink_url');
    url.searchParams.set('access_token', this.accessToken);

    try {
      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(Number(process.env.SOCIAL_REQUEST_TIMEOUT_MS || 10000)),
      });
      const payload = await readJson(response);
      if (!response.ok || typeof payload?.id !== 'string') {
        return {
          success: false,
          errorCode: 'FACEBOOK_RECONCILE_FAILED',
          errorMessage: providerError(payload, response.status),
        };
      }
      return {
        success: true,
        externalPostId: payload.id,
        publishedUrl: typeof payload.permalink_url === 'string' ? payload.permalink_url : undefined,
        publishedAt: new Date(),
      };
    } catch (error) {
      return {
        success: false,
        errorCode: 'CMS_UNKNOWN_OUTCOME',
        errorMessage: error instanceof Error ? error.message : 'Facebook reconcile failed',
      };
    }
  }
}

export { FacebookPagePublisher as FacebookPublisher };

// Facebook renders plain text: drop markdown syntax but keep paragraph breaks
// and hashtags (`#Brand`), which the Content social pack relies on.
function toPlainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readJson(response: Response): Promise<Record<string, any>> {
  try {
    return (await response.json()) as Record<string, any>;
  } catch {
    return {};
  }
}

function providerError(payload: Record<string, any>, status: number): string {
  const message = payload?.error?.message || payload?.message;
  return typeof message === 'string' ? message : `Facebook API HTTP ${status}`;
}
