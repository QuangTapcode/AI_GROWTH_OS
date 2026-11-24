import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import { ContentPlannerService } from "@/modules/planner/calendar";

const schema = z.object({ week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/** Agent 3 lập lịch tuần (giữ nguyên bài đã có, chỉ lấp slot còn trống). */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const raw = await req.text();
    const body = schema.parse(raw ? JSON.parse(raw) : {});
    const result = await new ContentPlannerService().generateWeek(params.workspace_id, body.week_start);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
