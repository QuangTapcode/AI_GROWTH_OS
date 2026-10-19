import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { listWorkspaceLeadsApi } from "@/modules/leads/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const searchParams = req.nextUrl.searchParams;
    const query: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      query[key] = val;
    });

    const data = await listWorkspaceLeadsApi(user, params.workspace_id, query);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
