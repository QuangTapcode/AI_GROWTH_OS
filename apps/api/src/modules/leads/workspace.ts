import { AppError } from "@/lib/errors";
import { AuthUser } from "@/lib/auth";
import { resolveTenantContext, requireRole } from "@/lib/tenant";
import {
  listLeadsQuerySchema,
  updateLeadBodySchema,
} from "./schemas";
import { globalLeadRepo } from "@/lib/public-service";
import { LeadRepository } from "./repository";

/**
 * Workspace Leads Service (TQ-05: Persistence & Phân quyền Sales Handoff)
 */

export async function listWorkspaceLeadsApi(
  user: AuthUser,
  workspaceId: string,
  rawQuery: Record<string, any>,
  repo: LeadRepository = globalLeadRepo
) {
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor", "viewer"]);

  const parseResult = listLeadsQuerySchema.safeParse(rawQuery);
  if (!parseResult.success) {
    throw new AppError(422, "VALIDATION_FAILED", "Invalid query parameters");
  }

  return repo.listByWorkspace(workspaceId, parseResult.data);
}

export async function getWorkspaceLeadByIdApi(
  user: AuthUser,
  workspaceId: string,
  leadId: string,
  repo: LeadRepository = globalLeadRepo
) {
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor", "viewer"]);

  const lead = await repo.findById(leadId, workspaceId);
  if (!lead) {
    throw new AppError(404, "NOT_FOUND", "Lead not found in this workspace");
  }

  return lead;
}

export async function updateWorkspaceLeadApi(
  user: AuthUser,
  workspaceId: string,
  leadId: string,
  rawInput: unknown,
  repo: LeadRepository = globalLeadRepo
) {
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor"]);

  const parseResult = updateLeadBodySchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid lead update payload", fieldErrors);
  }

  const updated = await repo.updateLead(workspaceId, leadId, parseResult.data);
  if (!updated) {
    throw new AppError(404, "NOT_FOUND", "Lead not found in this workspace");
  }

  return updated;
}
