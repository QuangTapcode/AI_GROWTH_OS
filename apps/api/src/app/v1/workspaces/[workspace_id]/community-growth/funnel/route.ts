import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import pool from "@/lib/db";
import { computeFunnel } from "@/modules/communityGrowth/funnel";

/** Phễu cộng đồng 0 → mục tiêu (mặc định 1.000) thành viên: thực tế so với kế hoạch 12 tuần. */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id);
    const funnel = await computeFunnel(pool, params.workspace_id);
    return NextResponse.json({ ok: true, funnel });
  } catch (error) {
    return handleApiError(error);
  }
}
