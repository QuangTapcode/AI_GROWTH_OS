import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { resolveTenantContext, requireRole } from "@/lib/tenant";
import { handleApiError } from "@/lib/errors";
import {
  recordOutboxEvent,
  processPendingOutboxEvents,
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
    const parsed = outboxEventSchema.parse(body);

    const result = await recordOutboxEvent(params.workspace_id, parsed);
    return NextResponse.json(result, { status: result.deduplicated ? 200 : 201 });
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
    const tenantCtx = await resolveTenantContext(user, params.workspace_id);
    requireRole(tenantCtx, ["owner", "editor"]);

    const result = await processPendingOutboxEvents(params.workspace_id);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
