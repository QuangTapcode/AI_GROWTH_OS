import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import { DriveAssetIngestionService } from "@/modules/assets/drive";

const statusSchema = z.enum(["pending_analysis", "staged", "rejected", "scheduled", "published", "archived"]).optional();

/** Thư viện ảnh thật lấy từ Google Drive của quán (đã/ đang được AI phân tích). */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id);
    const status = statusSchema.parse(req.nextUrl.searchParams.get("status") ?? undefined);
    const service = new DriveAssetIngestionService();
    const [assets, connection] = await Promise.all([service.listAssets(params.workspace_id, status), service.connection(params.workspace_id)]);
    return NextResponse.json({ ok: true, assets, connection });
  } catch (error) {
    return handleApiError(error);
  }
}
