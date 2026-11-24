import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import pool from "@/lib/db";
import { ContentPlannerService, availableChannels } from "@/modules/planner/calendar";
import { loadMerchantProfile } from "@/modules/merchant/profile";

const weekSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

/** Lịch nội dung đa kênh của một tuần (mặc định tuần hiện tại) + kênh nào đang dùng được. */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id);
    const week = weekSchema.parse(req.nextUrl.searchParams.get("week") ?? undefined);
    const data = await new ContentPlannerService().listWeek(params.workspace_id, week);
    const channels = await availableChannels(pool, await loadMerchantProfile(pool, params.workspace_id));
    return NextResponse.json({ ok: true, ...data, channels });
  } catch (error) {
    return handleApiError(error);
  }
}
