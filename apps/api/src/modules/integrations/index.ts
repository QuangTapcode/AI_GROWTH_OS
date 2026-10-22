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
  getWorkspaceConnectionStatus,
  probeOwnership,
  syncMetrics,
  runSync,
  supportMatrix,
  socialChannelDecision,
  type IntegrationConnectionStatus,
  type OwnershipProbeResult,
  type MetricSyncResult,
  type SyncJobResult,
  type ChannelMode,
  type ChannelDecision,
} from './stubs';
export {
  authorizeToolExecution,
  globalToolAuditSink,
  MemoryToolAuditSink,
  type ActionType,
  type AgentRole,
  type ToolExecutionRequest,
  type ToolAuditLog,
  type ToolAuditSink,
  type AuthorizeResult,
} from './gateway';
