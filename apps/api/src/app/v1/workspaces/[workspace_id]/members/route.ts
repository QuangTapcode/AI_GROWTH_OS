import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { listWorkspaceMembers, addWorkspaceMember } from "@/modules/workspaces/service";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const data = await listWorkspaceMembers(user, params.workspace_id);
    return NextResponse.json(data);
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
    const body = await req.json();
    const data = await addWorkspaceMember(user, params.workspace_id, body);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
