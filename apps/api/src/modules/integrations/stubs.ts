import type { IntegrationProvider, MissingReason, MetricAvailability } from './types';
import { INTEGRATION_MATRIX, matrixFor } from './matrix';
import { getConnection } from './repository';

type FacebookProbe = { checkedAt: number; status: 'connected' | 'error'; name?: string };
const facebookProbes = new Map<string, FacebookProbe>();

async function probeFacebookFromEnv(workspaceId: string): Promise<FacebookProbe | null> {
  if ((process.env.INTEGRATION_MODE ?? 'fake') !== 'production') return null;
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim();
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!pageId || !token) return null;
  const cached = facebookProbes.get(workspaceId);
  if (cached && Date.now() - cached.checkedAt < 60_000) return cached;
  try {
    const version = process.env.META_GRAPH_API_VERSION ?? 'v20.0';
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(pageId)}?fields=id,name&access_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(5000),
    });
    const body = await response.json().catch(() => ({})) as { id?: string; name?: string };
    const probe: FacebookProbe = response.ok && body.id === pageId
      ? { checkedAt: Date.now(), status: 'connected', name: body.name }
      : { checkedAt: Date.now(), status: 'error' };
    facebookProbes.set(workspaceId, probe);
    return probe;
  } catch {
    const probe: FacebookProbe = { checkedAt: Date.now(), status: 'error' };
    facebookProbes.set(workspaceId, probe);
    return probe;
  }
}

/**
 * W1-MY-06 — GA4/GSC stubs.
 * Pilot CHƯA có Google account/property/public URL → mọi hàm trả
 * not_connected + missing_reason; KHÔNG bịa property_id/live metrics.
 * Credential refs chỉ nằm server-side (env keys trong matrix), không serialize.
 */

export interface IntegrationConnectionStatus {
  provider: IntegrationProvider;
  workspace_id: string;
  status: 'not_connected' | 'connecting' | 'connected' | 'error' | 'revoked';
  missing_reason: MissingReason | null;
  /** Property/property-lookup ref — null khi chưa kết nối (không bịa) */
  property_ref: string | null;
  /** Scopes đã cấp — rỗng khi chưa connect */
  scopes: string[];
  /** Không bao giờ chứa secret/credential */
  credential_ref: null;
  capabilities: Array<{ capability: string; status: 'not_connected' | 'connecting' | 'connected' | 'error' | 'revoked' }>;
}

/** Stub connection status (W1: mọi workspace chưa có credentials). */
export function getConnectionStatus(workspaceId: string, provider: IntegrationProvider): IntegrationConnectionStatus {
  const rows = matrixFor(provider);
  return {
    provider,
    workspace_id: workspaceId,
    status: 'not_connected',
    missing_reason: rows[0]?.default_missing_reason ?? 'INTEGRATION_NOT_CONNECTED',
    property_ref: null,
    scopes: [],
    credential_ref: null,
    capabilities: rows.map((row) => ({
      capability: row.capability,
      status: row.default_status,
    })),
  };
}

/**
 * Resolve persisted tenant connector metadata. The sync stub above remains the
 * deterministic test default; HTTP boundaries use this async resolver so a
 * verified OAuth connection changes the publishing decision without exposing
 * tokens.
 */
export async function getWorkspaceConnectionStatus(workspaceId: string, provider: IntegrationProvider): Promise<IntegrationConnectionStatus> {
  const base = getConnectionStatus(workspaceId, provider);
  const connection = await getConnection(workspaceId, provider);
  if (!connection && provider === 'facebook_page') {
    const probe = await probeFacebookFromEnv(workspaceId);
    if (probe) {
      return {
        ...base,
        status: probe.status,
        missing_reason: probe.status === 'connected' ? null : 'FACEBOOK_PAGE_PERMISSION_MISSING',
        property_ref: process.env.FACEBOOK_PAGE_ID ?? null,
        scopes: probe.status === 'connected' ? ['pages_manage_posts'] : [],
        capabilities: base.capabilities.map((capability) => ({ capability: capability.capability, status: probe.status })),
      };
    }
  }
  if (!connection) return base;
  const effectiveStatus = connection.status === 'connected' && !connection.verified_at
    ? 'connecting'
    : connection.status;
  return {
    ...base,
    status: effectiveStatus,
    missing_reason: effectiveStatus === 'connected' ? null : base.missing_reason,
    property_ref: connection.account_ref,
    scopes: connection.scopes,
    capabilities: base.capabilities.map((capability) => ({ capability: capability.capability, status: effectiveStatus })),
  };
}

export interface OwnershipProbeResult {
  provider: IntegrationProvider;
  site_or_property: string;
  status: 'not_connected';
  /** false: chưa hề kiểm chứng thật */
  checked: boolean;
  missing_reason: MissingReason;
  verified: null;
}

/** Stub probe quyền sở hữu property/site — khi PM có account sẽ thay bằng probe thật. */
export function probeOwnership(
  provider: IntegrationProvider,
  siteOrProperty: string,
): OwnershipProbeResult {
  const verifyRow = matrixFor(provider).find(
    (r) => r.capability === 'verify_site_ownership' || r.probe === 'site_verification',
  );
  return {
    provider,
    site_or_property: siteOrProperty,
    status: 'not_connected',
    checked: false,
    missing_reason:
      verifyRow?.default_missing_reason ??
      matrixFor(provider)[0]?.default_missing_reason ??
      'PROBE_REQUIRES_CONNECTED_ACCOUNT',
    verified: null,
  };
}

export interface MetricSyncResult {
  provider: IntegrationProvider;
  metric: string;
  range: { from: string; to: string };
  timezone: string;
  availability: MetricAvailability;
  missing_reason: MissingReason | null;
  /** null — KHÔNG thay missing bằng 0 */
  values: null;
  synced_at: null;
}

/**
 * Stub metrics sync: thiếu kết nối → availability=missing + reason.
 * Dashboard hiển thị "chưa có dữ liệu", không phải số 0.
 */
export function syncMetrics(input: {
  provider: IntegrationProvider;
  metric: string;
  range: { from: string; to: string };
  timezone: string;
}): MetricSyncResult {
  return {
    provider: input.provider,
    metric: input.metric,
    range: input.range,
    timezone: input.timezone,
    availability: 'missing',
    missing_reason: 'INTEGRATION_NOT_CONNECTED',
    values: null,
    synced_at: null,
  };
}

export interface SyncJobResult {
  status: 'skipped';
  reason: MissingReason;
  synced_at: null;
}

/** Stub sync job — chưa kết nối thì skip, không pretend đã sync. */
export function runSync(provider: IntegrationProvider): SyncJobResult {
  return { status: 'skipped', reason: 'INTEGRATION_NOT_CONNECTED', synced_at: null };
}

/** Danh sách matrix đầy đủ (support matrix evidence cho PM/QA). */
export function supportMatrix(): typeof INTEGRATION_MATRIX {
  return INTEGRATION_MATRIX;
}

/**
 * MY-02 — quyết định social live/manual theo capability matrix.
 * Publish live chỉ khi provider đã connected VÀ quyền publish được probe
 * verified; thiếu → manual pack có nhãn, không pretend live (sprint README D3).
 */
export type ChannelMode = 'live' | 'manual';

export interface ChannelDecision {
  channel: 'website' | 'facebook' | 'tiktok' | 'instagram';
  provider: IntegrationProvider;
  mode: ChannelMode;
  /** Nhãn hiển thị trên social pack khi mode=manual */
  label: string;
  missing_reason: MissingReason | null;
}

export function socialChannelDecision(input: {
  /** từ getConnectionStatus().status khi có credentials thật */
  connected: Partial<Record<IntegrationProvider, boolean>>;
  /** probe kết quả publish capability đã verified hay chưa */
  verified: Partial<Record<IntegrationProvider, boolean>>;
}): ChannelDecision[] {
  const decide = (
    channel: ChannelDecision['channel'],
    provider: IntegrationProvider,
    publishCapability: (typeof INTEGRATION_MATRIX)[number]['capability'],
    missing: MissingReason,
  ): ChannelDecision => {
    const isConnected = input.connected[provider] === true;
    const isVerified = input.verified[provider] === true;
    const row = INTEGRATION_MATRIX.find(
      (r) => r.provider === provider && r.capability === publishCapability,
    );
    if (isConnected && isVerified) {
      return { channel, provider, mode: 'live', label: 'live', missing_reason: null };
    }
    return {
      channel,
      provider,
      mode: 'manual',
      label: `manual_${publishCapability}`,
      missing_reason: isConnected ? (row?.default_missing_reason ?? missing) : missing,
    };
  };
  return [
    decide('website', 'website_cms', 'publish_cms_post', 'CMS_NOT_PUBLISHED'),
    decide('facebook', 'facebook_page', 'publish_page_post', 'FACEBOOK_PAGE_PERMISSION_MISSING'),
    decide('tiktok', 'tiktok', 'publish_tiktok_video', 'TIKTOK_ACCOUNT_NOT_CONNECTED'),
    decide('instagram', 'instagram_business', 'publish_ig_media', 'INSTAGRAM_ACCOUNT_NOT_LINKED'),
  ];
}
