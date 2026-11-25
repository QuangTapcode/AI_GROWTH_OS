import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import { DailyExecutiveReportService } from "@/modules/reports/dailyExecutive";

/** 14 báo cáo ngày gần nhất đã gửi. */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id);
    const reports = await new DailyExecutiveReportService().listReports(params.workspace_id);
    return NextResponse.json({ ok: true, reports });
  } catch (error) {
    return handleApiError(error);
  }
}
