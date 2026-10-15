import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { reviewWorkspaceApproval } from "@/modules/approvals/service";

export async function POST(
  req: NextRequest,
  { params }: { params: { workspace_id: string; approval_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const body = await req.json();
    const data = await reviewWorkspaceApproval(
      user,
      params.workspace_id,
      params.approval_id,
      body
    );
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
