import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { revokeWorkspaceMember } from "@/modules/workspaces/service";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { workspace_id: string; user_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const data = await revokeWorkspaceMember(user, params.workspace_id, params.user_id);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
