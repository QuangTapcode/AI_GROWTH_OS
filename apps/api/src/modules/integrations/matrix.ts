import type { IntegrationProvider, MissingReason } from './types';

/**
 * W1-MY-06 — config/access/support matrix GA4/GSC.
 * Mỗi dòng = capability cần cho pilot, scope/permission yêu cầu, cách probe
 * khi PM có quyền, và trạng thái mặc định CHƯA có account/property.
 * Env keys là server-only credential refs — không bao giờ serialize ra public.
 */
export interface IntegrationCapabilityRow {
  provider: IntegrationProvider;
  capability:
    | 'read_property'
    | 'read_stream_events'
    | 'read_realtime_events'
    | 'read_sites'
    | 'read_search_analytics'
    | 'verify_site_ownership';
  required_scope: string;
  required_permission: string;
  /** Cách kiểm chứng thật khi đã có quyền (W1: stub, probe khi PM có account) */
  probe: 'property_lookup' | 'site_verification' | 'search_analytics_query' | 'stream_event_report';
  /** Credential ref server-only liên quan (không serialize) */
  server_env_key: string;
  /** Trạng thái hiện tại của pilot: chưa có account/URL → not_connected */
  default_status: 'not_connected';
  default_missing_reason: MissingReason;
}

export const INTEGRATION_MATRIX: readonly IntegrationCapabilityRow[] = [
  {
    provider: 'ga4',
    capability: 'read_property',
    required_scope: 'https://www.googleapis.com/auth/analytics.readonly',
    required_permission: 'Viewer (property)',
    probe: 'property_lookup',
    server_env_key: 'GOOGLE_SERVICE_ACCOUNT_JSON',
    default_status: 'not_connected',
    default_missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
  },
  {
    provider: 'ga4',
    capability: 'read_stream_events',
    required_scope: 'https://www.googleapis.com/auth/analytics.readonly',
    required_permission: 'Viewer (property)',
    probe: 'stream_event_report',
    server_env_key: 'GOOGLE_SERVICE_ACCOUNT_JSON',
    default_status: 'not_connected',
    default_missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
  },
  {
    provider: 'ga4',
    capability: 'read_realtime_events',
    required_scope: 'https://www.googleapis.com/auth/analytics.readonly',
    required_permission: 'Viewer (property)',
    probe: 'stream_event_report',
    server_env_key: 'GOOGLE_SERVICE_ACCOUNT_JSON',
    default_status: 'not_connected',
    default_missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
  },
  {
    provider: 'gsc',
    capability: 'read_sites',
    required_scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    required_permission: 'Site owner / full user',
    probe: 'property_lookup',
    server_env_key: 'GSC_SERVICE_ACCOUNT_JSON',
    default_status: 'not_connected',
    default_missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
  },
  {
    provider: 'gsc',
    capability: 'read_search_analytics',
    required_scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    required_permission: 'Site owner / full user',
    probe: 'search_analytics_query',
    server_env_key: 'GSC_SERVICE_ACCOUNT_JSON',
    default_status: 'not_connected',
    default_missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
  },
  {
    provider: 'gsc',
    capability: 'verify_site_ownership',
    // verification là token DNS/HTML file, không phải OAuth scope
    required_scope: 'site_verification_token',
    required_permission: 'Domain/DNS access (PM)',
    probe: 'site_verification',
    server_env_key: 'GSC_SITE_VERIFICATION_TOKEN',
    default_status: 'not_connected',
    default_missing_reason: 'PROPERTY_NOT_VERIFIED',
  },
] as const;

export function matrixFor(provider: IntegrationProvider): IntegrationCapabilityRow[] {
  return INTEGRATION_MATRIX.filter((row) => row.provider === provider);
}

/** Mọi env key server-only được matrix tham chiếu (guard không leak trong test). */
export function serverEnvKeys(): string[] {
  return [...new Set(INTEGRATION_MATRIX.map((row) => row.server_env_key))];
}