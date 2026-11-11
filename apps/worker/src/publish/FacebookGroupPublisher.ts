import type { CmsPublisher, CmsPublishRequest, CmsPublishResult, PublishChannel } from './CmsPublisher';
import { generateManualPack, type ManualPack } from './ManualPackGenerator';

/**
 * Facebook Group Graph API Publisher (Graph API v21.0) & ManualPack Fallback (CM-28 / CM-29).
 *
 * Hỗ trợ xuất bản nội dung bài viết và ảnh lên Facebook Group:
 * 1. Đăng thông qua Graph API bằng Page Admin Access Token kết nối với Group.
 * 2. Tự động kiểm tra tính hợp lệ của bài viết và ảnh.
 * 3. Gắn nhãn minh bạch nội dung AI theo chuẩn chính sách Meta.
 * 4. Fallback tự động sang ManualPackGenerator (xuất gói thủ công 1-click) khi:
 *    - Nhóm Facebook yêu cầu duyệt bài trước từ Admin cá nhân.
 *    - Tài khoản Meta Developers chưa được cấp quyền live publish trên Group (401/403/Permission Denied).
 */
function isPublicUrl(address: string): boolean {
  try {
    const { protocol, hostname } = new URL(address);
    return /^https?:$/.test(protocol) && !/^(localhost$|127\.|0\.0\.0\.0$|10\.|192\.168\.|\[::1\]$)/.test(hostname);
  } catch {
    return false;
  }
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

export class FacebookGroupPublisher implements CmsPublisher {
  channel: PublishChannel = 'FacebookGroup';
  private readonly groupId: string;
  private readonly accessToken: string;
  readonly graphVersion: string;

  constructor(
    groupId: string,
    accessToken: string,
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

  async reconcile(externalPostId: string): Promise<CmsPublishResult> {
    if (externalPostId.startsWith('manual_group_')) {
      return {
        success: true,
        externalPostId,
        publishedUrl: `https://www.facebook.com/groups/${this.groupId}`,
        publishedAt: new Date(),
        reconciled: true,
      };
    }

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
        publishedUrl: typeof payload.permalink_url === 'string' ? payload.permalink_url : `https://www.facebook.com/groups/${this.groupId}/posts/${payload.id}`,
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
}

