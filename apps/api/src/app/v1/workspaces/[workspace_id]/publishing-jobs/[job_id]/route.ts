import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { updatePublishingJob } from "@/modules/distribution/service";

export async function PATCH(req: NextRequest, { params }: { params: { workspace_id: string; job_id: string } }) {
  try {
    const user = authenticateUser(req);
    const body = await req.json().catch(() => null);
    return NextResponse.json(await updatePublishingJob(user, params.workspace_id, params.job_id, body));
  } catch (err) {
    return handleApiError(err);
  }
}
