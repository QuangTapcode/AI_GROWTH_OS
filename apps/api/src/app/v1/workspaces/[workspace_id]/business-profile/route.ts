import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getBusinessProfile, updateBusinessProfile } from "@/modules/businessProfile/service";

export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const user = authenticateUser(req);
    return NextResponse.json(await getBusinessProfile(user, params.workspace_id));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const user = authenticateUser(req);
    const body = await req.json().catch(() => null);
    return NextResponse.json(await updateBusinessProfile(user, params.workspace_id, body));
  } catch (err) {
    return handleApiError(err);
  }
}
