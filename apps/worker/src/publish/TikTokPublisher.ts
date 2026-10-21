import type { CmsPublisher, CmsPublishRequest, CmsPublishResult } from './CmsPublisher';

/** TikTok Content Posting API adapter (Direct Post video/photo). */
export class TikTokPublisher implements CmsPublisher {
  channel = 'TikTok' as const;
  private readonly baseUrl = process.env.TIKTOK_API_BASE_URL || 'https://open.tiktokapis.com';

  constructor(private readonly accessToken: string, private readonly openId?: string) {
  }

  async publish(req: CmsPublishRequest): Promise<CmsPublishResult> {
    if (!req.mediaUrl || !req.mediaType) {
      return {
        success: false,
        errorCode: 'TIKTOK_MEDIA_REQUIRED',
        errorMessage: 'TikTok Direct Post requires an approved public video or image URL',
      };
    }
    const title = (req.metaTitle || toPlainText(req.bodyMarkdown)).slice(0, 2200);
    const path = req.mediaType === 'image' ? '/v2/post/publish/content/init/' : '/v2/post/publish/video/init/';
    const sourceInfo = req.mediaType === 'image'
      ? { source: 'PULL_FROM_URL', photo_images: [req.mediaUrl], photo_cover_index: 0 }
      : { source: 'PULL_FROM_URL', video_url: req.mediaUrl };
    try {
      const response = await this.request(path, { post_info: { title }, source_info: sourceInfo });
      if (!response.ok || typeof response.payload?.data?.publish_id !== 'string') {
        return { success: false, errorCode: response.status === 401 || response.status === 403 ? 'TIKTOK_PERMISSION_DENIED' : 'TIKTOK_PUBLISH_FAILED', errorMessage: providerError(response.payload, response.status) };
      }
      const publishId = response.payload.data.publish_id as string;
      return { success: true, externalPostId: publishId, publishedAt: new Date() };
    } catch (error) {
      return { success: false, errorCode: 'CMS_UNKNOWN_OUTCOME', errorMessage: error instanceof Error ? error.message : 'TikTok request failed' };
    }
  }

  async reconcile(externalPostId: string): Promise<CmsPublishResult> {
    if (!externalPostId) return { success: false, errorCode: 'TIKTOK_RECONCILE_MISSING_ID' };
    try {
      const response = await this.request('/v2/post/publish/status/fetch/', { publish_id: externalPostId });
      if (!response.ok) return { success: false, errorCode: 'TIKTOK_STATUS_FAILED', errorMessage: providerError(response.payload, response.status) };
      const status = response.payload?.data?.status as string | undefined;
      if (status === 'FAILED') return { success: false, errorCode: 'TIKTOK_PUBLISH_FAILED', errorMessage: String(response.payload?.data?.fail_reason || 'TikTok rejected the post') };
      return { success: true, externalPostId, publishedAt: new Date() };
    } catch (error) {
      return { success: false, errorCode: 'CMS_UNKNOWN_OUTCOME', errorMessage: error instanceof Error ? error.message : 'TikTok status request failed' };
    }
  }

  private async request(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; payload: Record<string, any> }> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' };
    if (this.openId) headers['X-Open-Id'] = this.openId;
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Number(process.env.SOCIAL_REQUEST_TIMEOUT_MS || 10000)),
    });
    let payload: Record<string, any> = {};
    try { payload = (await response.json()) as Record<string, any>; } catch { /* provider may return empty body */ }
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
