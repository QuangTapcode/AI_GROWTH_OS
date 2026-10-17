import { AppError } from "@/lib/errors";
import { AuthUser } from "@/lib/auth";
import { resolveTenantContext, requireRole } from "@/lib/tenant";
import {
  reviewApprovalSchema,
  createApprovalSchema,
  ReviewApprovalInput,
  CreateApprovalInput,
} from "./schemas";
import * as repo from "./repository";

export async function reviewWorkspaceApproval(
  user: AuthUser,
  workspaceId: string,
  approvalId: string,
  rawInput: unknown
) {
  // 1. Chỉ OWNER mới có quyền duyệt, từ chối hoặc thu hồi
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner"]);

  // 2. Validate input schema
  const parseResult = reviewApprovalSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid approval review payload", fieldErrors);
  }

  const input: ReviewApprovalInput = parseResult.data;

  // 3. Lấy bản ghi approval
  const approval = await repo.getApprovalById(workspaceId, approvalId);
  if (!approval) {
    throw new AppError(404, "NOT_FOUND", "Approval record not found");
  }

  // 3.1. Chặn xung đột duyệt đồng thời (Concurrent Approval Protection)
  if (approval.status !== "pending") {
    throw new AppError(
      409,
      "APPROVAL_ALREADY_REVIEWED",
      `Approval record has already been reviewed (current status: ${approval.status}). Concurrent reviews are not allowed.`
    );
  }

  // 4. Lấy thông tin đối tượng đích (content, source, artifact)
  const target = await repo.getTargetInfo(workspaceId, approval.target_type, approval.target_id);
  if (!target) {
    throw new AppError(404, "NOT_FOUND", `Approval target '${approval.target_type}:${approval.target_id}' not found`);
  }

  // 5. OPTIMISTIC CONCURRENCY CONTROL: So khớp phiên bản
  if (target.version !== input.expected_version) {
    throw new AppError(
      409,
      "VERSION_CONFLICT",
      `Stale version conflict. Target current version is ${target.version}, but expected ${input.expected_version}. Please reload.`
    );
  }

  // 6. OPTIMISTIC CONCURRENCY CONTROL: So khớp mã băm SHA-256
  if (target.content_hash && target.content_hash !== input.expected_hash) {
    throw new AppError(
      409,
      "CONTENT_HASH_MISMATCH",
      `Content hash mismatch. Target content was modified after review request was generated. Please reload.`
    );
  }

  // 7. Áp dụng quyết định phê duyệt
  const updatedApproval = await repo.applyApprovalReview(
    workspaceId,
    approvalId,
    input,
    user.id,
    tenantCtx.role
  );

  // 8. Cập nhật trạng thái của đối tượng đích
  await repo.updateTargetApprovalStatus(
    workspaceId,
    approval.target_type,
    approval.target_id,
    input.decision,
    user.id
  );

  // 8.1. Thu hồi nguồn (Source Revoke Invalidation Cascade)
  if (input.decision === "revoke" && approval.target_type === "source") {
    await repo.invalidateApprovalsForTarget(
      workspaceId,
      "source",
      approval.target_id,
      "SOURCE_REVOKED"
    );
  }

  return updatedApproval;
}

export async function createWorkspaceApproval(
  user: AuthUser,
  workspaceId: string,
  rawInput: unknown
) {
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor"]);

  const parseResult = createApprovalSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid approval creation payload", fieldErrors);
  }

  const input: CreateApprovalInput = parseResult.data;
  const approval = await repo.createApprovalRecord(workspaceId, input);
  return approval;
}

export async function listWorkspaceApprovals(
  user: AuthUser,
  workspaceId: string,
  filters?: { target_type?: string; status?: string }
) {
  await resolveTenantContext(user, workspaceId);
  const items = await repo.listApprovals(workspaceId, filters);
  return { items };
}

export async function getWorkspaceApprovalDetail(
  user: AuthUser,
  workspaceId: string,
  approvalId: string
) {
  await resolveTenantContext(user, workspaceId);
  const approval = await repo.getApprovalById(workspaceId, approvalId);
  if (!approval) {
    throw new AppError(404, "NOT_FOUND", "Approval record not found");
  }
  return approval;
}

export async function invalidateTargetApprovals(
  workspaceId: string,
  targetType: string,
  targetId: string,
  reason: string = "STALE_VERSION"
) {
  return repo.invalidateApprovalsForTarget(workspaceId, targetType, targetId, reason);
}
