import type { NextRequest } from "next/server";
import { authenticateUser } from "./auth";
import { AppError } from "./errors";
import { resolveTenantContext, requireRole, type Role, type TenantContext } from "./tenant";

/** Xác thực + kiểm tra thành viên workspace + vai trò cho route /v1/workspaces/:id/... */
export async function requireWorkspaceRole(
  req: NextRequest,
  workspaceId: string,
  roles: Role[] = ["owner", "editor", "viewer"],
): Promise<TenantContext> {
  const tenant = await resolveTenantContext(authenticateUser(req), workspaceId);
  requireRole(tenant, roles);
  return tenant;
}

export async function readJsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
}
