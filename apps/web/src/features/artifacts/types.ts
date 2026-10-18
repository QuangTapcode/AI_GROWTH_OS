export type ArtifactStatus = "Complete" | "In progress" | "Validated" | "Queued";

export interface HighIntentCard {
  number: string;
  badge: string;
  badgeType: "intent" | "commercial" | "info";
  title: string;
  description: string;
  volume: string;
  kdText: string;
}

export interface PipelineNode {
  nodeId: string;
  name: string;
  status: "Completed" | "Selected" | "Requires Review" | "Queued";
  tag?: string;
  iconType: "check" | "sparkles" | "gavel";
}

export interface ArtifactDeliverable {
  id: string;
  code: string; // e.g. "ART-0317"
  title: string;
  version: string; // e.g. "v3"
  category: "STRATEGIC REPORT" | "CONTENT BRIEF" | "PAGE BLUEPRINT" | "ARCHITECTURE";
  timeAgo: string;
  status: ArtifactStatus;
  statusText: string;
  aiStatusBadge: string;
  workspaceTag: string;
  agent: string;
  versionsCount: number;
  executiveInsight: string;
  cards: HighIntentCard[];
  pipeline: {
    pipelineId: string;
    completedStagesText: string;
    totalRunTime: string;
    isDeterministic: boolean;
    nodes: PipelineNode[];
    activeNodeText: string;
    activeAgent: string;
    activeStatusText: string;
    outputPreviewText: string;
  };
  documentContent: string;
  jsonPayload?: Record<string, unknown>;
}
