import type { IntegrationProvider, MissingReason, MetricAvailability } from './types';
import { INTEGRATION_MATRIX, matrixFor } from './matrix';

/**
 * W1-MY-06 — GA4/GSC stubs.
 * Pilot CHƯA có Google account/property/public URL → mọi hàm trả
 * not_connected + missing_reason; KHÔNG bịa property_id/live metrics.
 * Credential refs chỉ nằm server-side (env keys trong matrix), không serialize.
 */

export interface IntegrationConnectionStatus {
  provider: IntegrationProvider;
  workspace_id: string;
  status: 'not_connected';
  missing_reason: MissingReason;
  /** Property/property-lookup ref — null khi chưa kết nối (không bịa) */
  property_ref: string | null;
  /** Scopes đã cấp — rỗng khi chưa connect */
  scopes: string[];
  /** Không bao giờ chứa secret/credential */
  credential_ref: null;
  capabilities: Array<{ capability: string; status: 'not_connected' }>;
}

/** Stub connection status (W1: mọi workspace chưa có credentials Google). */
export function getConnectionStatus(workspaceId: string, provider: IntegrationProvider): IntegrationConnectionStatus {
  return {
    provider,
    workspace_id: workspaceId,
    status: 'not_connected',
    missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
    property_ref: null,
    scopes: [],
    credential_ref: null,
    capabilities: matrixFor(provider).map((row) => ({
      capability: row.capability,
      status: row.default_status,
    })),
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
  return {
    provider,
    site_or_property: siteOrProperty,
    status: 'not_connected',
    checked: false,
    missing_reason: provider === 'gsc' ? 'PROPERTY_NOT_VERIFIED' : 'PROBE_REQUIRES_CONNECTED_ACCOUNT',
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