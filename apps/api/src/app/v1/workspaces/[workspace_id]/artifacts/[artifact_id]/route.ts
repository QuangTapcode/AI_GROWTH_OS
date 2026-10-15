import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getWorkspaceArtifactDetail } from "@/modules/tasks/service";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string; artifact_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const data = await getWorkspaceArtifactDetail(user, params.workspace_id, params.artifact_id);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
