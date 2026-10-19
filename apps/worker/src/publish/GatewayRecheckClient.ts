/**
 * Gateway recheck adapter (MY-05) — nối seam `PublishContext.gatewayCheck`
 * với gateway TQ-06 qua HTTP: `POST {API_BASE_URL}/v1/workspaces/{ws}/tools/execute`.
 *
 * - Chỉ tạo khi có API_BASE_URL (env thiếu → null → publish bỏ qua recheck,
 *   giữ hành vi cũ cho môi trường chưa cấu hình gateway).
 * - Auth: `Authorization: Bearer {WORKER_GATEWAY_TOKEN}` (dev token: dev_owner/...).
 * - Channel → provider/capability theo INTEGRATION_MATRIX:
 *   Website/Newsletter → website_cms/publish_cms_post;
 *   Facebook → facebook_page/publish_page_post;
 *   Instagram → instagram_business/publish_ig_media.
 * - action_type=publish luôn đi cùng approval_id (gateway bắt buộc).
 * - Lỗi network/5xx → fail-closed (authorized=false) — publish fail fast thay vì
 *   chạy khi không xác minh được policy.
 */

export type GatewayCheckFn = (req: {
  workspaceId: string;
  channel: string;
  approvalId?: string;
  expectedVersion: number;
  expectedHash: string;
}) => Promise<{ authorized: boolean; denialReason?: string }>;

interface ChannelRoute {
  provider: string;
  capability: string;
}

const CHANNEL_ROUTE: Record<string, ChannelRoute> = {
  Website: { provider: 'website_cms', capability: 'publish_cms_post' },
  Newsletter: { provider: 'website_cms', capability: 'publish_cms_post' },
  Facebook: { provider: 'facebook_page', capability: 'publish_page_post' },
  Instagram: { provider: 'instagram_business', capability: 'publish_ig_media' },
};

/** Trích lý do denial từ envelope lỗi API (AppError → { error: {...} } hoặc { message }). */
function denialFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    const err = b['error'];
    if (err && typeof err === 'object') {
      const e = err as Record<string, unknown>;
      const msg = [e['code'], e['message']].filter(Boolean).join(': ');
      if (msg) return msg;
    }
    if (typeof b['message'] === 'string') return b['message'] as string;
  }
  return `GATEWAY_HTTP_${status}`;
}

/**
 * Dùng như `PublishContext.gatewayCheck`. Trả null khi thiếu cấu hình.
 * Fetch qua globalThis.fetch (test stub được).
 */
export function createGatewayCheck(): GatewayCheckFn | null {
  const baseUrl = process.env['API_BASE_URL'];
  if (!baseUrl) return null;
  const token = process.env['WORKER_GATEWAY_TOKEN'] ?? 'dev_owner';
  const timeoutMs = Number(process.env['GATEWAY_REQUEST_TIMEOUT_MS'] ?? 5000);

  return async (req) => {
    const route = CHANNEL_ROUTE[req.channel];
    if (!route) {
      return { authorized: false, denialReason: `UNSUPPORTED_CHANNEL: ${req.channel}` };
    }
    const url = `${baseUrl.replace(/\/+$/, '')}/v1/workspaces/${encodeURIComponent(req.workspaceId)}/tools/execute`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider: route.provider,
          capability: route.capability,
          action_type: 'publish',
          approval_id: req.approvalId,
          expected_version: req.expectedVersion,
          expected_hash: req.expectedHash,
          params: { channel: req.channel },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const body = (await res.json()) as { success?: boolean };
        if (body?.success === true) return { authorized: true };
        return { authorized: false, denialReason: 'GATEWAY_UNEXPECTED_RESPONSE' };
      }
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch { /* body không phải JSON */ }
      return { authorized: false, denialReason: denialFrom(parsed, res.status) };
    } catch (e) {
      // Fail-closed: không xác minh được policy → không publish.
      const reason = e instanceof Error ? e.message : 'gateway unreachable';
      return { authorized: false, denialReason: `GATEWAY_UNREACHABLE: ${reason}` };
    }
  };
}
