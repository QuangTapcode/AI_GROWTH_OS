import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { resolveTenantContext, requireRole } from "@/lib/tenant";
import { handleApiError } from "@/lib/errors";
import { updateWorkspaceException } from "@/modules/reports/service";
import { updateExceptionSchema } from "@/modules/reports/schemas";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { workspace_id: string; exception_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const tenantCtx = await resolveTenantContext(user, params.workspace_id);
    requireRole(tenantCtx, ["owner", "editor"]);

    const body = await req.json();
    const parsed = updateExceptionSchema.parse(body);

    const updated = await updateWorkspaceException(
      params.workspace_id,
      params.exception_id,
      parsed
    );
    return NextResponse.json(updated);
  } catch (err) {
    return handleApiError(err);
  }
}
