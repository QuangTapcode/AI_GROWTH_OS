import { NextRequest } from "next/server";
import {
  publicContentRoutes,
  toPublicHttpRequest,
  toNextResponse,
} from "@/lib/public-service";

export async function GET(
  req: NextRequest,
  { params }: { params: { site_id: string } }
) {
  const publicReq = await toPublicHttpRequest(req, params);
  const result = await publicContentRoutes.handleGetLanding(publicReq);
  return toNextResponse(result);
}
