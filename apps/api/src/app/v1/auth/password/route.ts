import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { changePassword } from "@/modules/auth/service";

export async function POST(req: NextRequest) {
  try {
    const user = authenticateUser(req);
    const body = await req.json().catch(() => null);
    const data = await changePassword(user, body);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleApiError(err);
  }
}
