import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { persistSourceRagData, getSourceRagData } from "@/modules/sources/rag";

export async function POST(
  req: NextRequest,
  { params }: { params: { workspace_id: string; source_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const body = await req.json();
    const result = await persistSourceRagData(
      user,
      params.workspace_id,
      params.source_id,
      body
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string; source_id: string } }
) {
  try {
    const user = authenticateUser(req);
    const result = await getSourceRagData(
      user,
      params.workspace_id,
      params.source_id
    );
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
