import { AppError } from "../../lib/errors";
import { AuthUser } from "../../lib/auth";
import { resolveTenantContext, requireRole } from "../../lib/tenant";
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
  // 1. Chỉ OWNER hoặc EDITOR mới có quyền duyệt, từ chối hoặc thu hồi (CM-25 / CM-26 RBAC)
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor"]);

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

  // 3. Toàn bộ quá trình kiểm tra OCC (expected_version, expected_hash), khóa dòng (FOR UPDATE),
  // cập nhật trạng thái phê duyệt, cập nhật đối tượng đích và thu hồi nguồn downstream
  // đều được thực thi NGUYÊN TỬ bên trong 1 Database Transaction duy nhất chống TOCTOU race condition.
  const updatedApproval = await repo.executeApprovalReviewTransaction(
    workspaceId,
    approvalId,
    input,
    user.id,
    tenantCtx.role
  );

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

  // Kiểm tra sự tồn tại của đối tượng đích trong workspace (chống approval ma / cross-tenant dangling)
  const target = await repo.getTargetInfo(workspaceId, input.target_type, input.target_id);
  if (!target) {
    throw new AppError(
      404,
      "NOT_FOUND",
      `Approval target '${input.target_type}:${input.target_id}' does not exist in this workspace`
    );
  }

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
