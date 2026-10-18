import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { login } from "@/modules/auth/service";

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || req.ip || "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const data = await login(body, clientIp(req));
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleApiError(err);
  }
}
