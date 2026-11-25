/**
 * Kênh báo cho chủ quán: Telegram (bot TELEGRAM_BOT_TOKEN, chat id trong hồ sơ quán hoặc TELEGRAM_OWNER_CHAT_ID)
 * và Email (Resend HTTP API: RESEND_API_KEY + REPORT_EMAIL_FROM). Thiếu cấu hình → trả not_configured, không giả gửi.
 */
import type { FetchLike } from "../ai/providers";
import type { MerchantProfile } from "./profile";

export type DeliveryResult =
  | { status: "sent"; message_id?: string }
  | { status: "not_configured"; detail: string }
  | { status: "failed"; detail: string };

export function ownerTelegramChat(profile: MerchantProfile): string | null {
  return profile.settings.telegram_chat_id?.trim() || process.env.TELEGRAM_OWNER_CHAT_ID?.trim() || null;
}

export async function sendTelegramText(
  chatId: string | null,
  text: string,
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
): Promise<DeliveryResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return { status: "not_configured", detail: "Thiếu TELEGRAM_BOT_TOKEN" };
  if (!chatId) return { status: "not_configured", detail: "Chưa có Telegram chat id của chủ quán" };
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { message_id?: number } };
    if (!res.ok || !body.ok) return { status: "failed", detail: body.description ?? `HTTP ${res.status}` };
    return { status: "sent", message_id: body.result?.message_id?.toString() };
  } catch (err) {
    return { status: "failed", detail: (err as Error).message };
  }
}

export async function sendEmail(
  to: string | null | undefined,
  subject: string,
  html: string,
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.REPORT_EMAIL_FROM?.trim();
  if (!apiKey || !from) return { status: "not_configured", detail: "Thiếu RESEND_API_KEY / REPORT_EMAIL_FROM" };
  if (!to) return { status: "not_configured", detail: "Chưa có email nhận báo cáo của chủ quán" };
  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [to], subject, html }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return { status: "failed", detail: body.message ?? `HTTP ${res.status}` };
    return { status: "sent", message_id: body.id };
  } catch (err) {
    return { status: "failed", detail: (err as Error).message };
  }
}

/** Báo động cho chủ quán (review xấu, bình luận "phốt"); lỗi gửi không được làm hỏng luồng chính. */
export async function alertOwner(profile: MerchantProfile, text: string, fetchImpl?: FetchLike): Promise<DeliveryResult> {
  return sendTelegramText(ownerTelegramChat(profile), text, fetchImpl);
}
