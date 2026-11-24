import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import { GoogleMapsSpecialistService } from "@/modules/gmaps/specialist";

/** Đồng bộ review từ Google Business Profile ngay (worker cũng chạy định kỳ mỗi 3 phút). */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const result = await new GoogleMapsSpecialistService().syncAndAutoReplyAllReviews(params.workspace_id);
    return NextResponse.json({ ok: result.status === "ok", result });
  } catch (error) {
    return handleApiError(error);
  }
}
