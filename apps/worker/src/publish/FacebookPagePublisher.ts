import type { CmsPublisher, CmsPublishRequest, CmsPublishResult } from './CmsPublisher';

/**
 * Facebook Page Graph API adapter.
 *
 * It is deliberately opt-in: the registry only constructs this adapter when
 * INTEGRATION_MODE=production and a page token/id are present. Tokens never
 * enter job payloads or logs.
 */
export class FacebookPagePublisher implements CmsPublisher {
  channel = 'Facebook' as const;

  constructor(
    private readonly pageId: string,
    private readonly accessToken: string,
    private readonly graphVersion = process.env.FACEBOOK_GRAPH_API_VERSION || 'v20.0',
  ) {
  }

  private endpoint(path: string): string {
    return `https://graph.facebook.com/${this.graphVersion}/${this.pageId}/${path}`;
  }

  async publish(req: CmsPublishRequest): Promise<CmsPublishResult> {
    const message = toPlainText(req.bodyMarkdown);
    if (!message) {
      return { success: false, errorCode: 'FACEBOOK_EMPTY_MESSAGE', errorMessage: 'Facebook Page post requires text' };
    }
    const body = new URLSearchParams({ message, access_token: this.accessToken });
    if (req.linkUrl) body.set('link', req.linkUrl);
    try {
      const response = await fetch(this.endpoint('feed'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(Number(process.env.SOCIAL_REQUEST_TIMEOUT_MS || 10000)),
      });
      const payload = await readJson(response);
      if (!response.ok || typeof payload?.id !== 'string') {
        return {
          success: false,
          errorCode: response.status === 401 || response.status === 403 ? 'FACEBOOK_PERMISSION_DENIED' : 'FACEBOOK_PUBLISH_FAILED',
          errorMessage: providerError(payload, response.status),
        };
      }
      return {
        success: true,
        externalPostId: payload.id,
        publishedUrl: `https://www.facebook.com/${payload.id}`,
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
    const url = new URL(`https://graph.facebook.com/${this.graphVersion}/${externalPostId}`);
    url.searchParams.set('fields', 'id,permalink_url');
    url.searchParams.set('access_token', this.accessToken);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Number(process.env.SOCIAL_REQUEST_TIMEOUT_MS || 10000)) });
      const payload = await readJson(response);
      if (!response.ok || typeof payload?.id !== 'string') {
        return { success: false, errorCode: 'FACEBOOK_RECONCILE_FAILED', errorMessage: providerError(payload, response.status) };
      }
      return { success: true, externalPostId: payload.id, publishedUrl: typeof payload.permalink_url === 'string' ? payload.permalink_url : undefined, publishedAt: new Date() };
    } catch (error) {
      return { success: false, errorCode: 'CMS_UNKNOWN_OUTCOME', errorMessage: error instanceof Error ? error.message : 'Facebook reconcile failed' };
    }
  }
}

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
