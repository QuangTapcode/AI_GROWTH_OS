import { NextRequest } from "next/server";
import {
  leadRoutes,
  toPublicHttpRequest,
  toNextResponse,
} from "@/lib/public-service";

export async function POST(
  req: NextRequest,
  { params }: { params: { site_id: string } }
) {
  const publicReq = await toPublicHttpRequest(req, params);
  const result = await leadRoutes.handleCreateLead(publicReq);
  return toNextResponse(result);
}
