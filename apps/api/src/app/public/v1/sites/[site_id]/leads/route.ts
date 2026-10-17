import { NextRequest } from "next/server";
import {
  leadRoutes,
  toPublicHttpRequest,
  toNextResponse,
} from "../../../../../../lib/public-service";
import { handleApiError } from "../../../../../../lib/errors";

export async function POST(
  req: NextRequest,
  { params }: { params: { site_id: string } }
) {
  try {
    const publicReq = await toPublicHttpRequest(req, params);
    const result = await leadRoutes.handleCreateLead(publicReq);
    return toNextResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
