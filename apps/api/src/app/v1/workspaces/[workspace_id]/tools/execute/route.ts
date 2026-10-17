import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { resolveTenantContext } from "@/lib/tenant";
import { AppError, handleApiError } from "@/lib/errors";
import {
  authorizeToolExecution,
  globalToolAuditSink,
  type AgentRole,
  type ActionType,
} from "@/modules/integrations/gateway";
import type { IntegrationProvider } from "@/modules/integrations/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const tenantCtx = await resolveTenantContext(user, params.workspace_id);

    const body = await req.json();

    // Chặn đứng Privilege Escalation: Viewer không được mạo nhận vai trò cao hơn
    if (tenantCtx.role === "viewer" && body.actor_role && body.actor_role !== "viewer") {
      throw new AppError(403, "FORBIDDEN", "Viewer role cannot assume elevated agent roles");
    }
    if (tenantCtx.role === "editor" && body.actor_role === "owner") {
      throw new AppError(403, "FORBIDDEN", "Editor role cannot assume owner role");
    }

    const actorRole = (body.actor_role as AgentRole) || (tenantCtx.role as AgentRole);

    const authResult = await authorizeToolExecution({
      workspace_id: params.workspace_id,
      actor_id: user.id,
      caller_role: tenantCtx.role as AgentRole,
      actor_role: actorRole,
      provider: body.provider as IntegrationProvider,
      capability: body.capability,
      action_type: body.action_type as ActionType,
      params: body.params,
      approval_id: body.approval_id,
      expected_version: body.expected_version,
      expected_hash: body.expected_hash,
    });

    return NextResponse.json({
      success: true,
      audit_id: authResult.audit_id,
      status: "authorized",
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    await resolveTenantContext(user, params.workspace_id);

    const limit = Number(req.nextUrl.searchParams.get("limit") || "50");
    const logs = await globalToolAuditSink.listByWorkspace(
      params.workspace_id,
      limit
    );

    return NextResponse.json({ items: logs });
  } catch (err) {
    return handleApiError(err);
  }
}
