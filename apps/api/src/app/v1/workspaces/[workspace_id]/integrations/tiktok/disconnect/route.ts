import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { requireRole, resolveTenantContext } from "@/lib/tenant";
import { disconnectTikTok } from "@/modules/integrations/tiktok";

export async function POST(
  req: NextRequest,
  { params }: { params: { workspace_id: string } },
) {
  try {
    const user = authenticateUser(req);
    const ctx = await resolveTenantContext(user, params.workspace_id);
    requireRole(ctx, ["owner", "editor"]);

    const result = await disconnectTikTok(user.id, params.workspace_id);
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}

