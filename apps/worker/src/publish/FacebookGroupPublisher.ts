import type { CmsPublisher, CmsPublishRequest, CmsPublishResult } from './CmsPublisher';
import { FacebookGroupBot } from './FacebookGroupBot';

const DEFAULT_GROUP_URL = 'https://www.facebook.com/groups/1134282109069209';

function resolveGroupUrl(linkUrl?: string): string {
  if (linkUrl && /^https:\/\/(www\.|m\.)?facebook\.com\/groups\//i.test(linkUrl)) {
    return linkUrl;
  }
  return process.env.FACEBOOK_GROUP_URL?.trim() || DEFAULT_GROUP_URL;
}

/**
 * Publisher đăng bài trực tiếp vào Facebook Community Group thông qua FacebookGroupBot.
 * Fail-closed: nếu chưa có session Quản trị viên (.fb-session.json / FB_ADMIN_COOKIE)
 * thì trả về lỗi FACEBOOK_GROUP_SESSION_MISSING và tuyệt đối KHÔNG fallback sang Fanpage.
 */
export class FacebookGroupPublisher implements CmsPublisher {
  channel = 'FacebookGroup' as const;

  async publish(req: CmsPublishRequest): Promise<CmsPublishResult> {
    const groupUrl = resolveGroupUrl(req.linkUrl);
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
    if (
      externalPostId &&
      /^https:\/\/(www\.|m\.)?facebook\.com\/groups\/.*\/(posts|permalink)\//i.test(externalPostId)
    ) {
      return {
        success: true,
        externalPostId,
        publishedUrl: externalPostId,
        publishedAt: new Date(),
      };
    }

    return {
      success: false,
      errorCode: 'POST_NOT_FOUND',
      errorMessage: 'Không thể đối soát bài Facebook Group chưa có permalink xác nhận.',
    };
  }
}

