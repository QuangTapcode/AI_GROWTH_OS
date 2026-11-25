import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { requireWorkspaceRole } from "@/lib/workspaceRoute";
import { buildGoogleAuthorizeUrl } from "@/modules/google/connection";

/** Google consent URL for the owner; the signed state brings them back to `return_to` on this site. */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const tenant = await requireWorkspaceRole(req, params.workspace_id, ["owner"]);
    const auth = buildGoogleAuthorizeUrl({
      workspaceId: params.workspace_id,
      userId: tenant.user.id,
      returnTo: req.nextUrl.searchParams.get("return_to"),
      webOrigin: req.nextUrl.searchParams.get("origin") || req.headers.get("origin"),
    });
    return NextResponse.json(auth);
  } catch (error) {
    return handleApiError(error);
  }
}
