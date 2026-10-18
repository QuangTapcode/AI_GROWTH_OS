import type { Approval, ContentArtifact, WorkflowTask } from "@/lib/apiTypes";
import {
  agentLabel,
  durationBetween,
  formatDuration,
  humanize,
  operationLabel,
  payloadArray,
  payloadString,
  sha256Hex,
  shortCode,
  timeAgo,
} from "@/lib/format";
import type { ArtifactDeliverable, ArtifactStatus, HighIntentCard, PipelineNode } from "./types";

/** Chuyển content_artifacts (+ approvals, task) sang kiểu hiển thị của màn Artifacts. */

export function lineageId(artifact: ContentArtifact): string {
  return payloadString(artifact.payload, "lineage_id") ?? artifact.id;
}

export function latestApproval(artifactId: string, approvals: Approval[]): Approval | undefined {
  return approvals
    .filter((a) => a.target_type === "artifact" && a.target_id === artifactId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

function statusOf(approval: Approval | undefined): ArtifactStatus {
  if (!approval) return "Draft";
  if (approval.status === "pending") return "In review";
  if (approval.status === "approved") return "Approved";
  return "Rejected";
}

function badgeType(intent: string | undefined): HighIntentCard["badgeType"] {
  if (intent === "commercial" || intent === "transactional") return "commercial";
  if (intent === "informational") return "info";
  return "intent";
}

interface Item {
  topic?: string;
  keyword?: string;
  intent?: string;
  priority?: string;
  hypothesis?: string;
  note?: string;
  title?: string;
  description?: string;
  demand_score?: number;
  competition_score?: number;
}

function cards(payload: Record<string, unknown>): HighIntentCard[] {
  const opportunities = payloadArray<Item>(payload, "opportunities");
  if (opportunities.length > 0) {
    return opportunities.slice(0, 6).map((o, i) => ({
      number: String(i + 1).padStart(2, "0"),
      badge: o.priority ?? o.intent ?? "",
      badgeType: badgeType(o.intent),
      title: o.topic ?? o.keyword ?? "",
      description: o.hypothesis ?? "",
      volume: typeof o.demand_score === "number" ? `Demand ${o.demand_score}` : "",
      kdText: typeof o.competition_score === "number" ? `Competition ${o.competition_score}` : "",
    }));
  }
  const keywords = payloadArray<Item>(payload, "keywords");
  if (keywords.length > 0) {
    return keywords.slice(0, 6).map((k, i) => ({
      number: String(i + 1).padStart(2, "0"),
      badge: k.intent ?? "",
      badgeType: badgeType(k.intent),
      title: k.keyword ?? "",
      description: k.note ?? "",
      volume: "",
      kdText: "",
    }));
  }
  return payloadArray<Item>(payload, "topic_clusters")
    .slice(0, 6)
    .map((c, i) => ({
      number: String(i + 1).padStart(2, "0"),
      badge: "cluster",
      badgeType: "info" as const,
      title: c.title ?? "",
      description: c.description ?? "",
      volume: "",
      kdText: "",
    }));
}

function pipelineNodes(artifact: ContentArtifact, approval: Approval | undefined): PipelineNode[] {
  const status = statusOf(approval);
  return [
    { nodeId: "generated", name: "Generated", status: "Completed", tag: artifact.operation, iconType: "check" },
    { nodeId: "pinned", name: "Pinned", status: "Completed", tag: `v${artifact.version} · ${artifact.content_hash.slice(0, 8)}`, iconType: "check" },
    {
      nodeId: "review",
      name: "Human review",
      status: status === "Approved" ? "Completed" : status === "Draft" ? "Queued" : "Requires Review",
      tag: status === "Draft" ? "not requested" : status.toLowerCase(),
      iconType: "gavel",
    },
    {
      nodeId: "handoff",
      name: "Handoff",
      status: status === "Approved" ? "Selected" : "Queued",
      tag: status === "Approved" ? "ready" : "blocked",
      iconType: "sparkles",
    },
  ];
}

export function toArtifactDeliverable(
  artifact: ContentArtifact,
  context: { approvals: Approval[]; all: ContentArtifact[]; tasksById: Map<string, WorkflowTask>; workspaceName: string }
): ArtifactDeliverable {
  const approval = latestApproval(artifact.id, context.approvals);
  const status = statusOf(approval);
  const lineage = context.all.filter((a) => lineageId(a) === lineageId(artifact));
  const task = artifact.task_id ? context.tasksById.get(artifact.task_id) : undefined;
  const nodes = pipelineNodes(artifact, approval);
  const completed = nodes.filter((n) => n.status === "Completed" || n.status === "Selected").length;
  const active = nodes.find((n) => n.status !== "Completed") ?? nodes[nodes.length - 1];
  const document = payloadString(artifact.payload, "document_markdown");
  const statusText = approval
    ? `${humanize(approval.status)} ${timeAgo(approval.updated_at)}${approval.review_note ? ` · "${approval.review_note}"` : ""}`
    : "Not sent for review";

  return {
    id: artifact.id,
    code: shortCode("ART", artifact.id),
    title: artifact.title,
    version: `v${artifact.version}`,
    nextVersion: Math.max(...lineage.map((a) => a.version)) + 1,
    category: humanize(artifact.artifact_type).toUpperCase(),
    timeAgo: timeAgo(artifact.created_at),
    status,
    statusText,
    aiStatusBadge: `${operationLabel(artifact.operation)} · ${artifact.storage === "postgres_ledger" ? "ledger" : "AI run store"}`,
    workspaceTag: context.workspaceName,
    agent: agentLabel(artifact.role),
    versionsCount: lineage.length,
    executiveInsight: payloadString(artifact.payload, "summary") ?? "The agent did not provide a summary.",
    cards: cards(artifact.payload),
    pipeline: {
      pipelineId: task ? shortCode("TSK", task.id) : "—",
      completedStagesText: `${completed}/${nodes.length} stages`,
      totalRunTime: task ? formatDuration(durationBetween(task.started_at, task.completed_at)) : "—",
      isSynthetic: artifact.payload?.synthetic === true,
      nodes,
      activeNodeText: active.name,
      activeAgent: agentLabel(artifact.role),
      activeStatusText: statusText,
      outputPreviewText: `Output: ${shortCode("ART", artifact.id)} v${artifact.version} · sha256 ${artifact.content_hash.slice(0, 12)}…`,
    },
    documentContent: document ?? JSON.stringify(artifact.payload, null, 2),
    hasDocument: Boolean(document),
    canRequestReview: status === "Draft" || status === "Rejected",
    jsonPayload: { artifact, latest_approval: approval ?? null, task: task ?? null },
  };
}

/** content_hash = SHA-256 của {title, payload}, cùng công thức với scripts/seed.ts. */
export async function buildNextVersion(
  original: ContentArtifact,
  nextVersion: number,
  title: string,
  content: string,
  editorId: string
) {
  const payload: Record<string, unknown> = {
    ...original.payload,
    document_markdown: content,
    lineage_id: lineageId(original),
    previous_artifact_id: original.id,
    edited_by: editorId,
  };
  return {
    task_id: original.task_id,
    version: nextVersion,
    content_hash: await sha256Hex(JSON.stringify({ title, payload })),
    role: original.role,
    operation: original.operation,
    artifact_type: original.artifact_type,
    title,
    storage: "postgres_ledger" as const,
    payload,
    evidence: original.evidence,
  };
}
