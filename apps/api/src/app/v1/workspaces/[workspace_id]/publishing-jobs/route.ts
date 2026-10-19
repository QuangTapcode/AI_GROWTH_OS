import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { listPublishingJobs, schedulePublishing } from "@/modules/distribution/service";

export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const user = authenticateUser(req);
    return NextResponse.json(await listPublishingJobs(user, params.workspace_id));
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const user = authenticateUser(req);
    const body = await req.json().catch(() => null);
    return NextResponse.json(await schedulePublishing(user, params.workspace_id, body), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
