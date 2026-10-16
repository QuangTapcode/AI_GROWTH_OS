import { z } from "zod";

export const APPROVAL_TARGET_TYPES = [
  "source",
  "content",
  "artifact",
  "task",
  "campaign",
] as const;

export type ApprovalTargetType = (typeof APPROVAL_TARGET_TYPES)[number];

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "revoked",
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_DECISIONS = [
  "approve",
  "reject",
  "revoke",
] as const;

export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const reviewApprovalSchema = z.object({
  decision: z.enum(APPROVAL_DECISIONS, {
    errorMap: () => ({ message: "Decision must be one of: approve, reject, revoke" }),
  }),
  expected_version: z.number().int().min(1, "expected_version must be >= 1"),
  expected_hash: z.string().regex(/^[a-f0-9]{64}$/, "expected_hash must be a 64-character lowercase SHA-256 hex string"),
  review_note: z.string().max(1000).optional().nullable(),
});

export type ReviewApprovalInput = z.infer<typeof reviewApprovalSchema>;

export const createApprovalSchema = z.object({
  target_type: z.enum(APPROVAL_TARGET_TYPES),
  target_id: z.string().uuid("Invalid target_id UUID format"),
  target_version: z.number().int().min(1).default(1),
  target_hash: z.string().regex(/^[a-f0-9]{64}$/, "target_hash must be a 64-character lowercase SHA-256 hex string"),
  review_note: z.string().optional().nullable(),
});

export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;
