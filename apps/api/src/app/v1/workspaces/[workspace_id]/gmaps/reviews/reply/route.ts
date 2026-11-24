import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { GoogleMapsSpecialistService } from "@/modules/gmaps/specialist";

const schema = z.object({
  review_id: z.string().uuid(),
  // bỏ trống = đăng đúng bản nháp AI đã soạn
  reply_text: z.string().trim().min(2).max(4000).optional(),
});

/** Chủ quán / biên tập viên duyệt và đăng trả lời review lên Google. */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const body = schema.parse(await readJsonBody(req));
    const item = await new GoogleMapsSpecialistService().replyToReview(params.workspace_id, body.review_id, body.reply_text);
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    return handleApiError(error);
  }
}
