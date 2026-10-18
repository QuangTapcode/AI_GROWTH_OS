import type { Campaign, WorkflowTask } from "@/lib/apiTypes";
import {
  agentLabel,
  durationBetween,
  formatClock,
  formatDuration,
  isToday,
  operationLabel,
  payloadString,
  shortCode,
  timeAgo,
} from "@/lib/format";
import type { ActiveAiRun, GrowthTask, PipelineStage } from "./types";

/** Chuyển dữ liệu workflow_tasks từ API sang kiểu hiển thị của màn Workflows. */

export function taskTitle(task: WorkflowTask): string {
  return payloadString(task.payload, "title") ?? operationLabel(task.operation);
}

export function taskDescription(task: WorkflowTask): string {
  return payloadString(task.payload, "description") ?? `${agentLabel(task.role)} · ${task.operation}`;
}

/** Tiến độ chỉ có khi task đã xong hoặc payload báo progress_percent; không tự suy đoán. */
function taskProgress(task: WorkflowTask): number | null {
  if (task.status === "completed" || task.status === "awaiting_approval") return 100;
  const reported = task.payload?.progress_percent;
  if (typeof reported === "number" && reported >= 0 && reported <= 100) return Math.round(reported);
  if (task.status === "pending" || task.status === "queued") return 0;
  return null;
}

/** Dòng trace dựng từ mốc thời gian và lỗi thật của task. */
export function taskTrace(task: WorkflowTask, byId: Map<string, WorkflowTask>): string[] {
  const lines: string[] = [`[${formatClock(task.created_at)}] Task created · ${task.operation} (priority P${task.priority})`];
  for (const dep of task.dependencies ?? []) {
    const parent = byId.get(dep);
    lines.push(`[${formatClock(task.created_at)}] Depends on ${shortCode("TSK", dep)}${parent ? ` · ${taskTitle(parent)}` : ""}`);
  }
  if (task.started_at) lines.push(`[${formatClock(task.started_at)}] Started by ${agentLabel(task.role)}`);
  if (task.retry_count > 0) lines.push(`Retries used: ${task.retry_count}/${task.max_retries}`);
  if (task.status === "awaiting_approval") lines.push(`[${formatClock(task.updated_at)}] Waiting for human approval`);
  if (task.status === "failed") {
    const code = payloadString(task.error_details, "code") ?? "TASK_FAILED";
    const message = payloadString(task.error_details, "message");
    lines.push(`[${formatClock(task.completed_at ?? task.updated_at)}] Failed: ${code}${message ? ` — ${message}` : ""}`);
  }
  if (task.status === "cancelled") lines.push(`[${formatClock(task.updated_at)}] Cancelled`);
  if (task.status === "completed") lines.push(`[${formatClock(task.completed_at ?? task.updated_at)}] Completed`);
  if (task.result_ref) lines.push(`Result artifact: ${shortCode("ART", task.result_ref)}`);
  return lines;
}

function growthStatus(task: WorkflowTask): GrowthTask["status"] {
  switch (task.status) {
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "awaiting_approval":
      return "Needs review";
    case "failed":
      return "Blocked";
    case "cancelled":
      return "Cancelled";
    default:
      return "Queued";
  }
}

export function toGrowthTask(task: WorkflowTask, byId: Map<string, WorkflowTask>): GrowthTask {
  const status = growthStatus(task);
  const action: Pick<GrowthTask, "actionText" | "actionType"> =
    status === "Needs review"
      ? { actionText: "Review", actionType: "review" }
      : status === "Blocked"
      ? { actionText: "Resolve", actionType: "resolve" }
      : { actionText: "View", actionType: "link" };
  return {
    id: task.id,
    taskId: shortCode("TSK", task.id),
    title: taskTitle(task),
    agent: agentLabel(task.role),
    status,
    lastRun: task.started_at ? timeAgo(task.started_at) : "Not started",
    updated: timeAgo(task.updated_at),
    ...action,
    progressPercent: taskProgress(task),
    description: taskDescription(task),
    logs: taskTrace(task, byId),
    trigger: task.campaign_id ? "Campaign" : "Manual",
    startedAt: task.started_at ? formatClock(task.started_at) : undefined,
    duration: formatDuration(durationBetween(task.started_at, task.completed_at)),
  };
}

const ROLE_ICON: Record<string, PipelineStage["iconType"]> = {
  research: "search",
  growth_lead: "chart",
  seo: "process",
  content: "sparkles",
  community: "shield",
  performance: "chart",
};

function stageStatus(task: WorkflowTask): PipelineStage["status"] {
  switch (task.status) {
    case "completed":
      return "Completed";
    case "running":
      return "Running";
    case "awaiting_approval":
      return "Approval required";
    case "failed":
      return "Failed";
    default:
      return "Queued";
  }
}

const STAGE_SUBTITLE: Record<PipelineStage["status"], string> = {
  Completed: "Completed",
  Running: "In progress",
  Queued: "Waiting to start",
  "Approval required": "Waiting for human approval",
  Failed: "Failed — needs attention",
};

/** Sắp task theo thứ tự phụ thuộc (topological), task cùng cấp theo thời gian tạo. */
export function orderByDependencies(tasks: WorkflowTask[]): WorkflowTask[] {
  const ids = new Set(tasks.map((t) => t.id));
  const remaining = [...tasks].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const done = new Set<string>();
  const ordered: WorkflowTask[] = [];
  while (remaining.length > 0) {
    const index = remaining.findIndex((t) => (t.dependencies ?? []).every((d) => !ids.has(d) || done.has(d)));
    const [next] = remaining.splice(index === -1 ? 0 : index, 1);
    ordered.push(next);
    done.add(next.id);
  }
  return ordered;
}

/**
 * "Active run" = campaign có hoạt động gần nhất (các task cùng campaign_id).
 * Không có campaign thì gom các task thủ công. Không có task thì trả null.
 */
export function buildActiveRun(tasks: WorkflowTask[], campaigns: Campaign[], now: number = Date.now()): ActiveAiRun | null {
  const visible = tasks.filter((t) => t.status !== "cancelled");
  if (visible.length === 0) return null;

  const groups = new Map<string, WorkflowTask[]>();
  for (const t of visible) {
    const key = t.campaign_id ?? "manual";
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const latest = (list: WorkflowTask[]) => list.reduce((max, t) => (t.updated_at > max ? t.updated_at : max), "");
  const [groupKey, groupTasks] = [...groups.entries()].sort((a, b) => latest(b[1]).localeCompare(latest(a[1])))[0];
  const campaign = campaigns.find((c) => c.id === groupKey);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ordered = orderByDependencies(groupTasks);

  const completed = ordered.filter((t) => t.status === "completed").length;
  const active = ordered.some((t) => ["pending", "queued", "running", "awaiting_approval"].includes(t.status));
  const failed = ordered.some((t) => t.status === "failed");
  const current = ordered.find((t) => t.status !== "completed") ?? ordered[ordered.length - 1];
  const lastUpdated = [...ordered].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const startedTimes = ordered.map((t) => t.started_at).filter((s): s is string => Boolean(s)).sort();
  const endTimes = ordered.map((t) => t.completed_at).filter((s): s is string => Boolean(s)).sort();
  const firstStart = startedTimes[0] ?? null;
  const end = active ? null : endTimes[endTimes.length - 1] ?? null;
  const agents = new Set(ordered.map((t) => t.role));

  return {
    runId: campaign ? shortCode("RUN", campaign.id) : "MANUAL",
    title: campaign?.name ?? "Manual tasks",
    description: `${ordered.length} tasks across ${agents.size} agents${campaign?.utm_campaign ? ` · utm_campaign=${campaign.utm_campaign}` : ""}`,
    pipelineName: campaign ? "Campaign pipeline" : "Manual pipeline",
    trigger: campaign ? "Campaign" : "Manual",
    agent: agentLabel(current.role),
    startedAt: firstStart ? formatClock(firstStart) : "Not started",
    duration: formatDuration(durationBetween(firstStart, end, now)),
    status: active ? "Running" : failed ? "Failed" : "Completed",
    completedStages: completed,
    totalStages: ordered.length,
    progressPercent: Math.round((completed / ordered.length) * 100),
    currentStep: { title: taskTitle(current), description: taskDescription(current) },
    latestActivity: {
      title: `${taskTitle(lastUpdated)} · ${lastUpdated.status.replace(/_/g, " ")}`,
      agent: agentLabel(lastUpdated.role),
      timestamp: timeAgo(lastUpdated.updated_at, now),
    },
    stages: ordered.map((t, index) => {
      const status = stageStatus(t);
      return {
        id: t.id,
        stepNumber: index + 1,
        title: `${index + 1}. ${taskTitle(t)}`,
        subtitle: `${agentLabel(t.role)} · ${STAGE_SUBTITLE[status]}`,
        status,
        progressPercent: taskProgress(t),
        iconType: ROLE_ICON[t.role] ?? "process",
        description: taskDescription(t),
        logs: taskTrace(t, byId),
      };
    }),
  };
}

export interface TaskKpis {
  running: number;
  completedToday: number;
  needsReview: number;
  blocked: number;
}

export function taskKpis(tasks: WorkflowTask[]): TaskKpis {
  return {
    running: tasks.filter((t) => t.status === "running").length,
    completedToday: tasks.filter((t) => t.status === "completed" && isToday(t.completed_at)).length,
    needsReview: tasks.filter((t) => t.status === "awaiting_approval").length,
    blocked: tasks.filter((t) => t.status === "failed").length,
  };
}
