import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { readJsonBody, requireWorkspaceRole } from "@/lib/workspaceRoute";
import { GoogleMapsSpecialistService } from "@/modules/gmaps/specialist";

const schema = z.object({ call_to_action: z.enum(["BOOK", "ORDER", "LEARN_MORE", "CALL"]).optional() });

/** Duyệt và đăng bản nháp Local Post lên Google Maps. */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string; post_id: string } }) {
  try {
    await requireWorkspaceRole(req, params.workspace_id, ["owner", "editor"]);
    const raw = await req.text();
    const body = schema.parse(raw ? JSON.parse(raw) : {});
    const post = await new GoogleMapsSpecialistService().publishLocalPost(params.workspace_id, params.post_id, body.call_to_action);
    return NextResponse.json({ ok: true, post });
  } catch (error) {
    return handleApiError(error);
  }
}
