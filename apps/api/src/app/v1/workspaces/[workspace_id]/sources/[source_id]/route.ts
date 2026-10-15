import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  getWorkspaceSourceDetail,
  deleteWorkspaceSource,
} from "@/modules/sources/service";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string; source_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const data = await getWorkspaceSourceDetail(
      user,
      params.workspace_id,
      params.source_id
    );
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { workspace_id: string; source_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const data = await deleteWorkspaceSource(
      user,
      params.workspace_id,
      params.source_id
    );
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
