import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { tickMerchantAgents } from "@/modules/merchant/scheduler";

let inProgress = false;

/** Worker gọi mỗi phút (Bearer AUTOMATION_INTERNAL_TOKEN) để chạy các agent merchant tới lượt. */
export async function POST(req: NextRequest) {
  const token = process.env.AUTOMATION_INTERNAL_TOKEN;
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (!token || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  if (inProgress) return NextResponse.json({ results: [], skipped: "in_progress" });
  inProgress = true;
  try {
    const results = await tickMerchantAgents(pool);
    return NextResponse.json({ results });
  } finally {
    inProgress = false;
  }
}
