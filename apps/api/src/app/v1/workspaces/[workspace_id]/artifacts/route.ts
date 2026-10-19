import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  listWorkspaceArtifacts,
  createWorkspaceArtifact,
} from "@/modules/tasks/service";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const searchParams = req.nextUrl.searchParams;
    const role = searchParams.get("role") || undefined;
    const artifact_type = searchParams.get("artifact_type") || undefined;

    const data = await listWorkspaceArtifacts(user, params.workspace_id, {
      role,
      artifact_type,
    });
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
    const data = await createWorkspaceArtifact(user, params.workspace_id, body);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
