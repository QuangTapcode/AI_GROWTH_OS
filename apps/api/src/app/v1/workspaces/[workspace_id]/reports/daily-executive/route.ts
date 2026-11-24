import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import { DailyExecutiveReportService, vnDate } from "@/modules/reports/dailyExecutive";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();

/**
 * GET: báo cáo ngày (đã gửi nếu có; chưa có thì lập bản xem trước từ số liệu thật, không gửi).
 * POST: lập và gửi ngay qua Telegram/ Email (worker tự gửi mỗi tối theo giờ cấu hình).
 */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id);
    const date = dateSchema.parse(req.nextUrl.searchParams.get("date") ?? undefined) ?? vnDate(new Date());
    const service = new DailyExecutiveReportService();
    const saved = await service.getReport(params.workspace_id, date);
    if (saved) return NextResponse.json({ ok: true, report: saved, preview: false });
    const built = await service.build(params.workspace_id, date, { useLlm: false });
    return NextResponse.json({
      ok: true,
      preview: true,
      report: { workspace_id: params.workspace_id, report_date: date, metrics: built.metrics, summary_markdown: built.summary, summary_source: built.source, delivery: {}, created_at: new Date().toISOString() },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const date = dateSchema.parse(req.nextUrl.searchParams.get("date") ?? undefined);
    const report = await new DailyExecutiveReportService().generateAndDeliver(params.workspace_id, date, { force: true });
    return NextResponse.json({ ok: true, report });
  } catch (error) {
    return handleApiError(error);
  }
}
