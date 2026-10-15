import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  getWorkspaceTaskDetail,
  updateWorkspaceTaskStatus,
} from "@/modules/tasks/service";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string; task_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const data = await getWorkspaceTaskDetail(user, params.workspace_id, params.task_id);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { workspace_id: string; task_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const body = await req.json();
    const data = await updateWorkspaceTaskStatus(user, params.workspace_id, params.task_id, body);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
