import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { BookingLeadService } from "@/modules/booking/leads";

const querySchema = z.object({
  status: z.enum(["pending", "confirmed", "cancelled", "completed", "no_show"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** Danh sách đặt bàn thật (Agent 7 chốt qua tin nhắn + nhân viên nhập tay). */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id);
    const q = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    const data = await new BookingLeadService().listLeads(params.workspace_id, q);
    return NextResponse.json({ ok: true, leads: data.items, summary: data.summary });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Nhân viên nhập đặt bàn nhận qua điện thoại/ khách vãng lai. */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const lead = await new BookingLeadService().createLead(params.workspace_id, await readJsonBody(req));
    return NextResponse.json({ ok: true, lead }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
