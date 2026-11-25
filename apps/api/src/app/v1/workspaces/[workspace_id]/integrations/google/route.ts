import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import { googleConnectionStatus } from "@/modules/google/connection";

/** Which Google account this workspace uses for Drive and Business Profile (never the token itself). */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id);
    return NextResponse.json({ google: await googleConnectionStatus(pool, params.workspace_id) });
  } catch (error) {
    return handleApiError(error);
  }
}
