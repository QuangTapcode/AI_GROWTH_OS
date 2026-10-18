export type WorkflowStatus = "Running" | "Completed" | "Needs review" | "Queued" | "Blocked" | "Approval required";

export interface PipelineStage {
  id: string;
  stepNumber: number;
  title: string;
  subtitle: string;
  status: "Completed" | "Running" | "Queued" | "Approval required" | "Failed";
  /** null khi BE chưa báo tiến độ (task đang chạy) */
  progressPercent: number | null;
  iconType: "search" | "chart" | "process" | "sparkles" | "shield";
  description: string;
  logs: string[];
}

export interface GrowthTask {
  id: string;
  taskId: string; // e.g. "TSK-1A2B3C"
  title: string;
  agent: string;
  status: "Running" | "Completed" | "Needs review" | "Queued" | "Blocked" | "Cancelled";
  lastRun: string;
  updated: string;
  actionText: "View" | "Review" | "Resolve";
  actionType: "link" | "review" | "resolve";
  progressPercent: number | null;
  description: string;
  logs: string[];
  trigger?: string;
  startedAt?: string;
  duration?: string;
}

export interface ActiveAiRun {
  runId: string;
  title: string;
  description: string;
  pipelineName: string;
  trigger: string;
  agent: string;
  startedAt: string;
  duration: string;
  status: "Running" | "Completed" | "Failed";
  completedStages: number;
  totalStages: number;
  progressPercent: number;
  currentStep: {
    title: string;
    description: string;
  };
  latestActivity: {
    title: string;
    agent: string;
    timestamp: string;
  };
  stages: PipelineStage[];
}
