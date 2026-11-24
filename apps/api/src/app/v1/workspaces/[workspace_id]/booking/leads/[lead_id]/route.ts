import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { BookingLeadService } from "@/modules/booking/leads";

/** Xác nhận/ hủy/ đổi giờ đặt bàn; khách nhận tin báo lại qua kênh đã đặt (notify_customer mặc định true). */
export async function PATCH(req: NextRequest, { params }: { params: { workspace_id: string; lead_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const lead = await new BookingLeadService().updateLead(params.workspace_id, params.lead_id, await readJsonBody(req));
    return NextResponse.json({ ok: true, lead });
  } catch (error) {
    return handleApiError(error);
  }
}
