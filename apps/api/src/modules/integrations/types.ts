import { z } from 'zod';

/**
 * W1-MY-06 — GA4/GSC config & status enums (chưa kết nối Google).
 * Status nhất quán với contracts: not_connected + missing_reason,
 * KHÔNG bịa property/live metrics.
 */
export const providerSchema = z.enum(['ga4', 'gsc']);
export type IntegrationProvider = z.infer<typeof providerSchema>;

export const connectionStatusSchema = z.enum(['not_connected', 'connecting', 'connected', 'error', 'revoked']);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const metricAvailabilitySchema = z.enum(['available', 'missing', 'partial', 'delayed']);
export type MetricAvailability = z.infer<typeof metricAvailabilitySchema>;

/** Lý do thiếu dữ liệu — luôn kèm theo availability=missing, không thay bằng 0. */
export const missingReasonSchema = z.enum([
  'INTEGRATION_NOT_CONNECTED',
  'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
  'PROPERTY_NOT_VERIFIED',
  'PROBE_REQUIRES_CONNECTED_ACCOUNT',
  'SYNC_NOT_RUN_YET',
]);
export type MissingReason = z.infer<typeof missingReasonSchema>;

export const GA4_SCOPES = {
  READONLY: 'https://www.googleapis.com/auth/analytics.readonly',
} as const;

export const GSC_SCOPES = {
  READONLY: 'https://www.googleapis.com/auth/webmasters.readonly',
} as const;