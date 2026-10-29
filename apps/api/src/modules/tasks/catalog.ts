import type { TaskRole } from "./schemas";

/**
 * The workflow UI exposes these operations as executable agent work. Keep this
 * catalog in the API boundary so a task cannot be created with a role/operation
 * pair that the worker will never dispatch.
 */
export const AGENT_OPERATION_ROLES: Record<string, TaskRole> = {
  "research.run": "research",
  "opportunity.score": "growth_lead",
  "strategy.generate": "growth_lead",
  "brief.generate": "growth_lead",
  "learning.analyze": "growth_lead",
  "seo.audit": "seo",
  "seo.local_draft": "seo",
  "content.refresh": "seo",
  "content.generate": "content",
  "content.repurpose": "content",
  "content.quality_check": "content",
  "community.response": "community",
  "analytics.report": "performance",
  "experiment.hypothesis": "performance",
};

export const EXECUTABLE_AGENT_OPERATIONS = new Set(Object.keys(AGENT_OPERATION_ROLES));

export function expectedRoleForOperation(operation: string): TaskRole | undefined {
  return AGENT_OPERATION_ROLES[operation];
}

export function isExecutableAgentOperation(operation: string): boolean {
  return EXECUTABLE_AGENT_OPERATIONS.has(operation);
}

/**
 * Convert the lightweight task form used by the Workflows modal into the
 * typed input consumed by the durable plan outbox. Specialized handoff routes
 * already send `payload.input`; this helper only fills safe defaults for the
 * operations that can be started without a parent artifact.
 */
export function normalizeTaskPayload(
  operation: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const input = payload.input;
  if (input && typeof input === "object" && !Array.isArray(input)) {
    return payload;
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const description = typeof payload.description === "string" ? payload.description.trim() : "";
  if (operation === "research.run") {
    return { ...payload, input: { operation } };
  }
  if (operation === "community.response") {
    const question = (typeof payload.question === "string" ? payload.question : description || title).trim();
    return { ...payload, input: { operation, question } };
  }
  if (operation === "analytics.report") {
    return { ...payload, input: { operation } };
  }
  return payload;
}

export function missingTaskPrerequisite(
  operation: string,
  payload: Record<string, unknown>,
): string | null {
  const input = (payload.input && typeof payload.input === "object" && !Array.isArray(payload.input))
    ? payload.input as Record<string, unknown>
    : payload;
  if (operation === "research.run" || operation === "analytics.report" || operation === "learning.analyze") return null;
  if (operation === "community.response") {
    return typeof input.question === "string" && input.question.trim() ? null : "question";
  }
  if (operation === "experiment.hypothesis") return input.experiment ? null : "experiment";
  if (["opportunity.score", "strategy.generate", "brief.generate"].includes(operation)) {
    if (typeof input.research_artifact_id !== "string") return "research_artifact_id";
    if (typeof input.cta !== "string" || !input.cta.trim()) return "cta";
    if (typeof input.deadline !== "string") return "deadline";
    return null;
  }
  if (["seo.audit", "seo.local_draft", "content.refresh"].includes(operation)) {
    if (typeof input.research_artifact_id !== "string") return "research_artifact_id";
    if (typeof input.cta !== "string" || !input.cta.trim()) return "cta";
    return null;
  }
  if (["content.generate", "content.repurpose", "content.quality_check"].includes(operation)) {
    if (typeof input.source_article_id !== "string") return "source_article_id";
    if (typeof input.cta !== "string" || !input.cta.trim()) return "cta";
    return null;
  }
  return "operation";
}
