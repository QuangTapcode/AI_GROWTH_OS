import { AppError } from "../../lib/errors";
import { AuthUser } from "../../lib/auth";
import { resolveTenantContext, requireRole } from "../../lib/tenant";
import { createCampaignSchema, CreateCampaignInput } from "./schemas";
import * as repo from "./repository";

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
  await resolveTenantContext(user, workspaceId);
  const items = await repo.listCampaigns(workspaceId);
  return { items };
}

export async function getWorkspaceCampaignDetail(
  user: AuthUser,
  workspaceId: string,
  campaignId: string
) {
  await resolveTenantContext(user, workspaceId);
  const campaign = await repo.getCampaignById(workspaceId, campaignId);
  if (!campaign) {
    throw new AppError(404, "NOT_FOUND", "Campaign not found");
  }
  return campaign;
}
