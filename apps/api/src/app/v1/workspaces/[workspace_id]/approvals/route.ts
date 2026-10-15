import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  listWorkspaceApprovals,
  createWorkspaceApproval,
} from "@/modules/approvals/service";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const searchParams = req.nextUrl.searchParams;
    const target_type = searchParams.get("target_type") || undefined;
    const status = searchParams.get("status") || undefined;

    const data = await listWorkspaceApprovals(user, params.workspace_id, {
      target_type,
      status,
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
    const data = await createWorkspaceApproval(user, params.workspace_id, body);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
