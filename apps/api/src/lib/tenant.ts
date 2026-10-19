import { query } from "./db";
import { AppError } from "./errors";
import { AuthUser } from "./auth";

export type Role = "owner" | "editor" | "viewer";

/**
 * Phiên còn hiệu lực: token không có sid (dev token) thì bỏ qua; có sid thì phải tồn tại,
 * đúng user, chưa thu hồi và chưa hết hạn. userParam/sessionParam là vị trí tham số ($n).
 */
function sessionActiveSql(userParam: string, sessionParam: string): string {
  return `(
    ${sessionParam}::uuid IS NULL OR EXISTS (
      SELECT 1 FROM auth_sessions s
      WHERE s.id = ${sessionParam}::uuid AND s.user_id = ${userParam}::uuid
        AND s.revoked_at IS NULL AND s.expires_at > NOW()
    )
  )`;
}

const SESSION_REVOKED = () => new AppError(401, "SESSION_REVOKED", "Your session has ended. Please sign in again.");

/** Dùng cho route không gắn workspace (vd. /auth/me, /workspaces) để tôn trọng logout. */
export async function assertActiveSession(user: AuthUser): Promise<void> {
  if (!user.sessionId) return;
  const res = await query<{ session_active: boolean }>(
    `SELECT ${sessionActiveSql("$1", "$2")} AS session_active`,
    [user.id, user.sessionId]
  );
  if (!res.rows[0]?.session_active) throw SESSION_REVOKED();
}

export interface TenantContext {
  user: AuthUser;
  workspaceId: string;
  role: Role;
}

/**
 * Kiểm tra xem User có quyền truy cập Workspace này không.
 * Đồng thời lấy ra Role của User trong Workspace đó.
 */
export async function resolveTenantContext(
  user: AuthUser,
  workspaceId: string
): Promise<TenantContext> {
  if (!workspaceId) {
    throw new AppError(400, "BAD_REQUEST", "Workspace ID is required");
  }

  // Truy vấn memberships (quan hệ User <-> Workspace) và phiên đăng nhập trong cùng một lượt
  try {
    const res = await query<{ role: Role | null; status: string | null; session_active: boolean }>(
      `SELECT m.role, m.status, ${sessionActiveSql("$1", "$3")} AS session_active
       FROM (SELECT 1) AS one
       LEFT JOIN memberships m ON m.user_id = $1 AND m.workspace_id = $2`,
      [user.id, workspaceId, user.sessionId ?? null]
    );
    const row = res.rows[0];

    if (!row?.session_active) throw SESSION_REVOKED();

    if (!row.role || row.status !== "active") {
      // Chặn đứng vi phạm Cross-Tenant: Người dùng không thuộc workspace này
      throw new AppError(
        403,
        "FORBIDDEN",
        "You do not have access to this workspace"
      );
    }

    return {
      user,
      workspaceId,
      role: row.role,
    };
  } catch (err: any) {
    if (err instanceof AppError) throw err;

    // Lỗi cú pháp UUID hoặc database error
    if (err?.code === "22P02") {
      throw new AppError(400, "BAD_REQUEST", "Invalid UUID parameter format");
    }

    console.error("Tenant resolution failed:", err);
    throw new AppError(500, "INTERNAL_ERROR", "Failed to resolve tenant context");
  }
}

/**
 * Hàm chặn quyền: Chỉ cho phép các Role được chỉ định thực hiện hành động
 */
export function requireRole(context: TenantContext, allowedRoles: Role[]): void {
  if (!allowedRoles.includes(context.role)) {
    throw new AppError(
      403,
      "PERMISSION_DENIED",
      `Role '${context.role}' is not allowed to perform this action. Required: [${allowedRoles.join(", ")}]`
    );
  }
}

/**
 * Helper kiểm tra quyền truy cập và vai trò của user trong workspace
 */
export async function requireWorkspaceAccess(
  workspaceId: string,
  userOrId: AuthUser | string,
  allowedRoles?: Role[]
): Promise<TenantContext> {
  const user = typeof userOrId === "string" ? { id: userOrId, email: "", name: "" } : userOrId;
  const ctx = await resolveTenantContext(user, workspaceId);
  if (allowedRoles && allowedRoles.length > 0) {
    requireRole(ctx, allowedRoles);
  }
  return ctx;
}
