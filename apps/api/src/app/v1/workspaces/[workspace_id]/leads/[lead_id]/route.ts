import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  getWorkspaceLeadByIdApi,
  updateWorkspaceLeadApi,
} from "@/modules/leads/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string; lead_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const data = await getWorkspaceLeadByIdApi(
      user,
      params.workspace_id,
      params.lead_id
    );
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { workspace_id: string; lead_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const body = await req.json();
    const data = await updateWorkspaceLeadApi(
      user,
      params.workspace_id,
      params.lead_id,
      body
    );
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
