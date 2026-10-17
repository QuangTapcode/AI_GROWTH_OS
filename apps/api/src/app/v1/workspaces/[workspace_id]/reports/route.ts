import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { resolveTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/errors";
import { getWorkspaceReport } from "@/modules/reports/service";
import { reportQuerySchema } from "@/modules/reports/schemas";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    await resolveTenantContext(user, params.workspace_id);

    const searchParams = req.nextUrl.searchParams;
    const query = reportQuerySchema.parse({
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined,
      timezone: searchParams.get("timezone") || undefined,
      currency: searchParams.get("currency") || undefined,
    });

    const report = await getWorkspaceReport(params.workspace_id, query);
    return NextResponse.json(report);
  } catch (err) {
    return handleApiError(err);
  }
}
