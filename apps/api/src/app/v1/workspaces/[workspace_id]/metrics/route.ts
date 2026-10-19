import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { getMetricSeries, recordMetricSnapshotForWorkspace } from "@/modules/metrics/service";

export async function GET(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const user = authenticateUser(req);
    const sp = req.nextUrl.searchParams;
    return NextResponse.json(
      await getMetricSeries(user, params.workspace_id, {
        metric: sp.get("metric") ?? undefined,
        from: sp.get("from") ?? undefined,
        to: sp.get("to") ?? undefined,
      })
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: { workspace_id: string } }) {
  try {
    const user = authenticateUser(req);
    const body = await req.json().catch(() => null);
    return NextResponse.json(await recordMetricSnapshotForWorkspace(user, params.workspace_id, body), { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
