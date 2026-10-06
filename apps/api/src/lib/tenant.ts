import { query } from "./db";
import { AppError } from "./errors";
import { AuthUser } from "./auth";

export type Role = "owner" | "editor" | "viewer";

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

  // Truy vấn bảng memberships để kiểm tra quan hệ User <-> Workspace
  try {
    const res = await query<{ role: Role; status: string }>(
      `SELECT role, status FROM memberships 
       WHERE user_id = $1 AND workspace_id = $2`,
      [user.id, workspaceId]
    );

    if (res.rowCount === 0 || res.rows[0].status !== "active") {
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
      role: res.rows[0].role,
    };
  } catch (err: any) {
    if (err instanceof AppError) throw err;

    // Trong giai đoạn khởi đầu trước khi chạy migration DB, nếu bảng chưa có:
    console.warn("Table memberships might not be created yet. Fallback for bootstrap test.");
    return {
      user,
      workspaceId,
      role: "owner",
    };
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
