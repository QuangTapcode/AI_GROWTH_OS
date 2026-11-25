import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { ZeroTechOnboardingService } from "@/modules/onboarding/onboarding";

/** Trạng thái kết nối 4 link + tình trạng thật của 8 agent. */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id);
    const state = await new ZeroTechOnboardingService().getStatus(params.workspace_id);
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Kích hoạt: kiểm tra 4 link, lưu, xếp lịch cho 8 agent chạy ngay. Chỉ owner. */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner"]);
    const state = await new ZeroTechOnboardingService().activate(params.workspace_id, await readJsonBody(req));
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    return handleApiError(error);
  }
}
