import { AppError } from "../../lib/errors";
import { AuthUser } from "../../lib/auth";
import { resolveTenantContext, requireRole } from "../../lib/tenant";
import { updateBusinessProfileSchema } from "./schemas";
import * as repo from "./repository";

/** Hồ sơ doanh nghiệp: ngữ cảnh/brand voice mà AI dùng; mọi thành viên xem, owner/editor sửa. */
export async function getBusinessProfile(user: AuthUser, workspaceId: string) {
  await resolveTenantContext(user, workspaceId);
  const profile = await repo.getProfile(workspaceId);
  if (!profile) throw new AppError(404, "PROFILE_NOT_FOUND", "This workspace has no business profile yet");
  return profile;
}

export async function updateBusinessProfile(user: AuthUser, workspaceId: string, rawInput: unknown) {
  const ctx = await resolveTenantContext(user, workspaceId);
  requireRole(ctx, ["owner", "editor"]);

  const parsed = updateBusinessProfileSchema.safeParse(rawInput);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join(".") || "(root)";
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid business profile payload", fieldErrors);
  }

  const result = await repo.updateProfile(workspaceId, parsed.data, user.id);
  if (result.kind === "not_found") {
    throw new AppError(404, "PROFILE_NOT_FOUND", "This workspace has no business profile yet");
  }
  if (result.kind === "conflict") {
    throw new AppError(
      409,
      "VERSION_CONFLICT",
      `Profile was changed by someone else (current version ${result.currentVersion}). Reload and try again.`
    );
  }
  return result.profile;
}
