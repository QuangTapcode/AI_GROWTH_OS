import fs from 'node:fs';
import type { CmsPublisher, CmsPublishRequest, CmsPublishResult } from './CmsPublisher';
import { generateManualPack, type ManualPack } from './ManualPackGenerator';

const SINGLE_CHUNK_MAX_BYTES = 64 * 1024 * 1024; // TikTok allows single-chunk uploads up to 64 MB
const MULTI_CHUNK_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per chunk for > 64 MB videos

/**
 * Compute TikTok FILE_UPLOAD chunk parameters respecting TikTok's 5 MB–64 MB rules:
 * - <= 64 MB: single chunk equal to exact video size.
 * - > 64 MB: 10 MB chunks, floor division so final chunk carries remainder (>= 10 MB, < 20 MB).
 */
export function calculateTikTokChunkPlan(videoSize: number): {
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
} {
  if (!Number.isFinite(videoSize) || videoSize <= 0) {
    throw new Error('Video file is empty.');
  }
  if (videoSize <= SINGLE_CHUNK_MAX_BYTES) {
    return { videoSize, chunkSize: videoSize, totalChunkCount: 1 };
  }
  const totalChunkCount = Math.floor(videoSize / MULTI_CHUNK_SIZE_BYTES);
  return {
    videoSize,
    chunkSize: MULTI_CHUNK_SIZE_BYTES,
    totalChunkCount,
  };
}

/**
 * TikTok Content Posting API Adapter (Direct Post video/photo).
 *
 * Tuân thủ chính sách hiện hành của TikTok:
 * 1. Direct Post video (/v2/post/publish/video/init/) qua FILE_UPLOAD hoặc PULL_FROM_URL, hoặc Photo Mode (/v2/post/publish/content/init/).
 * 2. Media file (.mp4/.mov) cục bộ hoặc URL công khai đã xác thực (HTTP/HTTPS).
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
    const hasFileUpload = Boolean(req.mediaPath && fs.existsSync(req.mediaPath));
    const hasValidUrl = Boolean(req.mediaUrl && TikTokPublisher.isValidPublicMediaUrl(req.mediaUrl));

    if (req.mediaPath && !hasFileUpload && !hasValidUrl) {
      return {
        success: false,
        errorCode: 'TIKTOK_MEDIA_FILE_MISSING',
        errorMessage: `Uploaded TikTok video file is missing for content ${req.contentId}`,
      };
    }

    if (!hasFileUpload && !hasValidUrl) {
      return {
        success: false,
        errorCode: 'TIKTOK_MEDIA_REQUIRED',
        errorMessage: 'TikTok Direct Post requires an approved, validated public video/image URL (http/https) or local .mp4 upload',
      };
    }

    const activeToken = (req.authOverride?.accessToken || this.accessToken || '').trim();
    if (!activeToken) {
      return {
        success: false,
        errorCode: 'TIKTOK_ACCOUNT_NOT_CONNECTED',
        errorMessage: 'TikTok account is not connected. Connect TikTok in Workspace or Distribution first.',
      };
    }

    const authOverride: CmsPublishRequest['authOverride'] = {
      accessToken: activeToken,
      openId: req.authOverride?.openId || this.openId,
      privacyLevel: TikTokPublisher.validatePrivacyLevel(req.authOverride?.privacyLevel || this.privacyLevel),
    };

    const isAiGenerated = Boolean(req.isAiGenerated || req.aiImageMeta);
    const plainBody = toPlainTextKeepHashtags(req.bodyMarkdown);
    let title = (plainBody || (req.metaTitle ? req.metaTitle.trim() : '')).slice(0, 2200);

    // Gắn nhãn AIGC trong caption theo chính sách TikTok
    if (isAiGenerated && !title.includes('#AIGC')) {
      const suffix = ' #AIGC #AIcontent';
      title =
        title.length + suffix.length <= 2200
          ? `${title}${suffix}`.trim()
          : `${title.slice(0, 2200 - suffix.length).trim()}${suffix}`;
    }

    const isImageMode = !hasFileUpload && req.mediaType === 'image';
    const path = isImageMode ? '/v2/post/publish/content/init/' : '/v2/post/publish/video/init/';

    const postInfo: Record<string, unknown> = {
      title,
      privacy_level: authOverride.privacyLevel,
      disable_duet: false,
      disable_stitch: false,
      disable_comment: false,
      is_aigc: isAiGenerated, // Cờ nhãn nội dung do AI tạo theo chính sách TikTok
    };

    let requestBody: Record<string, unknown>;
    let chunkPlan: { videoSize: number; chunkSize: number; totalChunkCount: number } | null = null;

    if (hasFileUpload && req.mediaPath) {
      const stat = fs.statSync(req.mediaPath);
      try {
        chunkPlan = calculateTikTokChunkPlan(stat.size);
      } catch (err) {
        return {
          success: false,
          errorCode: 'TIKTOK_MEDIA_INVALID',
          errorMessage: err instanceof Error ? err.message : 'Uploaded TikTok video file is empty.',
        };
      }
      requestBody = {
        post_info: {
          ...postInfo,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: chunkPlan.videoSize,
          chunk_size: chunkPlan.chunkSize,
          total_chunk_count: chunkPlan.totalChunkCount,
        },
      };
    } else if (isImageMode) {
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
      // Video Direct Post (PULL_FROM_URL)
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
      const response = await this.request(path, requestBody, authOverride);

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

      if (hasFileUpload && req.mediaPath && chunkPlan) {
        const uploadUrl = response.payload?.data?.upload_url;
        if (typeof uploadUrl !== 'string' || !uploadUrl.trim()) {
          return {
            success: false,
            externalPostId: publishId,
            errorCode: 'TIKTOK_PUBLISH_FAILED',
            errorMessage: 'TikTok video/init response did not contain upload_url for FILE_UPLOAD.',
          };
        }

        const uploadResult = await this.uploadFileChunks(req.mediaPath, uploadUrl, chunkPlan, publishId);
        if (uploadResult) return uploadResult;
      }

      return { success: true, externalPostId: publishId, publishedAt: new Date() };
    } catch (error) {
      return {
        success: false,
        errorCode: 'CMS_UNKNOWN_OUTCOME',
        errorMessage: error instanceof Error ? error.message : 'TikTok request failed',
      };
    }
  }

  private async uploadFileChunks(
    filePath: string,
    uploadUrl: string,
    plan: { videoSize: number; chunkSize: number; totalChunkCount: number },
    publishId: string
  ): Promise<CmsPublishResult | null> {
    const timeoutMs = Number(process.env.TIKTOK_UPLOAD_TIMEOUT_MS || 120000);
    const fd = fs.openSync(filePath, 'r');
    try {
      for (let chunkIndex = 0; chunkIndex < plan.totalChunkCount; chunkIndex++) {
        const start = chunkIndex * plan.chunkSize;
        const endExclusive = chunkIndex === plan.totalChunkCount - 1 ? plan.videoSize : start + plan.chunkSize;
        const length = endExclusive - start;
        const buf = Buffer.allocUnsafe(length);

        let offset = 0;
        while (offset < length) {
          const bytesRead = fs.readSync(fd, buf, offset, length - offset, start + offset);
          if (bytesRead <= 0) {
            return {
              success: false,
              externalPostId: publishId,
              errorCode: 'TIKTOK_UPLOAD_FAILED',
              errorMessage: `Unexpected EOF reading chunk ${chunkIndex + 1}/${plan.totalChunkCount}`,
            };
          }
          offset += bytesRead;
        }

        const chunkRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: {
            'Content-Type': 'video/mp4',
            'Content-Length': String(length),
            'Content-Range': `bytes ${start}-${endExclusive - 1}/${plan.videoSize}`,
          },
          body: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!chunkRes.ok) {
          const isTransient = chunkRes.status === 408 || chunkRes.status >= 500;
          return {
            success: false,
            externalPostId: publishId,
            errorCode: isTransient ? 'CMS_TIMEOUT' : 'TIKTOK_UPLOAD_FAILED',
            errorMessage: `TikTok upload_url chunk ${chunkIndex + 1}/${plan.totalChunkCount} failed with HTTP ${chunkRes.status}`,
          };
        }
      }
      return null;
    } finally {
      fs.closeSync(fd);
    }
  }

  async reconcile(
    externalPostId: string,
    authOverride?: CmsPublishRequest['authOverride']
  ): Promise<CmsPublishResult> {
    if (!externalPostId) return { success: false, errorCode: 'TIKTOK_RECONCILE_MISSING_ID' };

    // Nếu là manual fallback pack, đối soát thành công ngay
    if (externalPostId.startsWith('manual_pack_')) {
      return { success: true, externalPostId, publishedAt: new Date() };
    }

    try {
      const response = await this.request(
        '/v2/post/publish/status/fetch/',
        { publish_id: externalPostId },
        authOverride
      );
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

  private async request(
    path: string,
    body: Record<string, unknown>,
    authOverride?: CmsPublishRequest['authOverride']
  ): Promise<{ ok: boolean; status: number; payload: Record<string, any> }> {
    const token = authOverride?.accessToken || this.accessToken;
    const openId = authOverride?.openId || this.openId;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
    };
    if (openId) headers['X-Open-Id'] = openId;
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

export function toPlainTextKeepHashtags(markdown: string): string {
  if (!markdown) return '';
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|[^\p{L}\p{N}_])_([^_\n]+)_(?=[^\p{L}\p{N}_]|$)/gu, '$1$2')
    .replace(/\*/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function providerError(payload: Record<string, any>, status: number): string {
  const message = payload?.error?.message || payload?.error?.log_id || payload?.message;
  return typeof message === 'string' ? message : `TikTok API HTTP ${status}`;
}
