import type { CmsPublisher, CmsPublishRequest, CmsPublishResult } from './CmsPublisher';
import { generateManualPack, type ManualPack } from './ManualPackGenerator';

/**
 * TikTok Content Posting API Adapter (Direct Post video/photo).
 *
 * Tuân thủ chính sách hiện hành của TikTok:
 * 1. Direct Post video (/v2/post/publish/video/init/) hoặc Photo Mode (/v2/post/publish/content/init/).
 * 2. Media URL công khai đã xác thực (HTTP/HTTPS).
 * 3. tiktok_privacy_level mặc định SELF_ONLY khi thử nghiệm (an toàn tuyệt đối).
 * 4. Nhãn nội dung AI (is_aigc: true) theo chính sách AIGC hiện hành của TikTok.
 * 5. Fallback tự động sang ManualPackGenerator khi bị từ chối quyền (401/403 Permission Denied - chưa duyệt app).
 */
export class TikTokPublisher implements CmsPublisher {
  channel = 'TikTok' as const;
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly openId?: string;
  readonly privacyLevel: string;

  constructor(
    accessToken: string,
    openId?: string,
    privacyLevel = process.env.TIKTOK_PRIVACY_LEVEL || 'SELF_ONLY',
    baseUrl = process.env.TIKTOK_API_BASE_URL || 'https://open.tiktokapis.com',
  ) {
    this.accessToken = accessToken;
    this.openId = openId;
    this.privacyLevel = TikTokPublisher.validatePrivacyLevel(privacyLevel);
    this.baseUrl = baseUrl;
  }

  /**
   * Kiểm tra mức quyền riêng tư hợp lệ theo TikTok API. Mặc định SELF_ONLY khi thử nghiệm.
   */
  static validatePrivacyLevel(level: string): string {
    const validLevels = ['SELF_ONLY', 'PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR'];
    return validLevels.includes(level) ? level : 'SELF_ONLY';
  }

  /**
   * Xác thực media URL công khai hợp lệ.
   */
  static isValidPublicMediaUrl(url?: string): boolean {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async publish(req: CmsPublishRequest): Promise<CmsPublishResult & { manualPack?: ManualPack }> {
    if (!req.mediaUrl || !TikTokPublisher.isValidPublicMediaUrl(req.mediaUrl)) {
      return {
        success: false,
        errorCode: 'TIKTOK_MEDIA_REQUIRED',
        errorMessage: 'TikTok Direct Post requires an approved, validated public video or image URL (http/https)',
      };
    }

    const isAiGenerated = Boolean(req.isAiGenerated || req.aiImageMeta);
    let title = (req.metaTitle || toPlainText(req.bodyMarkdown)).slice(0, 2200);

    // Gắn nhãn AIGC trong caption theo chính sách TikTok
    if (isAiGenerated && !title.includes('#AIGC')) {
      title = `${title} #AIGC #AIcontent`.trim();
    }

    const isImageMode = req.mediaType === 'image';
    const path = isImageMode ? '/v2/post/publish/content/init/' : '/v2/post/publish/video/init/';

    const postInfo: Record<string, unknown> = {
      title,
      privacy_level: this.privacyLevel,
      disable_duet: false,
      disable_stitch: false,
      disable_comment: false,
      is_aigc: isAiGenerated, // Cờ nhãn nội dung do AI tạo theo chính sách TikTok
    };

    let requestBody: Record<string, unknown>;

    if (isImageMode) {
      // Photo Mode (Direct Post Content)
      requestBody = {
        post_info: {
          ...postInfo,
          description: title,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          photo_cover_index: 0,
          photo_images: [req.mediaUrl],
        },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
      };
    } else {
      // Video Direct Post
      requestBody = {
        post_info: {
          ...postInfo,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: req.mediaUrl,
        },
      };
    }

    try {
      const response = await this.request(path, requestBody);

      if (!response.ok || typeof response.payload?.data?.publish_id !== 'string') {
        const isPermissionDenied =
          response.status === 401 ||
          response.status === 403 ||
          response.payload?.error?.code === 'scope_not_authorized' ||
          response.payload?.error?.code === 'access_token_invalid' ||
          String(response.payload?.error?.message).toLowerCase().includes('permission') ||
          String(response.payload?.error?.message).toLowerCase().includes('scope');

        if (isPermissionDenied) {
          // Tự động rơi về ManualPackGenerator khi app chưa được TikTok duyệt quyền
          const manualPack = generateManualPack(
            {
              contentId: req.contentId,
              workspaceId: req.workspaceId,
              title: req.metaTitle,
              bodyMarkdown: title,
              mediaUrl: req.mediaUrl,
              mediaType: req.mediaType,
              isAiGenerated,
            },
            'TikTok'
          );

          return {
            success: true,
            isManualFallback: true,
            externalPostId: `manual_pack_tiktok_${req.contentId}`,
            manualPack,
            errorCode: 'TIKTOK_PERMISSION_DENIED',
            errorMessage: `TikTok App Review pending / Permission denied (${providerError(response.payload, response.status)}). Fallback to Manual Pack generated.`,
          };
        }

        return {
          success: false,
          errorCode: 'TIKTOK_PUBLISH_FAILED',
          errorMessage: providerError(response.payload, response.status),
        };
      }

      const publishId = response.payload.data.publish_id as string;
      return { success: true, externalPostId: publishId, publishedAt: new Date() };
    } catch (error) {
      return {
        success: false,
        errorCode: 'CMS_UNKNOWN_OUTCOME',
        errorMessage: error instanceof Error ? error.message : 'TikTok request failed',
      };
    }
  }

  async reconcile(externalPostId: string): Promise<CmsPublishResult> {
    if (!externalPostId) return { success: false, errorCode: 'TIKTOK_RECONCILE_MISSING_ID' };

    // Nếu là manual fallback pack, đối soát thành công ngay
    if (externalPostId.startsWith('manual_pack_')) {
      return { success: true, externalPostId, publishedAt: new Date() };
    }

    try {
      const response = await this.request('/v2/post/publish/status/fetch/', { publish_id: externalPostId });
      if (!response.ok) {
        return {
          success: false,
          errorCode: 'TIKTOK_STATUS_FAILED',
          errorMessage: providerError(response.payload, response.status),
        };
      }
      const status = response.payload?.data?.status as string | undefined;
      if (status === 'FAILED') {
        return {
          success: false,
          errorCode: 'TIKTOK_PUBLISH_FAILED',
          errorMessage: String(response.payload?.data?.fail_reason || 'TikTok rejected the post'),
        };
      }
      return { success: true, externalPostId, publishedAt: new Date() };
    } catch (error) {
      return {
        success: false,
        errorCode: 'CMS_UNKNOWN_OUTCOME',
        errorMessage: error instanceof Error ? error.message : 'TikTok status request failed',
      };
    }
  }

  private async request(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; payload: Record<string, any> }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    };
    if (this.openId) headers['X-Open-Id'] = this.openId;
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Number(process.env.SOCIAL_REQUEST_TIMEOUT_MS || 10000)),
    });
    let payload: Record<string, any> = {};
    try {
      payload = (await response.json()) as Record<string, any>;
    } catch {
      /* provider may return empty body */
    }
    const errorCode = payload.error?.code;
    return { ok: response.ok && (errorCode === undefined || errorCode === 'ok'), status: response.status, payload };
  }
}

function toPlainText(markdown: string): string {
  return markdown.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim();
}

function providerError(payload: Record<string, any>, status: number): string {
  const message = payload?.error?.message || payload?.error?.log_id || payload?.message;
  return typeof message === 'string' ? message : `TikTok API HTTP ${status}`;
}
