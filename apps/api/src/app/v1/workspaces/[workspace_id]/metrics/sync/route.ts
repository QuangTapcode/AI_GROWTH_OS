import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { resolveTenantContext, requireRole } from "@/lib/tenant";
import { syncLiveMetrics } from "@/modules/integrations/liveMetrics";

const inputSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

function defaultRange(from?: string, to?: string) {
  const end = to ?? new Date().toISOString().slice(0, 10);
  const start = from ?? new Date(Date.parse(`${end}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  return { from: start, to: end };
}

/** Pulls real provider data and persists daily metric snapshots. */
export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const user = authenticateUser(req);
    const context = await resolveTenantContext(user, params.workspace_id);
    requireRole(context, ["owner", "editor"]);
    const body = inputSchema.parse(await req.json().catch(() => ({})));
    const range = defaultRange(body.from, body.to);
    return NextResponse.json(await syncLiveMetrics(params.workspace_id, range.from, range.to));
  } catch (err) {
    return handleApiError(err);
  }
}
