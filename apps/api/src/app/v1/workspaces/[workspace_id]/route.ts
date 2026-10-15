import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getWorkspaceDetail } from "@/modules/workspaces/service";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const data = await getWorkspaceDetail(user, params.workspace_id);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
