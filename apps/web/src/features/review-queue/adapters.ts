import type { Approval, ContentArtifact, WorkflowTask } from "@/lib/apiTypes";
import {
  agentLabel,
  durationBetween,
  formatDateTime,
  formatDuration,
  humanize,
  isToday,
  payloadArray,
  payloadString,
  shortCode,
  timeAgo,
} from "@/lib/format";
import type { PipelineStep, ReviewItem, ReviewQueueStats, TopicCluster, ValidationBadge } from "./types";

/** Chuyển approvals (+ artifact đích + task sinh ra artifact) sang kiểu hiển thị của Review Queue. */

interface Cluster {
  title?: string;
  description?: string;
  keyword?: string;
  note?: string;
  intent?: string;
  topic?: string;
  hypothesis?: string;
}

function topicClusters(payload: Record<string, unknown>): TopicCluster[] {
  const clusters = payloadArray<Cluster>(payload, "topic_clusters");
  const source =
    clusters.length > 0
      ? clusters.map((c) => ({ title: c.title, description: c.description, badge: "" }))
      : payloadArray<Cluster>(payload, "opportunities").length > 0
      ? payloadArray<Cluster>(payload, "opportunities").map((o) => ({ title: o.topic, description: o.hypothesis, badge: o.intent ?? "" }))
      : payloadArray<Cluster>(payload, "keywords").map((k) => ({ title: k.keyword, description: k.note, badge: k.intent ?? "" }));
  return source
    .filter((c) => c.title)
    .slice(0, 6)
    .map((c, i) => ({
      id: `cluster-${i}`,
      letter: String.fromCharCode(65 + i),
      title: c.title ?? "",
      description: c.description ?? "",
      serpVoidBadge: c.badge ? humanize(c.badge) : "",
    }));
}

function validations(approval: Approval, artifact: ContentArtifact | undefined): ValidationBadge[] {
  if (!artifact) {
    return [{ id: "target", title: "Target not found", subtitle: `${approval.target_type} ${shortCode("ID", approval.target_id)}`, passed: false }];
  }
  const missingFacts = payloadArray<string>(artifact.payload, "missing_facts");
  return [
    {
      id: "version",
      title: approval.target_version === artifact.version && approval.target_hash === artifact.content_hash ? "Version & hash pinned" : "Version mismatch",
      subtitle: `v${approval.target_version} · ${approval.target_hash.slice(0, 12)}…`,
      passed: approval.target_version === artifact.version && approval.target_hash === artifact.content_hash,
    },
    {
      id: "evidence",
      title: artifact.evidence.length > 0 ? "Evidence attached" : "No evidence",
      subtitle: `${artifact.evidence.length} source reference${artifact.evidence.length === 1 ? "" : "s"}`,
      passed: artifact.evidence.length > 0,
    },
    {
      id: "facts",
      title: missingFacts.length === 0 ? "No missing facts" : "Missing facts",
      subtitle: missingFacts.length === 0 ? "Agent reported none" : missingFacts.slice(0, 2).join("; "),
      passed: missingFacts.length === 0,
    },
  ];
}

function pipelineSteps(approval: Approval, artifact: ContentArtifact | undefined, task: WorkflowTask | undefined): PipelineStep[] {
  const reviewStatus: PipelineStep["status"] = approval.status === "pending" ? "paused" : "completed";
  return [
    {
      stepNumber: 1,
      name: "Generated",
      description: artifact ? `${agentLabel(artifact.role)} · ${artifact.operation}` : "Target unavailable",
      status: artifact ? "completed" : "queued",
    },
    {
      stepNumber: 2,
      name: "Pinned",
      description: `Version ${approval.target_version}, SHA-256 hash recorded`,
      status: "completed",
    },
    {
      stepNumber: 3,
      name: "Human review",
      description:
        approval.status === "pending"
          ? "Waiting for an owner decision"
          : `${humanize(approval.status)} by ${approval.actor_role ?? "reviewer"} ${timeAgo(approval.updated_at)}`,
      status: reviewStatus,
    },
    {
      stepNumber: 4,
      name: "Handoff",
      description:
        approval.status === "approved"
          ? task
            ? `Ready for next step after ${shortCode("TSK", task.id)}`
            : "Ready for publishing handoff"
          : "Blocked until approved",
      status: approval.status === "approved" ? "completed" : "queued",
    },
  ];
}

export function toReviewItem(
  approval: Approval,
  artifactsById: Map<string, ContentArtifact>,
  tasksById: Map<string, WorkflowTask>
): ReviewItem {
  const artifact = approval.target_type === "artifact" ? artifactsById.get(approval.target_id) : undefined;
  const task = artifact?.task_id ? tasksById.get(artifact.task_id) : approval.target_type === "task" ? tasksById.get(approval.target_id) : undefined;
  const payload = artifact?.payload ?? {};
  const steps = pipelineSteps(approval, artifact, task);
  const status: ReviewItem["status"] = approval.status === "pending" ? "pending" : approval.status === "approved" ? "approved" : "rejected";
  const statusTag: ReviewItem["statusTag"] = status === "pending" ? "Review" : status === "approved" ? "Approved" : "Rejected";
  const rejectionReason =
    approval.status === "revoked"
      ? `Revoked${approval.invalidated_reason ? `: ${approval.invalidated_reason}` : ""}`
      : approval.review_note ?? undefined;

  return {
    id: approval.id,
    taskId: task ? shortCode("TSK", task.id) : "—",
    runId: shortCode("APR", approval.id),
    title: artifact?.title ?? `${humanize(approval.target_type)} ${shortCode("ID", approval.target_id)}`,
    version: `v${approval.target_version}`,
    category: artifact ? humanize(artifact.artifact_type).toUpperCase() : approval.target_type.toUpperCase(),
    timeAgo: timeAgo(approval.created_at),
    createdAt: formatDateTime(approval.created_at),
    status,
    statusTag,
    agent: artifact ? agentLabel(artifact.role) : "—",
    targetCluster: payloadString(payload, "target_cluster") ?? "—",
    targetLocale: payloadString(payload, "target_locale") ?? "—",
    latency: task ? formatDuration(durationBetween(task.started_at, task.completed_at)) : "—",
    stagesCompletedText: `${steps.filter((s) => s.status === "completed").length} of ${steps.length} stages completed`,
    pipelineSteps: steps,
    validations: validations(approval, artifact),
    executiveSummary: payloadString(payload, "summary") ?? "The agent did not provide a summary.",
    topicClusters: topicClusters(payload),
    jsonPayload: { approval, artifact: artifact ?? null },
    rejectionReason,
    pipelineNotice:
      approval.status === "pending"
        ? "The output is pinned at this version and hash. Nothing moves forward until an owner decides."
        : `Decision recorded ${formatDateTime(approval.updated_at)}${approval.review_note ? ` · "${approval.review_note}"` : ""}.`,
    documentContent: payloadString(payload, "document_markdown") ?? undefined,
  };
}

export function reviewStats(approvals: Approval[]): ReviewQueueStats {
  return {
    pendingCount: approvals.filter((a) => a.status === "pending").length,
    approvedTodayCount: approvals.filter((a) => a.status === "approved" && isToday(a.updated_at)).length,
    rejectedCount: approvals.filter((a) => a.status === "rejected" || a.status === "revoked").length,
  };
}
