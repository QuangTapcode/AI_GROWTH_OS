import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { ZeroTechOnboardingService } from "@/modules/onboarding/onboarding";

/** Hồ sơ vận hành quán (giờ mở cửa, thực đơn & giá, FAQ, cọc, từ khóa SEO, kênh báo cáo). Owner/ editor. */
export async function PUT(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const state = await new ZeroTechOnboardingService().updateSettings(params.workspace_id, await readJsonBody(req));
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return handleApiError(error);
  }
}
