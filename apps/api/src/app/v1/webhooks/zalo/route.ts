import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { tickAutomation } from "@/modules/campaignPlans/automation";

/**
 * Webhook Zalo Official Account: tin nhắn khách gửi OA → community_messages (zalo_message) → Agent 7
 * (đặt bàn) hoặc agent hỏi-đáp. Xác thực theo chữ ký Zalo: X-ZEvent-Signature = "mac=" + sha256(appId + body + timestamp + OA secret).
 */
function validZaloSignature(body: string, timestamp: string | undefined, header: string | null): boolean {
  const appId = process.env.ZALO_APP_ID?.trim();
  const secret = process.env.ZALO_OA_SECRET_KEY?.trim();
  if (!appId || !secret || !header || !timestamp) return false;
  const expected = Buffer.from(`mac=${createHash("sha256").update(`${appId}${body}${timestamp}${secret}`).digest("hex")}`);
  const actual = Buffer.from(header.trim());
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  let payload: {
    event_name?: string;
    timestamp?: string;
    sender?: { id?: string };
    recipient?: { id?: string };
    message?: { msg_id?: string; text?: string };
    user_id_by_app?: string;
  };
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: { code: "INVALID_JSON" } }, { status: 400 });
  }
  if (!validZaloSignature(body, payload.timestamp, req.headers.get("x-zevent-signature"))) {
    return NextResponse.json({ error: { code: "INVALID_SIGNATURE" } }, { status: 401 });
  }
  const workspaceId = process.env.ZALO_WEBHOOK_WORKSPACE_ID?.trim();
  if (!workspaceId || payload.event_name !== "user_send_text") return NextResponse.json({ status: "ignored" });
  const text = payload.message?.text?.trim();
  const sender = payload.sender?.id?.trim();
  const msgId = payload.message?.msg_id?.trim();
  if (!text || !sender || !msgId) return NextResponse.json({ status: "ignored" });
  await pool.query(
    `INSERT INTO community_messages (workspace_id, platform, external_id, author_name, author_contact, content, metadata)
     SELECT $1::uuid, 'zalo_message', $2::varchar, 'Khách Zalo', $3::varchar, $4::text, $5::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM community_messages WHERE workspace_id=$1::uuid AND platform='zalo_message' AND external_id=$2::varchar)`,
    [workspaceId, msgId, sender, text.slice(0, 4000), JSON.stringify({ oa_id: payload.recipient?.id ?? null })],
  );
  void tickAutomation(pool, workspaceId).catch(() => {});
  return NextResponse.json({ status: "received" });
}
