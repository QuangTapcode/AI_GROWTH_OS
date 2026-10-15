import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getWorkspaceApprovalDetail } from "@/modules/approvals/service";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string; approval_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const data = await getWorkspaceApprovalDetail(user, params.workspace_id, params.approval_id);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
