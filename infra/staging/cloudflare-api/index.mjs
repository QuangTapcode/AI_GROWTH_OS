import { proxyApiRequest } from '../cloudflare-pages/v1-proxy.template.js';

export default {
  async fetch(request, env) {
    // The public staging proxy must not expose internal automation/worker endpoints.
    const path=new URL(request.url).pathname;
    const publicRead=/^\/public\/v1\/sites\/[a-z0-9-]{1,100}\/(posts(?:\/[a-z0-9-]{1,160})?|landing)\/?$/.test(path)&&['GET','HEAD'].includes(request.method);
    const publicWrite=/^\/public\/v1\/sites\/[a-z0-9-]{1,100}\/(events|leads|experiment|chat)\/?$/.test(path)&&request.method==='POST';
    if (!path.startsWith('/v1/')&&!publicRead&&!publicWrite) return new Response('Not found', { status: 404 });
    return proxyApiRequest(request, (url, init) => env.LOCAL_API.fetch(url, init), 'http://127.0.0.1:4000');
  },
};
