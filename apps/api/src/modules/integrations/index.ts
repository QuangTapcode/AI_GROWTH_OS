export {
  providerSchema,
  connectionStatusSchema,
  metricAvailabilitySchema,
  missingReasonSchema,
  GA4_SCOPES,
  GSC_SCOPES,
  type IntegrationProvider,
  type ConnectionStatus,
  type MetricAvailability,
  type MissingReason,
} from './types';
export { INTEGRATION_MATRIX, matrixFor, serverEnvKeys, type IntegrationCapabilityRow } from './matrix';
export {
  GA4_EVENTS,
  FORBIDDEN_PARAM_KEYS,
  generateLeadParamsSchema,
  pageViewParamsSchema,
  validateGenerateLeadParams,
  type Ga4EventName,
  type GenerateLeadParams,
  type ValidateParamsResult,
} from './eventSchema';
export {
  getConnectionStatus,
  probeOwnership,
  syncMetrics,
  runSync,
  supportMatrix,
  type IntegrationConnectionStatus,
  type OwnershipProbeResult,
  type MetricSyncResult,
  type SyncJobResult,
} from './stubs';