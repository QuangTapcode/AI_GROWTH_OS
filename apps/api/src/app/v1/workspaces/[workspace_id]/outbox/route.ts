import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { resolveTenantContext, requireRole } from "@/lib/tenant";
import { handleApiError } from "@/lib/errors";
import {
  recordOutboxEvent,
  processPendingOutboxEvents,
  listWorkspaceOutboxEvents,
} from "@/modules/reports/service";
import { outboxEventSchema } from "@/modules/reports/schemas";

export async function POST(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const tenantCtx = await resolveTenantContext(user, params.workspace_id);
    requireRole(tenantCtx, ["owner", "editor"]);

    const body = await req.json();

    // Hỗ trợ dispatch action: POST với body { "action": "dispatch" }
    if (body && (body.action === "dispatch" || body.action === "process")) {
      const result = await processPendingOutboxEvents(params.workspace_id);
      return NextResponse.json(result);
    }

    const parsed = outboxEventSchema.parse(body);

    const result = await recordOutboxEvent(params.workspace_id, parsed);
    return NextResponse.json(result, { status: result.deduplicated ? 200 : 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * GET /v1/workspaces/{workspace_id}/outbox
 * Safe & Idempotent (RFC 9110): Chỉ đọc danh sách outbox events, không làm thay đổi trạng thái.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const tenantCtx = await resolveTenantContext(user, params.workspace_id);
    requireRole(tenantCtx, ["owner", "editor", "viewer"]);

    const status = req.nextUrl.searchParams.get("status") || undefined;
    const items = await listWorkspaceOutboxEvents(params.workspace_id, status);
    return NextResponse.json({ items });
  } catch (err) {
    return handleApiError(err);
  }
}
