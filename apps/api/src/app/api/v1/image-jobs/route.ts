import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { createImageJobService } from "@/modules/imageJobs/service";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json().catch(() => ({}));
    const result = await createImageJobService(req, rawBody);
    return NextResponse.json(result.data, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

