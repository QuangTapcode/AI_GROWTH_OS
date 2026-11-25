import { AppError } from "../../lib/errors";
import { AuthUser } from "../../lib/auth";
import { resolveTenantContext, requireRole } from "../../lib/tenant";
import { updateBusinessProfileSchema } from "./schemas";
import * as repo from "./repository";
import { canServeOfflineDemo } from "../../lib/offlineDemo";

/** Hồ sơ doanh nghiệp: ngữ cảnh/brand voice mà AI dùng; mọi thành viên xem, owner/editor sửa. */
export async function getBusinessProfile(user: AuthUser, workspaceId: string) {
  try {
    await resolveTenantContext(user, workspaceId);
    const profile = await repo.getProfile(workspaceId);
    if (!profile) throw new AppError(404, "PROFILE_NOT_FOUND", "This workspace has no business profile yet");
    return profile;
  } catch (err: unknown) {
    if (!canServeOfflineDemo(err)) throw err;
    return getFallbackBusinessProfile(workspaceId, user.id);
  }
}

function getFallbackBusinessProfile(workspaceId: string, actorId: string): repo.BusinessProfileRow {
  return {
    id: `bp-${workspaceId.slice(0, 8)}`,
    workspace_id: workspaceId,
    company_name: "TripC Experience",
    website_url: "https://tripc.vn",
    industry: "Du lịch & Trải nghiệm",
    overview: "Hệ thống du lịch trải nghiệm, tour khám phá và ẩm thực Đà Nẵng",
    safety_rules: { no_competitor_mention: true, verified_citations_only: true },
    target_locations: ["Đà Nẵng", "Hội An", "Bán đảo Sơn Trà"],
    target_audiences: ["Khách du lịch tự túc", "Gia đình", "Giới trẻ khám phá"],
    products_services: ["Tour trải nghiệm", "Thuê xe máy", "Ẩm thực đặc sản"],
    brand_voice: "Thân thiện, trẻ trung, am hiểu bản địa",
    brand_guidelines: "Tập trung vào trải nghiệm thực tế, hình ảnh sắc nét, giá niêm yết rõ ràng.",
    competitors: ["Klook", "Traveloka"],
    research_strategy: null,
    version: 1,
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  };
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
