export type ReviewStatus = "pending" | "approved" | "rejected" | "queued";

export interface PipelineStep {
  stepNumber: number;
  name: string;
  description: string;
  status: "completed" | "paused" | "in_progress" | "queued";
}

export interface ValidationBadge {
  id: string;
  title: string;
  subtitle: string;
  passed: boolean;
}

export interface TopicCluster {
  id: string;
  letter: string;
  title: string;
  description: string;
  serpVoidBadge: string;
}

export interface ReviewItem {
  id: string;
  taskId: string;
  runId: string;
  title: string;
  version: string;
  category: string;
  timeAgo: string;
  createdAt: string;
  status: ReviewStatus;
  statusTag: "Review" | "Queued" | "Approved" | "Rejected";
  agent: string;
  targetCluster: string;
  targetLocale: string;
  latency: string;
  stagesCompletedText: string;
  pipelineSteps: PipelineStep[];
  validations: ValidationBadge[];
  executiveSummary: string;
  topicClusters: TopicCluster[];
  jsonPayload: Record<string, unknown>;
  rejectionReason?: string;
  pipelineNotice: string;
  documentContent?: string;
}

export interface ReviewQueueStats {
  pendingCount: number;
  approvedTodayCount: number;
  rejectedCount: number;
}
