import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import { GoogleMapsSpecialistService } from "@/modules/gmaps/specialist";

/** Đẩy thực đơn trong hồ sơ quán lên Google Maps (ghi đè thực đơn trên Maps). Chỉ owner. */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner"]);
    const result = await new GoogleMapsSpecialistService().syncMenu(params.workspace_id);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return handleApiError(error);
  }
}
