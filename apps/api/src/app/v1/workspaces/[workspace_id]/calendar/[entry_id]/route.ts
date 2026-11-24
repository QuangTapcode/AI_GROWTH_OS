import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { ContentPlannerService } from "@/modules/planner/calendar";

const schema = z
  .object({
    caption: z.string().trim().min(5).max(2200).optional(),
    hashtags: z.array(z.string().trim().min(2).max(60)).max(10).optional(),
    scheduled_at: z.string().datetime({ offset: true }).optional(),
    call_to_action: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

/** Sửa nội dung/ giờ đăng; bài đã duyệt sẽ quay về bản nháp để duyệt lại đúng nội dung mới. */
export async function PATCH(req: NextRequest, { params }: { params: { workspace_id: string; entry_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const entry = await new ContentPlannerService().updateEntry(params.workspace_id, params.entry_id, schema.parse(await readJsonBody(req)));
    return NextResponse.json({ ok: true, entry });
  } catch (error) {
    return handleApiError(error);
  }
}
