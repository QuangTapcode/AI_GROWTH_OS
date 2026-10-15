import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  listWorkspaceTasks,
  createWorkspaceTask,
} from "@/modules/tasks/service";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const searchParams = req.nextUrl.searchParams;
    const role = searchParams.get("role") || undefined;
    const status = searchParams.get("status") || undefined;
    const campaign_id = searchParams.get("campaign_id") || undefined;

    const data = await listWorkspaceTasks(user, params.workspace_id, {
      role,
      status,
      campaign_id,
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
    const data = await createWorkspaceTask(user, params.workspace_id, body);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
