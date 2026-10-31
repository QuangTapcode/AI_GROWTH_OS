import { proxyApiRequest } from '../cloudflare-pages/v1-proxy.template.js';

export default {
  async fetch(request, env) {
    // The public staging proxy must not expose internal automation/worker endpoints.
    if (!new URL(request.url).pathname.startsWith('/v1/')) return new Response('Not found', { status: 404 });
    return proxyApiRequest(request, (url, init) => env.LOCAL_API.fetch(url, init), 'http://127.0.0.1:4000');
  },
};
