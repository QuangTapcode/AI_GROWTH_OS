import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { cancelImageJobService } from "@/modules/imageJobs/service";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await cancelImageJobService(req, params.id);
    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

