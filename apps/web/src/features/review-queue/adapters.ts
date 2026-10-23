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

export function extractPlanResult(payload: Record<string, unknown>): Record<string, unknown> {
  if (payload.result && typeof payload.result === "object" && !Array.isArray(payload.result)) {
    return payload.result as Record<string, unknown>;
  }
  return payload;
}

export function formatDocumentMarkdown(payload: Record<string, unknown>): string | undefined {
  const directDoc = payloadString(payload, "document_markdown");
  if (directDoc) return directDoc;

  const planResult = extractPlanResult(payload);
  const selected = planResult.selected_opportunity as Record<string, unknown> | undefined;
  const objective = payloadString(planResult, "objective");
  const tasks = Array.isArray(planResult.tasks) ? (planResult.tasks as Array<Record<string, unknown>>) : [];
  const scoreObj = planResult.opportunity_score as Record<string, unknown> | undefined;

  if (!selected && !objective && tasks.length === 0) return undefined;

  const topic = selected?.topic ? String(selected.topic) : "Campaign Strategy";
  const lines: string[] = [
    `# Strategic Campaign Plan: ${topic}`,
    "",
    objective ? `**Objective**: ${objective}` : "",
    scoreObj?.score !== undefined ? `**Opportunity Score**: ${scoreObj.score} / 1000` : "",
    selected?.audience_fit ? `**Target Audience**: ${selected.audience_fit}` : "",
    selected?.user_need ? `**User Need**: ${selected.user_need}` : "",
    "",
  ];

  if (selected?.rationale) {
    lines.push("## Strategic Rationale");
    lines.push(String(selected.rationale));
    lines.push("");
  }

  if (selected?.offer_fit) {
    lines.push("## Offer Fit");
    lines.push(Array.isArray(selected.offer_fit) ? selected.offer_fit.map((o) => `- ${o}`).join("\n") : String(selected.offer_fit));
    lines.push("");
  }

  if (tasks.length > 0) {
    lines.push("## Downstream Deliverable Briefs (DAG)");
    tasks.forEach((t, idx) => {
      const role = String(t.role ?? "task").toUpperCase();
      const brief = (t.brief ?? {}) as Record<string, unknown>;
      lines.push(`### ${idx + 1}. ${role} Task: ${brief.topic ?? role}`);
      if (brief.intent) lines.push(`- **Intent**: ${brief.intent}`);
      if (brief.cta) lines.push(`- **CTA**: ${brief.cta}`);
      if (Array.isArray(brief.offer)) lines.push(`- **Offer**: ${brief.offer.join(", ")}`);
      if (Array.isArray(brief.angles)) lines.push(`- **Angles**: ${brief.angles.join(", ")}`);
      if (Array.isArray(brief.channels)) lines.push(`- **Channels**: ${brief.channels.join(", ")}`);
      lines.push("");
    });
  }

  return lines.filter((l, i, arr) => !(l === "" && arr[i - 1] === "")).join("\n").trim();
}

function topicClusters(payload: Record<string, unknown>): TopicCluster[] {
  const clusters = payloadArray<Cluster>(payload, "topic_clusters");
  if (clusters.length > 0) {
    return clusters.slice(0, 6).map((c, i) => ({
      id: `cluster-${i}`,
      letter: String.fromCharCode(65 + i),
      title: c.title ?? "",
      description: c.description ?? "",
      serpVoidBadge: "",
    }));
  }
  const opportunities = payloadArray<Cluster>(payload, "opportunities");
  if (opportunities.length > 0) {
    return opportunities.slice(0, 6).map((o, i) => ({
      id: `cluster-${i}`,
      letter: String.fromCharCode(65 + i),
      title: o.topic ?? "",
      description: o.hypothesis ?? "",
      serpVoidBadge: o.intent ? humanize(o.intent) : "",
    }));
  }
  const keywords = payloadArray<Cluster>(payload, "keywords");
  if (keywords.length > 0) {
    return keywords.slice(0, 6).map((k, i) => ({
      id: `cluster-${i}`,
      letter: String.fromCharCode(65 + i),
      title: k.keyword ?? "",
      description: k.note ?? "",
      serpVoidBadge: k.intent ? humanize(k.intent) : "",
    }));
  }

  // Fallback to real CampaignPlan result (Growth Lead)
  const planResult = extractPlanResult(payload);
  const selected = planResult.selected_opportunity as Record<string, unknown> | undefined;
  const tasks = Array.isArray(planResult.tasks) ? (planResult.tasks as Array<Record<string, unknown>>) : [];
  const scoreObj = planResult.opportunity_score as Record<string, unknown> | undefined;

  const dynamicItems: Array<{ title: string; description: string; badge: string }> = [];

  if (selected && typeof selected === "object") {
    dynamicItems.push({
      title: String(selected.topic ?? "Primary Campaign Opportunity"),
      description: `${String(selected.rationale ?? "")}${selected.audience_fit ? ` (Audience: ${selected.audience_fit})` : ""}`,
      badge: scoreObj?.score !== undefined ? `Score: ${scoreObj.score}` : "Strategic Pick",
    });
    if (selected.user_need) {
      dynamicItems.push({
        title: `User Need: ${String(selected.user_need)}`,
        description: `Offer Fit: ${Array.isArray(selected.offer_fit) ? selected.offer_fit.join(", ") : String(selected.offer_fit ?? "Verified housing & coworking")}`,
        badge: selected.confidence ? `Confidence: ${selected.confidence}` : "User Intent",
      });
    }
  }

  for (const t of tasks) {
    const brief = (t.brief ?? {}) as Record<string, unknown>;
    const role = String(t.role ?? "Task").toUpperCase();
    const taskTopic = String(brief.topic ?? brief.cta ?? `${role} Deliverable`);
    const angles = Array.isArray(brief.angles) ? brief.angles.join(", ") : "";
    const offer = Array.isArray(brief.offer) ? brief.offer.join(", ") : "";
    const desc = brief.cta ? `CTA: ${brief.cta}${angles ? ` · Angles: ${angles}` : ""}` : (offer ? `Offer: ${offer}` : `${role} task brief`);
    dynamicItems.push({
      title: `${role}: ${taskTopic}`,
      description: desc,
      badge: String(brief.intent ?? t.role ?? "Queued"),
    });
  }

  return dynamicItems.slice(0, 6).map((c, i) => ({
    id: `cluster-${i}`,
    letter: String.fromCharCode(65 + i),
    title: c.title,
    description: c.description,
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

  const planResult = extractPlanResult(payload);
  const selected = planResult.selected_opportunity as Record<string, unknown> | undefined;

  const rawTitle = artifact?.title;
  const displayTitle =
    rawTitle && rawTitle !== artifact?.role && rawTitle !== "ai_result"
      ? rawTitle
      : selected?.topic
      ? String(selected.topic)
      : planResult.objective
      ? String(planResult.objective)
      : artifact?.title ?? `${humanize(approval.target_type)} ${shortCode("ID", approval.target_id)}`;

  const summary =
    payloadString(payload, "summary") ??
    payloadString(planResult, "summary") ??
    (planResult.objective
      ? `${planResult.objective}.${selected?.rationale ? ` Rationale: ${selected.rationale}` : ""}`
      : selected?.rationale
      ? String(selected.rationale)
      : "The agent did not provide a summary.");

  const targetCluster =
    payloadString(payload, "target_cluster") ??
    payloadString(planResult, "target_cluster") ??
    (selected?.topic ? String(selected.topic) : "—");

  const targetLocale =
    payloadString(payload, "target_locale") ??
    payloadString(planResult, "target_locale") ??
    (selected?.audience_fit ? "Da Nang (Expats & Nomads)" : "—");

  return {
    id: approval.id,
    taskId: task ? shortCode("TSK", task.id) : "—",
    runId: shortCode("APR", approval.id),
    title: displayTitle,
    version: `v${approval.target_version}`,
    category: artifact ? humanize(artifact.artifact_type).toUpperCase() : approval.target_type.toUpperCase(),
    timeAgo: timeAgo(approval.created_at),
    createdAt: formatDateTime(approval.created_at),
    status,
    statusTag,
    agent: artifact ? agentLabel(artifact.role) : "—",
    targetCluster,
    targetLocale,
    latency: task ? formatDuration(durationBetween(task.started_at, task.completed_at)) : "—",
    stagesCompletedText: `${steps.filter((s) => s.status === "completed").length} of ${steps.length} stages completed`,
    pipelineSteps: steps,
    validations: validations(approval, artifact),
    executiveSummary: summary,
    topicClusters: topicClusters(payload),
    jsonPayload: { approval, artifact: artifact ?? null },
    rejectionReason,
    pipelineNotice:
      approval.status === "pending"
        ? "The output is pinned at this version and hash. Nothing moves forward until an owner decides."
        : `Decision recorded ${formatDateTime(approval.updated_at)}${approval.review_note ? ` · "${approval.review_note}"` : ""}.`,
    documentContent: formatDocumentMarkdown(payload),
  };
}

export function reviewStats(approvals: Approval[]): ReviewQueueStats {
  return {
    pendingCount: approvals.filter((a) => a.status === "pending").length,
    approvedTodayCount: approvals.filter((a) => a.status === "approved" && isToday(a.updated_at)).length,
    rejectedCount: approvals.filter((a) => a.status === "rejected" || a.status === "revoked").length,
  };
}
