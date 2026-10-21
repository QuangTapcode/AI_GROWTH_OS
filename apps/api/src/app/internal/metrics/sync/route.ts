import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/errors";
import { syncLiveMetrics } from "@/modules/integrations/liveMetrics";

const inputSchema = z.object({
  workspace_id: z.string().uuid(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

function defaultRange(from?: string, to?: string) {
  const end = to ?? new Date().toISOString().slice(0, 10);
  const start = from ?? new Date(Date.parse(`${end}T00:00:00Z`) - 29 * 86_400_000).toISOString().slice(0, 10);
  return { from: start, to: end };
}

/** Worker-only metrics sync. It uses the same internal token as automation ticks. */
export async function POST(req: NextRequest) {
  const token = process.env.AUTOMATION_INTERNAL_TOKEN;
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token ?? ""}`);
  if (!token || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  try {
    const body = inputSchema.parse(await req.json());
    const range = defaultRange(body.from, body.to);
    return NextResponse.json(await syncLiveMetrics(body.workspace_id, range.from, range.to));
  } catch (err) {
    return handleApiError(err);
  }
}
