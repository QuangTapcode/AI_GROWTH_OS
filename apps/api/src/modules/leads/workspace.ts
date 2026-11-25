import { AppError } from "@/lib/errors";
import { AuthUser } from "@/lib/auth";
import { resolveTenantContext, requireRole } from "@/lib/tenant";
import {
  listLeadsQuerySchema,
  updateLeadBodySchema,
} from "./schemas";
import { globalLeadRepo } from "@/lib/public-service";
import { LeadRepository } from "./repository";
import { canServeOfflineDemo } from "../../lib/offlineDemo";

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

  try {
    return await repo.listByWorkspace(workspaceId, parseResult.data);
  } catch (offlineErr: unknown) {
    if (!canServeOfflineDemo(offlineErr)) throw offlineErr;
    return {
      items: [
        {
          id: "lead-dn-1",
          workspace_id: workspaceId,
          full_name: "Hoàng Minh Trí",
          email: "minhtri.travel@gmail.com",
          phone: "0905123456",
          interest_topic: "Tour Bán đảo Sơn Trà & Thuê xe máy",
          lead_status: "New",
          notes: "Khách hỏi đặt tour 3 người vào cuối tuần",
          created_at: new Date(Date.now() - 3600000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "lead-dn-2",
          workspace_id: workspaceId,
          full_name: "Lê Thu Hà",
          email: "thuha.danang@gmail.com",
          phone: "0912987654",
          interest_topic: "Khách sạn gần biển Mỹ Khê",
          lead_status: "Contacted",
          notes: "Đã tư vấn qua Zalo, hẹn chốt lịch",
          created_at: new Date(Date.now() - 7200000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "lead-dn-3",
          workspace_id: workspaceId,
          full_name: "Trần Anh Khoa",
          email: "khoa.tran@outlook.com",
          phone: "0934567890",
          interest_topic: "Ẩm thực & Hải sản Đà Nẵng",
          lead_status: "Converted",
          notes: "Đã book bàn tiệc gia đình 6 người",
          created_at: new Date(Date.now() - 14400000).toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      total: 3,
    };
  }
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
