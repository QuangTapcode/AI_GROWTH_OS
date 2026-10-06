import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { listUserWorkspaces, createWorkspace } from "@/modules/workspaces/service";

export async function GET(req: NextRequest) {
  try {
    const user = authenticateUser(req);
    const data = await listUserWorkspaces(user);
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = authenticateUser(req);
    const body = await req.json();
    const data = await createWorkspace(user, body);
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
