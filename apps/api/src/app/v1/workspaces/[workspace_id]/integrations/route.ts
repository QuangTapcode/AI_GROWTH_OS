import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { resolveTenantContext, requireRole } from "@/lib/tenant";
import { getWorkspaceConnectionStatus, socialChannelDecision } from "@/modules/integrations/stubs";
import { providerSchema } from "@/modules/integrations/types";
import { upsertConnection } from "@/modules/integrations/repository";
import { z } from "zod";

const connectionRequestSchema = z.object({
  provider: providerSchema,
  account_ref: z.string().trim().max(255).optional().nullable(),
  display_name: z.string().trim().max(255).optional().nullable(),
  scopes: z.array(z.string().trim().min(1).max(255)).max(50).default([]),
  credential_ref: z.string().trim().max(255).optional().nullable(),
  // Public API may start/revoke a connection. Only a server-side provider
  // probe is allowed to promote it to connected + verified_at.
  status: z.enum(["connecting", "revoked"]).default("connecting"),
}).strict();

/**
 * Trạng thái kết nối GA4/GSC/Meta/CMS của workspace và chế độ đăng bài từng kênh (live/manual).
 * Dựa trên integration matrix (W1-MY-06): chưa có credentials → not_connected + missing_reason.
 * Không trả secret/credential ref.
 */
export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const user = authenticateUser(req);
    await resolveTenantContext(user, params.workspace_id);
    const providers = await Promise.all(providerSchema.options.map((p) => getWorkspaceConnectionStatus(params.workspace_id, p)));
    const connected = Object.fromEntries(providers.map((p) => [p.provider, (p.status as string) === "connected"]));
    const verified = Object.fromEntries(providers.map((p) => [p.provider, p.status === "connected" && p.capabilities.some((capability) => capability.status === "connected")]));
    return NextResponse.json({
      providers,
      publishing: socialChannelDecision({ connected, verified }),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/** Start/revoke a tenant connection without accepting raw OAuth tokens. */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const user = authenticateUser(req);
    const context = await resolveTenantContext(user, params.workspace_id);
    requireRole(context, ["owner"]);
    const body = connectionRequestSchema.parse(await req.json());
    const connection = await upsertConnection({
      workspaceId: params.workspace_id,
      provider: body.provider,
      accountRef: body.account_ref,
      displayName: body.display_name,
      scopes: body.scopes,
      credentialRef: body.credential_ref,
      status: body.status,
      verifiedAt: null,
    });
    return NextResponse.json({
      id: connection.id,
      provider: connection.provider,
      account_ref: connection.account_ref,
      display_name: connection.display_name,
      status: connection.status,
      scopes: connection.scopes,
      verified_at: connection.verified_at,
    }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
