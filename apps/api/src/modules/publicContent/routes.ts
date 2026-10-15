import { getLanding, getPublishedPost, listPublishedPosts, type PublicContentDeps } from './service';
import { httpError, httpOk, newRequestId, type HttpResult } from '../../lib/http';
import { resolveSite } from '../../lib/sites';

/**
 * Framework-agnostic handlers (W1-MY-05) cho core router W1-BE-01:
 * - GET /public/v1/sites/{site_id}/posts
 * - GET /public/v1/sites/{site_id}/posts/{slug}
 * - GET /public/v1/sites/{site_id}/landing
 */
export interface PublicContentRoutes {
  handleListPosts(req: { params: Record<string, string>; request_id?: string }): Promise<HttpResult>;
  handleGetPost(req: { params: Record<string, string>; request_id?: string }): Promise<HttpResult>;
  handleGetLanding(req: { params: Record<string, string>; request_id?: string }): Promise<HttpResult>;
}

export function createPublicContentRoutes(deps: PublicContentDeps): PublicContentRoutes {
  return {
    async handleListPosts(req) {
      const requestId = req.request_id ?? newRequestId();
      const siteId = req.params.site_id ?? '';
      if (!resolveSite(siteId)) return notFound('SITE_NOT_FOUND', requestId);
      const items = await listPublishedPosts(deps, siteId);
      return httpOk(200, { items, next_cursor: null });
    },

    async handleGetPost(req) {
      const requestId = req.request_id ?? newRequestId();
      const siteId = req.params.site_id ?? '';
      if (!resolveSite(siteId)) return notFound('SITE_NOT_FOUND', requestId);
      const post = await getPublishedPost(deps, siteId, req.params.slug ?? '');
      if (!post) return notFound('PUBLIC_POST_NOT_FOUND', requestId);
      return httpOk(200, { ...post });
    },

    async handleGetLanding(req) {
      const requestId = req.request_id ?? newRequestId();
      const siteId = req.params.site_id ?? '';
      if (!resolveSite(siteId)) return notFound('SITE_NOT_FOUND', requestId);
      const landing = await getLanding(deps, siteId, req.params.slug ?? 'living-in-da-nang');
      if (!landing) return notFound('PUBLIC_LANDING_NOT_FOUND', requestId);
      return httpOk(200, { ...landing });
    },
  };
}

function notFound(code: string, request_id: string): HttpResult {
  return httpError(404, code, 'resource not found', { request_id });
}