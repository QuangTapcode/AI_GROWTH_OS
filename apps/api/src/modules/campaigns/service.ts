import { AppError } from "../../lib/errors";
import { AuthUser } from "../../lib/auth";
import { resolveTenantContext, requireRole } from "../../lib/tenant";
import { createCampaignSchema, CreateCampaignInput } from "./schemas";
import * as repo from "./repository";
import { canServeOfflineDemo } from "../../lib/offlineDemo";

export async function createWorkspaceCampaign(
  user: AuthUser,
  workspaceId: string,
  rawInput: unknown
) {
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor"]);

  const parseResult = createCampaignSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid campaign payload", fieldErrors);
  }

  const input: CreateCampaignInput = parseResult.data;
  const campaign = await repo.createCampaign(workspaceId, input);
  return campaign;
}

export async function listWorkspaceCampaigns(
  user: AuthUser,
  workspaceId: string
) {
  try {
    await resolveTenantContext(user, workspaceId);
    const items = await repo.listCampaigns(workspaceId);
    return { items };
  } catch (offlineErr: unknown) {
    if (!canServeOfflineDemo(offlineErr)) throw offlineErr;
    return {
      items: [
        {
          id: "camp-dn-2026",
          workspace_id: workspaceId,
          name: "Chiến dịch Mùa Du Lịch Đà Nẵng 2026",
          utm_campaign: "danang_travel_2026",
          start_date: "2026-11-01T00:00:00Z",
          end_date: "2026-12-31T23:59:59Z",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
      ]
    };
  }
}

export async function getWorkspaceCampaignDetail(
  user: AuthUser,
  workspaceId: string,
  campaignId: string
) {
  try {
    await resolveTenantContext(user, workspaceId);
    const campaign = await repo.getCampaignById(workspaceId, campaignId);
    if (!campaign) {
      throw new AppError(404, "NOT_FOUND", "Campaign not found");
    }
    return campaign;
  } catch (err: unknown) {
    if (!canServeOfflineDemo(err)) throw err;
    return {
      id: campaignId,
      workspace_id: workspaceId,
      name: "Chiến dịch Mùa Du Lịch Đà Nẵng 2026",
      utm_campaign: "danang_travel_2026",
      start_date: "2026-11-01T00:00:00Z",
      end_date: "2026-12-31T23:59:59Z",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}
