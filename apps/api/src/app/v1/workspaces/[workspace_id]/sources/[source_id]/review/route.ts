import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { reviewWorkspaceSource } from "@/modules/sources/service";

export async function POST(
  req: NextRequest,
  { params }: { params: { workspace_id: string; source_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const body = await req.json();
    const data = await reviewWorkspaceSource(
      user,
      params.workspace_id,
      params.source_id,
      body
    );
    return NextResponse.json(data);
  } catch (err) {
    return handleApiError(err);
  }
}
