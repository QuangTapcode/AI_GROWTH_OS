import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { logout } from "@/modules/auth/service";

export async function POST(req: NextRequest) {
  try {
    const user = authenticateUser(req);
    const data = await logout(user);
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleApiError(err);
  }
}
