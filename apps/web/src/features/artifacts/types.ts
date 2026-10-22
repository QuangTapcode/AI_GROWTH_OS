/** Trạng thái theo approval gần nhất của artifact (không có approval = Draft). */
export type ArtifactStatus = "Draft" | "In review" | "Approved" | "Rejected";

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
  code: string; // e.g. "ART-1A2B3C"
  title: string;
  version: string; // e.g. "v3"
  /** Version kế tiếp trong cùng lineage khi lưu chỉnh sửa */
  nextVersion: number;
  category: string;
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
    /** payload.synthetic: dữ liệu seed/fixture, không phải output model thật */
    isSynthetic: boolean;
    nodes: PipelineNode[];
    activeNodeText: string;
    activeAgent: string;
    activeStatusText: string;
    outputPreviewText: string;
  };
  documentContent: string;
  /** true khi documentContent là văn bản do agent viết (payload.document_markdown) */
  hasDocument: boolean;
  canRequestReview: boolean;
  jsonPayload?: Record<string, unknown>;
}
