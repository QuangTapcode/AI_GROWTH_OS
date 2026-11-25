import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { AppError, handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { DriveAssetIngestionService } from "@/modules/assets/drive";
import { parseDriveFolderId } from "@/modules/google/drive";

/**
 * Saves only the Drive folder link. Unlike onboarding activation it does not switch the eight
 * merchant agents on: the folder is read when someone presses "Quét Drive ngay" or by the scheduler later.
 */
export async function PUT(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const body = (await readJsonBody(req)) as { gdrive_url?: unknown };
    const url = typeof body.gdrive_url === "string" ? body.gdrive_url.trim() : "";
    const folderId = parseDriveFolderId(url);
    if (!folderId) throw new AppError(400, "INVALID_DRIVE_FOLDER", "Link thư mục Google Drive không hợp lệ.");
    const canonical = `https://drive.google.com/drive/folders/${folderId}`;
    await pool.query(
      `INSERT INTO merchant_onboarding (workspace_id, gdrive_url) VALUES ($1::uuid, $2)
       ON CONFLICT (workspace_id) DO UPDATE SET gdrive_url = EXCLUDED.gdrive_url, updated_at = NOW()`,
      [params.workspace_id, canonical],
    );
    const connection = await new DriveAssetIngestionService().connection(params.workspace_id);
    return NextResponse.json({ gdrive_url: canonical, connection });
  } catch (error) {
    return handleApiError(error);
  }
}
