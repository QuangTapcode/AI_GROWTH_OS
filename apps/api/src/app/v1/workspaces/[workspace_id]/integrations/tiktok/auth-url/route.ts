import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { requireRole, resolveTenantContext } from "@/lib/tenant";
import { buildTikTokAuthorizeUrl } from "@/modules/integrations/tiktok";

export async function GET(
  req: NextRequest,
  { params }: { params: { workspace_id: string } },
) {
  try {
    const user = authenticateUser(req);
    const ctx = await resolveTenantContext(user, params.workspace_id);
    requireRole(ctx, ["owner", "editor"]);

    const returnTo = req.nextUrl.searchParams.get("return_to");
    const webOrigin =
      req.nextUrl.searchParams.get("origin") || req.headers.get("origin") || null;

    const auth = buildTikTokAuthorizeUrl({
      workspaceId: params.workspace_id,
      userId: user.id,
      returnTo,
      webOrigin,
    });

    return NextResponse.json({
      url: auth.url,
      redirect_uri: auth.redirect_uri,
      scopes: auth.scopes,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

