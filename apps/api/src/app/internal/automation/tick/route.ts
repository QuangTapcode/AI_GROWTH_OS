import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { tickAutomation } from "@/modules/campaignPlans/automation";

let tickInProgress = false;

export async function POST(req: NextRequest) {
  const token = process.env.AUTOMATION_INTERNAL_TOKEN;
  const actual = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (
    !token ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED" } },
      { status: 401 },
    );
  if (tickInProgress) {
    return NextResponse.json({ results: [], skipped: "in_progress" });
  }
  tickInProgress = true;
  try {
    const rows = (
      await pool.query(
        "SELECT workspace_id FROM agent_automation WHERE enabled ORDER BY last_tick_at NULLS FIRST LIMIT 50",
      )
    ).rows;
    const results = [];
    for (const row of rows) {
      try {
        results.push({
          workspace_id: row.workspace_id,
          ...(await tickAutomation(pool, row.workspace_id)),
        });
      } catch {
        results.push({ workspace_id: row.workspace_id, status: "blocked" });
      }
    }
    return NextResponse.json({ results });
  } finally {
    tickInProgress = false;
  }
}
