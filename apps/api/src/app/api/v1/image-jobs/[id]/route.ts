import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { getImageJobService } from "@/modules/imageJobs/service";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await getImageJobService(req, params.id);
    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

