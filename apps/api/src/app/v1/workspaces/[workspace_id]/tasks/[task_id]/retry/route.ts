import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { retryWorkspaceTask } from "@/modules/tasks/service";

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string; task_id: string } }) {
  try {
    const user = authenticateUser(req);
    return NextResponse.json(await retryWorkspaceTask(user, params.workspace_id, params.task_id));
  } catch (err) {
    return handleApiError(err);
  }
}
