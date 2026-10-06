import { AppError } from "@/lib/errors";
import { AuthUser } from "@/lib/auth";
import { resolveTenantContext, requireRole } from "@/lib/tenant";
import { withTransaction } from "@/lib/db";
import {
  createWorkspaceSchema,
  addMemberSchema,
  CreateWorkspaceInput,
  AddMemberInput,
} from "./schemas";
import * as repo from "./repository";

export async function listUserWorkspaces(user: AuthUser) {
  await repo.ensureUserExists(user.id, user.email, user.name);
  const items = await repo.listWorkspacesForUser(user.id);
  return { items };
}

export async function getWorkspaceDetail(user: AuthUser, workspaceId: string) {
  // Xác thực quyền thuộc workspace
  await resolveTenantContext(user, workspaceId);
  const workspace = await repo.getWorkspaceById(workspaceId);
  if (!workspace) {
    throw new AppError(404, "NOT_FOUND", "Workspace not found");
  }
  return workspace;
}

export async function createWorkspace(user: AuthUser, rawInput: unknown) {
  const parseResult = createWorkspaceSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid workspace data", fieldErrors);
  }

  const input: CreateWorkspaceInput = parseResult.data;

  // Kiểm tra trùng lặp slug
  const existing = await repo.getWorkspaceBySlug(input.slug);
  if (existing) {
    throw new AppError(409, "SLUG_ALREADY_EXISTS", `Workspace slug '${input.slug}' is already taken`);
  }

  // Thực thi tạo workspace, gán owner và profile trong 1 transaction an toàn
  const workspace = await withTransaction(async (client) => {
    return repo.createWorkspaceWithDefaults(client, input, {
      id: user.id,
      email: user.email,
      name: user.name,
    });
  });

  return workspace;
}

export async function listWorkspaceMembers(user: AuthUser, workspaceId: string) {
  // Bất kỳ role nào (owner, editor, viewer) trong workspace đều có thể xem danh sách thành viên
  await resolveTenantContext(user, workspaceId);
  const rows = await repo.listMembers(workspaceId);
  const items = rows.map((r) => ({
    id: r.id,
    workspace_id: r.workspace_id,
    user_id: r.user_id,
    role: r.role,
    status: r.status,
    created_at: r.created_at,
    user: {
      email: r.email,
      full_name: r.full_name,
      avatar_url: r.avatar_url,
    },
  }));
  return { items };
}

export async function addWorkspaceMember(
  user: AuthUser,
  workspaceId: string,
  rawInput: unknown
) {
  // Chỉ OWNER mới được thêm thành viên
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner"]);

  const parseResult = addMemberSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid member data", fieldErrors);
  }

  const input: AddMemberInput = parseResult.data;

  // Lấy hoặc tạo tài khoản user theo email
  const targetUser = await repo.findOrCreateUserByEmail(input.email, input.full_name);

  // Thêm hoặc cập nhật membership
  await repo.addOrUpdateMembership(workspaceId, targetUser.id, input.role);

  return {
    workspace_id: workspaceId,
    user_id: targetUser.id,
    role: input.role,
    status: "active",
    user: {
      email: targetUser.email,
      full_name: targetUser.full_name,
    },
  };
}

export async function revokeWorkspaceMember(
  user: AuthUser,
  workspaceId: string,
  targetUserId: string
) {
  // Chỉ OWNER mới được thu hồi quyền thành viên
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner"]);

  const members = await repo.listMembers(workspaceId);
  const targetMember = members.find((m) => m.user_id === targetUserId);
  if (!targetMember) {
    throw new AppError(404, "NOT_FOUND", "Member not found in this workspace");
  }

  // Không cho phép thu hồi Owner cuối cùng của workspace
  if (targetMember.role === "owner") {
    const ownerCount = await repo.countActiveOwners(workspaceId);
    if (ownerCount <= 1) {
      throw new AppError(
        400,
        "CANNOT_REVOKE_LAST_OWNER",
        "Cannot revoke the last owner of a workspace"
      );
    }
  }

  await repo.revokeMembership(workspaceId, targetUserId);
  return { success: true };
}
