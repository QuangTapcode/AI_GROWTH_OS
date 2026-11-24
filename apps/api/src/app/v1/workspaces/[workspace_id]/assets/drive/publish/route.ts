import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { ContentPlannerService } from "@/modules/planner/calendar";

const schema = z.object({
  asset_id: z.string().uuid(),
  channels: z.array(z.enum(["facebook", "instagram", "google_maps", "facebook_group"])).min(1).max(4).default(["facebook"]),
});

/** Đưa ảnh vào khung giờ vàng gần nhất của từng kênh (bản nháp trong lịch, chờ duyệt rồi Agent 4 đăng). */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const body = schema.parse(await readJsonBody(req));
    const entries = await new ContentPlannerService().scheduleAsset(params.workspace_id, body.asset_id, body.channels);
    return NextResponse.json({ ok: true, entries }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
