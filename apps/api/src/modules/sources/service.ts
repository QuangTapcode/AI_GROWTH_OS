import { AppError } from "@/lib/errors";
import { AuthUser } from "@/lib/auth";
import { resolveTenantContext, requireRole } from "@/lib/tenant";
import {
  createSourceSchema,
  reviewSourceSchema,
  CreateSourceInput,
  ReviewSourceInput,
} from "./schemas";
import * as repo from "./repository";

export async function listWorkspaceSources(
  user: AuthUser,
  workspaceId: string,
  filters?: { status?: string; category?: string }
) {
  // Mọi role (owner, editor, viewer) đều được đọc danh sách nguồn
  await resolveTenantContext(user, workspaceId);
  const items = await repo.listSources(workspaceId, filters);
  return { items };
}

export async function getWorkspaceSourceDetail(
  user: AuthUser,
  workspaceId: string,
  sourceId: string
) {
  await resolveTenantContext(user, workspaceId);
  const source = await repo.getSourceById(workspaceId, sourceId);
  if (!source) {
    throw new AppError(404, "NOT_FOUND", "Source not found");
  }
  return source;
}

export async function createWorkspaceSource(
  user: AuthUser,
  workspaceId: string,
  rawInput: unknown
) {
  // Chỉ Owner và Editor được tải lên nguồn (Viewer bị chặn 403)
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor"]);

  const parseResult = createSourceSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid source data", fieldErrors);
  }

  const input: CreateSourceInput = parseResult.data;
  const source = await repo.createSource(workspaceId, input);
  return source;
}

export async function reviewWorkspaceSource(
  user: AuthUser,
  workspaceId: string,
  sourceId: string,
  rawInput: unknown
) {
  // Chỉ OWNER mới được duyệt, từ chối hoặc thu hồi nguồn
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner"]);

  const parseResult = reviewSourceSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid review payload", fieldErrors);
  }

  const input: ReviewSourceInput = parseResult.data;

  // Kiểm tra sự tồn tại của nguồn
  const source = await repo.getSourceById(workspaceId, sourceId);
  if (!source) {
    throw new AppError(404, "NOT_FOUND", "Source not found");
  }

  // OPTIMISTIC CONCURRENCY CHECK: So khớp expected_version
  if (source.version !== input.expected_version) {
    throw new AppError(
      409,
      "VERSION_CONFLICT",
      `Stale version conflict. Current version is ${source.version}, but expected ${input.expected_version}. Please reload.`
    );
  }

  const updatedSource = await repo.updateSourceReview(
    workspaceId,
    sourceId,
    input.decision,
    user.id
  );

  return updatedSource;
}

export async function deleteWorkspaceSource(
  user: AuthUser,
  workspaceId: string,
  sourceId: string
) {
  // Chỉ OWNER mới được xóa nguồn
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner"]);

  const source = await repo.getSourceById(workspaceId, sourceId);
  if (!source) {
    throw new AppError(404, "NOT_FOUND", "Source not found");
  }

  await repo.softDeleteSource(workspaceId, sourceId);
  return { success: true, message: "Source deleted successfully" };
}
