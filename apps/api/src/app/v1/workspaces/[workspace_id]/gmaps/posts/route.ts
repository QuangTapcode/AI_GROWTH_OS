import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { GoogleMapsSpecialistService } from "@/modules/gmaps/specialist";

export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id);
    const posts = await new GoogleMapsSpecialistService().listItems(params.workspace_id, "local_post");
    return NextResponse.json({ ok: true, posts });
  } catch (error) {
    return handleApiError(error);
  }
}

const schema = z
  .object({
    asset_id: z.string().uuid().optional(),
    content: z.string().trim().min(10).max(1500).optional(),
    publish_now: z.boolean().optional(),
    call_to_action: z.enum(["BOOK", "ORDER", "LEARN_MORE", "CALL"]).optional(),
  })
  .refine((v) => v.asset_id || v.content, { message: "content or asset_id is required" });

/**
 * Tạo Local Post: có content → dùng nội dung đó; chỉ có asset_id → AI viết từ ảnh món thật.
 * Mặc định là bản nháp; publish_now=true (người dùng bấm "Đăng") thì đăng lên Google ngay.
 */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const body = schema.parse(await readJsonBody(req));
    const service = new GoogleMapsSpecialistService();
    let post = body.content
      ? await service.createDraftLocalPost(params.workspace_id, body.content, body.asset_id)
      : await service.draftLocalPostFromAsset(params.workspace_id, body.asset_id!);
    if (body.publish_now) post = await service.publishLocalPost(params.workspace_id, post.id, body.call_to_action);
    return NextResponse.json({ ok: true, post }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
