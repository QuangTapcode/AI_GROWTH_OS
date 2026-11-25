import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import { disconnectGoogle, googleConnectionStatus } from "@/modules/google/connection";

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner"]);
    const result = await disconnectGoogle(pool, params.workspace_id);
    return NextResponse.json({ ...result, google: await googleConnectionStatus(pool, params.workspace_id) });
  } catch (error) {
    return handleApiError(error);
  }
}
