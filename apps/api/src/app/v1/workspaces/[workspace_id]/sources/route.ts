import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import {
  listWorkspaceSources,
  createWorkspaceSource,
} from "@/modules/sources/service";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status") || undefined;
    const category = searchParams.get("category") || undefined;

    const data = await listWorkspaceSources(user, params.workspace_id, {
      status,
      category,
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
    const data = await createWorkspaceSource(user, params.workspace_id, body);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
