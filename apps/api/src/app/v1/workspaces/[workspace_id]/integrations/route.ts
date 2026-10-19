import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { resolveTenantContext } from "@/lib/tenant";
import { getConnectionStatus, socialChannelDecision } from "@/modules/integrations/stubs";
import { providerSchema } from "@/modules/integrations/types";

/**
 * Trạng thái kết nối GA4/GSC/Meta/CMS của workspace và chế độ đăng bài từng kênh (live/manual).
 * Dựa trên integration matrix (W1-MY-06): chưa có credentials → not_connected + missing_reason.
 * Không trả secret/credential ref.
 */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const user = authenticateUser(req);
    await resolveTenantContext(user, params.workspace_id);
    const providers = providerSchema.options.map((p) => getConnectionStatus(params.workspace_id, p));
    const connected = Object.fromEntries(providers.map((p) => [p.provider, (p.status as string) === "connected"]));
    return NextResponse.json({
      providers,
      publishing: socialChannelDecision({ connected, verified: {} }),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
