import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/errors";
import { MerchantWalletService, extractTopupReference } from "@/modules/billing/wallet";

/**
 * Webhook biến động số dư (định dạng phổ biến của SePay/ Casso): header `Authorization: Apikey <PAYMENT_WEBHOOK_SECRET>`.
 * Nội dung chuyển khoản chứa mã NAPxxxxxxxx → cộng credit đúng 1 lần (idempotent).
 */
function authorized(header: string | null): boolean {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET?.trim();
  if (!secret || !header) return false;
  const value = header.replace(/^(Apikey|Bearer)\s+/i, "").trim();
  const a = Buffer.from(value);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req.headers.get("authorization"))) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  try {
    const body = (await req.json()) as { content?: string; description?: string; transferAmount?: number; amount?: number; transferType?: string; id?: string | number };
    if (body.transferType && body.transferType !== "in") return NextResponse.json({ success: true, status: "ignored_outgoing" });
    const reference = extractTopupReference(`${body.content ?? ""} ${body.description ?? ""}`);
    const amount = Number(body.transferAmount ?? body.amount ?? 0);
    if (!reference || !(amount > 0)) return NextResponse.json({ success: true, status: "no_reference" });
    const settled = await new MerchantWalletService().settle(reference, amount, `bank:${String(body.id ?? "webhook").slice(0, 50)}`);
    return NextResponse.json({ success: true, status: settled ? "credited" : "not_pending", reference });
  } catch (error) {
    return handleApiError(error);
  }
}
