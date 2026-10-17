import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { resolveTenantContext, requireRole } from "@/lib/tenant";
import { handleApiError } from "@/lib/errors";
import {
  listWorkspaceExceptions,
  createWorkspaceException,
} from "@/modules/reports/service";
import {
  createExceptionSchema,
  listExceptionsQuerySchema,
} from "@/modules/reports/schemas";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    await resolveTenantContext(user, params.workspace_id);

    const searchParams = req.nextUrl.searchParams;
    const query = listExceptionsQuerySchema.parse({
      status: searchParams.get("status") || undefined,
      severity: searchParams.get("severity") || undefined,
      assigned_owner: searchParams.get("assigned_owner") || undefined,
      limit: searchParams.get("limit") || undefined,
    });

    const data = await listWorkspaceExceptions(params.workspace_id, query);
    return NextResponse.json({ items: data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const tenantCtx = await resolveTenantContext(user, params.workspace_id);
    requireRole(tenantCtx, ["owner", "editor"]);

    const body = await req.json();
    const parsed = createExceptionSchema.parse(body);

    const created = await createWorkspaceException(params.workspace_id, parsed);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
