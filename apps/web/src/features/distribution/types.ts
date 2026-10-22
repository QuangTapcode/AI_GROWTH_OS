export interface ChannelEndpoint {
  id: string;
  name: string;
  type: string;
  endpoint: string;
  handle: string;
  iconType: string;
  color: string;
  status: "connected" | "attention" | "disabled";
  statusLabel: string;
  healthMeta: string;
  tokenExpiry: string;
  protocol: string;
  lastAudit: string;
  queuedCount: number;
  blockedCount: number;
  lastConfirmed: string;
  error?: string | null;
}

export interface PipelineStageInfo {
  id: number;
  code: string;
  name: string;
  workerName: string;
  workerRole: string;
  status: "completed" | "active" | "queued" | "paused";
  count: number;
  description: string;
  validationGate: string;
}

export interface SyndicationTask {
  id: string;
  title: string;
  stageCode: string;
  channelId: string;
  channelName: string;
  status: "in_flight" | "scheduled" | "failed" | "completed";
  statusLabel: string;
  scheduledTime: string;
  agent: string;
  retries: number;
  estimatedReach: string;
  payloadTitle: string;
}
