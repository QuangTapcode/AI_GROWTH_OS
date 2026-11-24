import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import { GoogleMapsSpecialistService } from "@/modules/gmaps/specialist";

/** Tổng quan uy tín Google Maps (số liệu thật đã đồng bộ) + danh sách review/ bài đăng. */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id);
    const service = new GoogleMapsSpecialistService();
    const [overview, items] = await Promise.all([service.getOverview(params.workspace_id), service.listItems(params.workspace_id)]);
    return NextResponse.json({ ok: true, overview, items });
  } catch (error) {
    return handleApiError(error);
  }
}
