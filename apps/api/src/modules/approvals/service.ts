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
import { readWithOfflineDemo } from "../../lib/offlineDemo";

function getFallbackApprovals(workspaceId: string): repo.ApprovalRow[] {
  return [
    {
      id: "appr-seo-1",
      workspace_id: workspaceId,
      target_type: "artifact",
      target_id: "art-seo-1",
      target_version: 1,
      target_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      status: "pending",
      decision: null,
      actor_id: null,
      actor_role: null,
      review_note: "Chờ phê duyệt bài viết SEO trước khi xuất bản lên website tripc.vn",
      invalidated_reason: null,
      invalidated_at: null,
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "appr-soc-1",
      workspace_id: workspaceId,
      target_type: "artifact",
      target_id: "art-soc-1",
      target_version: 1,
      target_hash: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
      status: "pending",
      decision: null,
      actor_id: null,
      actor_role: null,
      review_note: "Kịch bản video TikTok 30s & bài đăng Fanpage hoàng hôn Sơn Trà",
      invalidated_reason: null,
      invalidated_at: null,
      created_at: new Date(Date.now() - 1800000).toISOString(),
      updated_at: new Date(Date.now() - 1800000).toISOString(),
    },
    {
      id: "appr-pub-1",
      workspace_id: workspaceId,
      target_type: "artifact",
      target_id: "art-pub-1",
      target_version: 1,
      target_hash: "c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef01234",
      status: "approved",
      decision: "approve",
      actor_id: "a0000000-0000-4000-8000-000000000001",
      actor_role: "owner",
      review_note: "Đã duyệt và phân phối lên Facebook Page & Google Maps",
      invalidated_reason: null,
      invalidated_at: null,
      created_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date(Date.now() - 5400000).toISOString(),
    }
  ];
}

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

  // 3. Toàn bộ quá trình kiểm tra OCC (expected_version, expected_hash), khóa dòng (FOR UPDATE),
  // cập nhật trạng thái phê duyệt, cập nhật đối tượng đích và thu hồi nguồn downstream
  // đều được thực thi NGUYÊN TỬ bên trong 1 Database Transaction duy nhất chống TOCTOU race condition.
  // Thao tác ghi: KHÔNG giả lập thành công khi DB lỗi (cổng duyệt của con người phải thật).
  return repo.executeApprovalReviewTransaction(workspaceId, approvalId, input, user.id, tenantCtx.role);
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

  return repo.createApprovalRecord(workspaceId, input);
}

export async function listWorkspaceApprovals(
  user: AuthUser,
  workspaceId: string,
  filters?: { target_type?: string; status?: string }
) {
  await resolveTenantContext(user, workspaceId);
  return readWithOfflineDemo(
    async () => ({ items: await repo.listApprovals(workspaceId, filters) }),
    () => {
      let fallback = getFallbackApprovals(workspaceId);
      if (filters?.status) fallback = fallback.filter((a) => a.status === filters.status);
      if (filters?.target_type) fallback = fallback.filter((a) => a.target_type === filters.target_type);
      return { items: fallback };
    }
  );
}

export async function getWorkspaceApprovalDetail(
  user: AuthUser,
  workspaceId: string,
  approvalId: string
) {
  await resolveTenantContext(user, workspaceId);
  const approval = await readWithOfflineDemo(
    () => repo.getApprovalById(workspaceId, approvalId),
    () => getFallbackApprovals(workspaceId).find((a) => a.id === approvalId) ?? null
  );
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
  // Không nuốt lỗi: approval cũ còn hiệu lực sau khi nội dung đổi là lỗ hổng cổng duyệt.
  return repo.invalidateApprovalsForTarget(workspaceId, targetType, targetId, reason);
}
