import { z } from "zod";

// 6 AI Agent Roles chính thức theo kiến trúc SIX-AGENT-RESTRUCTURE và CR-002
export const TASK_ROLES = [
  "research",
  "growth_lead",
  "seo",
  "content",
  "community",
  "performance",
] as const;

export type TaskRole = (typeof TASK_ROLES)[number];

export const TASK_STATUSES = [
  "pending",
  "queued",
  "running",
  "completed",
  "failed",
  "awaiting_approval",
  "cancelled",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const createWorkflowTaskSchema = z.object({
  campaign_id: z.string().uuid("Invalid campaign_id UUID format").optional().nullable(),
  role: z.enum(TASK_ROLES, {
    errorMap: () => ({
      message: "Unknown or unsupported role. Must be one of: research, growth_lead, seo, content, community, performance",
    }),
  }),
  operation: z.string().min(1, "Operation is required").max(100),
  priority: z.number().int().min(1).max(5).default(3),
  input_version: z.number().int().min(1, "input_version must be >= 1").default(1),
  context_snapshot_id: z.string().uuid("Invalid context_snapshot_id UUID format").optional().nullable(),
  dependencies: z.array(z.string().uuid("Each dependency must be a valid UUID")).default([]),
  payload: z.record(z.any()).default({}),
});

export type CreateWorkflowTaskInput = z.infer<typeof createWorkflowTaskSchema>;

export const updateTaskStatusSchema = z.object({
  status: z.enum(TASK_STATUSES, {
    errorMap: () => ({
      message: "Invalid status. Must be one of: pending, queued, running, completed, failed, awaiting_approval, cancelled",
    }),
  }),
  result_ref: z.string().uuid().optional().nullable(),
  error_details: z.record(z.any()).optional().nullable(),
});

export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;

export const createArtifactSchema = z.object({
  task_id: z.string().uuid("Invalid task_id UUID format").optional().nullable(),
  version: z.number().int().min(1).default(1),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/, "content_hash must be a 64-character lowercase SHA-256 hex string"),
  context_snapshot_id: z.string().uuid("Invalid context_snapshot_id UUID format").optional().nullable(),
  role: z.enum(TASK_ROLES, {
    errorMap: () => ({
      message: "Invalid role. Must be one of: research, growth_lead, seo, content, community, performance",
    }),
  }),
  operation: z.string().min(1, "Operation is required").max(100),
  artifact_type: z.string().min(1, "artifact_type is required").max(100),
  title: z.string().min(1, "Title is required").max(255),
  storage: z.enum(["ai_run_store", "postgres_ledger"]).default("postgres_ledger"),
  payload: z.record(z.any()).default({}),
  evidence: z.array(z.any()).default([]),
});

export type CreateArtifactInput = z.infer<typeof createArtifactSchema>;
