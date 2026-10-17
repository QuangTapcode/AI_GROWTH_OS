import { NextRequest } from "next/server";
import {
  publicContentRoutes,
  toPublicHttpRequest,
  toNextResponse,
} from "../../../../../../../lib/public-service";
import { handleApiError } from "../../../../../../../lib/errors";

export async function GET(
  req: NextRequest,
  { params }: { params: { site_id: string; slug: string } }
) {
  try {
    const publicReq = await toPublicHttpRequest(req, params);
    const result = await publicContentRoutes.handleGetPost(publicReq);
    return toNextResponse(result);
  } catch (err) {
    return handleApiError(err);
  }
}
