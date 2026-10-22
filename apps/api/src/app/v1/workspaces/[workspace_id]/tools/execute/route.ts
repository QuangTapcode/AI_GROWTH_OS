import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticateUser, type AuthUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { resolveTenantContext } from "@/lib/tenant";
import { AppError, handleApiError } from "@/lib/errors";
import {
  authorizeToolExecution,
  globalToolAuditSink,
  executeToolSchema,
  type AgentRole,
  type ActionType,
} from "@/modules/integrations/gateway";
import type { IntegrationProvider } from "@/modules/integrations/types";

/**
 * Server-to-server worker calls cannot use the browser's short-lived session
 * token. The internal automation token is accepted only for this route, is
 * checked against the configured workspace owner, and never exposed to the
 * browser or included in audit params.
 */
async function authenticateAutomationCaller(
  req: NextRequest,
  workspaceId: string,
): Promise<AuthUser | null> {
  const configured = process.env.AUTOMATION_INTERNAL_TOKEN ?? "";
  const supplied = req.headers.get("x-automation-token") ?? "";
  if (!configured || !supplied) return null;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  const row = (await query<{ id: string; email: string; full_name: string }>(
    `SELECT u.id,u.email,u.full_name
       FROM agent_automation aa
       JOIN users u ON u.id=aa.actor_id
       JOIN memberships m ON m.workspace_id=aa.workspace_id AND m.user_id=aa.actor_id
      WHERE aa.workspace_id=$1 AND m.role='owner' AND m.status='active'`,
    [workspaceId],
  )).rows[0];
  if (!row) throw new AppError(403, "FORBIDDEN", "Automation owner is not active");
  return { id: row.id, email: row.email, name: row.full_name };
}

export async function POST(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const automationUser = await authenticateAutomationCaller(req, params.workspace_id);
    const user = automationUser ?? authenticateUser(req);
    const tenantCtx = automationUser
      ? { user, workspaceId: params.workspace_id, role: "owner" as const }
      : await resolveTenantContext(user, params.workspace_id);

    const body = await req.json();
    const parseResult = executeToolSchema.safeParse(body);
    if (!parseResult.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parseResult.error.issues) {
        const field = issue.path.join(".") || "(root)";
        fieldErrors[field] = fieldErrors[field] || [];
        fieldErrors[field].push(issue.message);
      }
      throw new AppError(422, "VALIDATION_FAILED", "Invalid tool execution payload", fieldErrors);
    }
    const input = parseResult.data;

    // Chặn đứng Privilege Escalation: Viewer không được mạo nhận vai trò cao hơn
    if (tenantCtx.role === "viewer" && input.actor_role && input.actor_role !== "viewer") {
      throw new AppError(403, "FORBIDDEN", "Viewer role cannot assume elevated agent roles");
    }
    if (tenantCtx.role === "editor" && input.actor_role === "owner") {
      throw new AppError(403, "FORBIDDEN", "Editor role cannot assume owner role");
    }

    const actorRole = (input.actor_role as AgentRole) || (tenantCtx.role as AgentRole);

    const authResult = await authorizeToolExecution({
      workspace_id: params.workspace_id,
      actor_id: user.id,
      caller_role: tenantCtx.role as AgentRole,
      actor_role: actorRole,
      provider: input.provider as IntegrationProvider,
      capability: input.capability,
      action_type: input.action_type as ActionType,
      params: input.params,
      approval_id: input.approval_id,
      expected_version: input.expected_version,
      expected_hash: input.expected_hash,
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

    const limitParam = req.nextUrl.searchParams.get("limit");
    let limit = 50;
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 100);
      }
    }
    const logs = await globalToolAuditSink.listByWorkspace(
      params.workspace_id,
      limit
    );

    return NextResponse.json({ items: logs });
  } catch (err) {
    return handleApiError(err);
  }
}
