import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { GoogleMapsSpecialistService } from "@/modules/gmaps/specialist";

const schema = z.object({ asset_id: z.string().uuid() });

/** Thêm ảnh món/ không gian (đã watermark) từ thư viện Drive vào hồ sơ Google Maps. */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const { asset_id } = schema.parse(await readJsonBody(req));
    const result = await new GoogleMapsSpecialistService().publishPhoto(params.workspace_id, asset_id);
    return NextResponse.json({ ok: true, result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
