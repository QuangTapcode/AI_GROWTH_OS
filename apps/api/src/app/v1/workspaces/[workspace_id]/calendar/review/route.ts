import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { ContentPlannerService } from "@/modules/planner/calendar";

const schema = z.object({ entry_ids: z.array(z.string().uuid()).min(1).max(100), decision: z.enum(["approve", "reject"]) });

/** Duyệt/ từ chối hàng loạt bài trong lịch. Chỉ bài đã duyệt mới được Agent 4 đăng. */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const body = schema.parse(await readJsonBody(req));
    const entries = await new ContentPlannerService().review(params.workspace_id, body.entry_ids, body.decision, tenant.user.id);
    return NextResponse.json({ ok: true, entries });
  } catch (error) {
    return handleApiError(error);
  }
}
