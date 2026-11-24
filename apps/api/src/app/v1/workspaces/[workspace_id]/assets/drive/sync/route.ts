import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import { DriveAssetIngestionService } from "@/modules/assets/drive";

/** Quét thư mục Drive ngay (worker cũng quét tự động mỗi 20 phút). */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const result = await new DriveAssetIngestionService().scanDrive(params.workspace_id);
    return NextResponse.json({ ok: result.status === "ok", result });
  } catch (error) {
    return handleApiError(error);
  }
}
