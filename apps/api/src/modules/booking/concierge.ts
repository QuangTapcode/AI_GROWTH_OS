import type { Pool, PoolClient } from "pg";
import defaultPool from "../../lib/db";
import { loadMerchantProfile, formatVnd, type MerchantProfile } from "../merchant/profile";
import { alertOwner } from "../merchant/notify";
import { paymentReference, vietQrImageUrl } from "../billing/vietqr";
import {
  detectBookingIntent,
  detectCancel,
  detectConfirmation,
  extractSlots,
  formatLocal,
  hasClockTime,
  validateBookingTime,
  type BookingSlots,
} from "./slots";

/**
 * Agent 7 — Booking Concierge (tin nhắn riêng 1-1: Messenger, Instagram DM, Zalo, Telegram).
 *
 * State machine theo từng khách (booking_conversations):
 *   collecting → (đủ giờ, số người, SĐT, tên + hợp lệ) → awaiting_confirmation → (khách "OK") → confirmed
 *   bất kỳ → cancelled (khách hủy) | handoff (bàn quá lớn, quá nhiều lượt) → nhân viên xử lý.
 * Mỗi lượt chỉ hỏi 1 thông tin còn thiếu. Câu hỏi ngoài luồng (menu, gửi xe...) trả về handled=false
 * để Agent hỏi-đáp RAG trả lời, hội thoại đặt bàn vẫn được giữ.
 * Trả lời được đưa vào outbox `community.reply` để worker gửi đúng kênh (SLA < 1 phút).
 */
export const DM_PLATFORMS = new Set(["facebook_message", "instagram_message", "zalo_message", "telegram_message"]);
const CONVERSATION_TTL_MS = 24 * 3600_000;
const MAX_TURNS = 14;

export interface InboundMessage {
  id: string;
  platform: string;
  author_contact: string | null;
  author_name?: string | null;
  content: string;
  metadata?: Record<string, unknown> | null;
}

export interface ConciergeOutcome {
  handled: boolean;
  state?: "collecting" | "awaiting_confirmation" | "confirmed" | "handoff" | "cancelled";
  reply?: string;
  booking_lead_id?: string;
}

interface ConversationRow {
  id: string;
  state: ConciergeOutcome["state"];
  slots: BookingSlots;
  turns: number;
  last_message_at: string;
}

type Db = Pick<Pool, "query" | "connect">;

function mergeSlots(current: BookingSlots, incoming: BookingSlots): BookingSlots {
  const merged: BookingSlots = { ...current };
  for (const [key, value] of Object.entries(incoming) as Array<[keyof BookingSlots, unknown]>) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "customer_name" && current.customer_name && incoming.customer_name && current.customer_name !== incoming.customer_name) {
      // Tên rút từ câu khách tự giới thiệu ưu tiên hơn tên hồ sơ Messenger đã có trước đó.
      (merged as Record<string, unknown>)[key] = value;
      continue;
    }
    if (key === "booking_time" && current.booking_time && !hasClockTime(value as string) && hasClockTime(current.booking_time)) {
      // Khách chỉ đổi ngày ("mai nhé"): giữ giờ đã nói, đổi ngày.
      const prev = new Date(current.booking_time);
      const day = new Date(value as string);
      merged.booking_time = new Date(day.getTime() + ((prev.getTime() + 7 * 3600_000) % 86400_000)).toISOString();
      merged.time_assumed_day = false;
      continue;
    }
    if (key === "booking_time" && current.booking_time && hasClockTime(value as string) && !hasClockTime(current.booking_time)) {
      // Trước đó khách nói ngày, giờ mới nói giờ.
      const day = new Date(current.booking_time);
      const time = new Date(value as string);
      merged.booking_time = new Date(day.getTime() + ((time.getTime() + 7 * 3600_000) % 86400_000)).toISOString();
      merged.time_assumed_day = false;
      continue;
    }
    (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

function nextQuestion(slots: BookingSlots, profile: MerchantProfile): string | null {
  if (!slots.booking_time) return "Anh/chị muốn đặt bàn vào ngày nào, mấy giờ ạ?";
  if (!hasClockTime(slots.booking_time)) return `Dạ ${formatLocal(slots.booking_time).split(" ").slice(1).join(" ")} anh/chị muốn đến lúc mấy giờ ạ?`;
  if (!slots.party_size) return "Mình đi bao nhiêu người để quán chuẩn bị bàn phù hợp ạ?";
  if (!slots.customer_phone) return "Anh/chị cho em xin số điện thoại để quán giữ bàn và liên hệ khi cần nhé.";
  if (!slots.customer_name) return "Em ghi tên đặt bàn là gì ạ?";
  void profile;
  return null;
}

function depositFor(slots: BookingSlots, profile: MerchantProfile): { amount: number; account: { bankBin: string; accountNumber: string; accountName?: string } | null } | null {
  const d = profile.settings.deposit;
  if (!d || !slots.party_size || slots.party_size < d.required_from_party_size || d.amount_per_guest_vnd <= 0) return null;
  const account = d.bank_bin && d.bank_account ? { bankBin: d.bank_bin, accountNumber: d.bank_account, accountName: d.account_name } : null;
  return { amount: d.amount_per_guest_vnd * slots.party_size, account };
}

function summary(slots: BookingSlots, profile: MerchantProfile): string {
  const lines = [
    `Em xác nhận lại thông tin đặt bàn tại ${profile.businessName}:`,
    `• Thời gian: ${formatLocal(slots.booking_time!)}`,
    `• Số khách: ${slots.party_size} người`,
    `• Tên: ${slots.customer_name}`,
    `• SĐT: ${slots.customer_phone}`,
  ];
  if (slots.notes) lines.push(`• Ghi chú: ${slots.notes}`);
  const deposit = depositFor(slots, profile);
  if (deposit) lines.push(`• Bàn từ ${profile.settings.deposit!.required_from_party_size} khách cần cọc ${formatVnd(deposit.amount)}.`);
  lines.push("Thông tin đúng thì anh/chị trả lời “OK” giúp em nhé. Cần sửa gì anh/chị cứ nhắn ạ.");
  return lines.join("\n");
}

export class BookingConciergeService {
  constructor(
    private readonly db: Db = defaultPool,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async openConversation(workspaceId: string, platform: string, contact: string): Promise<ConversationRow | null> {
    const row = (
      await this.db.query(
        `SELECT id, state, slots, turns, last_message_at FROM booking_conversations
          WHERE workspace_id = $1::uuid AND platform = $2 AND contact_ref = $3 AND state IN ('collecting', 'awaiting_confirmation')
          LIMIT 1`,
        [workspaceId, platform, contact],
      )
    ).rows[0] as ConversationRow | undefined;
    if (!row) return null;
    if (this.now().getTime() - new Date(row.last_message_at).getTime() > CONVERSATION_TTL_MS) {
      await this.db.query(`UPDATE booking_conversations SET state = 'cancelled', updated_at = NOW() WHERE id = $1`, [row.id]);
      return null;
    }
    return row;
  }

  private async queueReply(client: Pick<PoolClient, "query">, workspaceId: string, message: InboundMessage, text: string, state: string): Promise<void> {
    await client.query(
      `INSERT INTO outbox_events (workspace_id, event_type, dedup_key, payload) VALUES ($1::uuid, 'community.reply', $2, $3::jsonb)
       ON CONFLICT (workspace_id, dedup_key) DO UPDATE SET payload = EXCLUDED.payload, status = 'pending', retry_count = 0, published_at = NULL`,
      [
        workspaceId,
        `community-reply:${message.id}`,
        JSON.stringify({
          message_id: message.id,
          recipient: message.author_contact,
          text,
          platform: message.platform,
          agent: "inbox_concierge",
          ...(message.metadata?.business_connection_id ? { business_connection_id: message.metadata.business_connection_id } : {}),
        }),
      ],
    );
    await client.query(
      `UPDATE community_messages SET status = 'queued', metadata = metadata || $3::jsonb, updated_at = NOW() WHERE workspace_id = $1::uuid AND id = $2::uuid`,
      [workspaceId, message.id, JSON.stringify({ agent: "inbox_concierge", booking_state: state })],
    );
  }

  /**
   * Xử lý một tin nhắn riêng. handled=false nghĩa là không thuộc luồng đặt bàn (để agent hỏi-đáp xử lý).
   */
  async handleInbound(workspaceId: string, message: InboundMessage): Promise<ConciergeOutcome> {
    if (!DM_PLATFORMS.has(message.platform) || !message.author_contact) return { handled: false };
    const text = message.content.trim();
    if (!text) return { handled: false };
    const existing = await this.openConversation(workspaceId, message.platform, message.author_contact);
    if (!existing && !detectBookingIntent(text)) return { handled: false };

    const profile = await loadMerchantProfile(this.db, workspaceId);
    const now = this.now();
    const extracted = extractSlots(text, now, existing ? null : message.author_name);
    let slots = mergeSlots(existing?.slots ?? {}, extracted);
    let state: NonNullable<ConciergeOutcome["state"]> = existing?.state ?? "collecting";
    const turns = (existing?.turns ?? 0) + 1;
    let reply: string;
    let bookingLeadId: string | undefined;

    const confirmation = detectConfirmation(text);
    const learnedSomething = Object.keys(extracted).length > 0;

    if (detectCancel(text)) {
      state = "cancelled";
      reply = "Dạ em đã hủy yêu cầu đặt bàn. Khi nào cần anh/chị cứ nhắn quán nhé!";
    } else if (existing && state === "awaiting_confirmation" && confirmation === "yes") {
      const finalized = await this.finalize(workspaceId, message, slots, profile);
      state = finalized.state;
      reply = finalized.reply;
      bookingLeadId = finalized.leadId;
    } else if (existing && state === "awaiting_confirmation" && confirmation === "no" && !learnedSomething) {
      reply = "Dạ anh/chị cần sửa thông tin nào (giờ, số người, tên hay số điện thoại) ạ?";
    } else if (existing && !learnedSomething && confirmation === null) {
      // Câu hỏi ngoài luồng (menu, đường đi...): để agent hỏi-đáp trả lời, giữ nguyên hội thoại.
      await this.db.query(`UPDATE booking_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`, [existing.id]);
      return { handled: false, state };
    } else if (turns > MAX_TURNS) {
      state = "handoff";
      reply = "Dạ em chuyển thông tin cho nhân viên quán gọi lại hỗ trợ anh/chị ngay nhé!";
      await alertOwner(profile, `📞 Khách cần hỗ trợ đặt bàn (${message.platform}): ${message.author_name ?? message.author_contact}\nĐã nói: ${JSON.stringify(slots)}`);
    } else {
      const maxParty = profile.settings.max_party_size;
      const timeProblem = slots.booking_time && hasClockTime(slots.booking_time) ? validateBookingTime(slots.booking_time, now, profile.settings.opening_hours) : null;
      if (timeProblem) {
        slots = { ...slots, booking_time: undefined, time_assumed_day: undefined };
        reply = `${timeProblem}. Anh/chị chọn giúp em thời gian khác nhé?`;
        state = "collecting";
      } else if (maxParty && slots.party_size && slots.party_size > maxParty) {
        state = "handoff";
        reply = `Dạ đoàn ${slots.party_size} khách quán cần sắp xếp riêng, em chuyển nhân viên gọi lại cho anh/chị${slots.customer_phone ? ` qua số ${slots.customer_phone}` : ""} ngay ạ.`;
        await alertOwner(profile, `👥 Đoàn lớn ${slots.party_size} khách muốn đặt bàn (${message.platform}). Thông tin: ${JSON.stringify(slots)}`);
      } else {
        const question = nextQuestion(slots, profile);
        if (question) {
          state = "collecting";
          const greet = !existing ? `Dạ ${profile.businessName} chào anh/chị ạ! ` : "";
          reply = `${greet}${question}`;
        } else {
          state = "awaiting_confirmation";
          reply = summary(slots, profile);
        }
      }
    }

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      if (existing) {
        await client.query(
          `UPDATE booking_conversations SET state = $2, slots = $3::jsonb, turns = $4, booking_lead_id = COALESCE($5, booking_lead_id),
                  last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [existing.id, state, JSON.stringify(slots), turns, bookingLeadId ?? null],
        );
      } else {
        await client.query(
          `INSERT INTO booking_conversations (workspace_id, platform, contact_ref, state, slots, turns, booking_lead_id)
           VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6, $7)`,
          [workspaceId, message.platform, message.author_contact, state, JSON.stringify(slots), turns, bookingLeadId ?? null],
        );
      }
      await this.queueReply(client, workspaceId, message, reply, state);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    return { handled: true, state, reply, booking_lead_id: bookingLeadId };
  }

  private async finalize(
    workspaceId: string,
    message: InboundMessage,
    slots: BookingSlots,
    profile: MerchantProfile,
  ): Promise<{ state: "confirmed"; reply: string; leadId: string }> {
    const deposit = depositFor(slots, profile);
    const reference = deposit ? paymentReference("DC") : null;
    const autoConfirm = profile.settings.auto_confirm_bookings === true && !deposit;
    const qr = deposit?.account && reference ? vietQrImageUrl(deposit.account, deposit.amount, `${reference} ${slots.customer_phone ?? ""}`) : null;
    const lead = (
      await this.db.query(
        `INSERT INTO booking_leads (workspace_id, customer_name, customer_phone, platform, party_size, booking_time, special_notes,
                                    status, deposit_amount, deposit_status, contact_ref, deposit_reference, source_message_id, metadata)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::uuid, $14::jsonb) RETURNING id`,
        [
          workspaceId,
          slots.customer_name,
          slots.customer_phone,
          message.platform.replace(/_message$/, ""),
          slots.party_size,
          slots.booking_time,
          slots.notes ?? null,
          autoConfirm ? "confirmed" : "pending",
          deposit?.amount ?? 0,
          deposit ? "unpaid" : "not_required",
          message.author_contact,
          reference,
          message.id,
          JSON.stringify({ source: "inbox_concierge", platform_message: message.platform, deposit_qr: qr }),
        ],
      )
    ).rows[0];
    const lines = [
      autoConfirm
        ? `Dạ em đã giữ bàn ${slots.party_size} người lúc ${formatLocal(slots.booking_time!)} cho anh/chị ${slots.customer_name} rồi ạ!`
        : `Dạ em đã ghi nhận yêu cầu giữ bàn ${slots.party_size} người lúc ${formatLocal(slots.booking_time!)}. Nhân viên quán sẽ xác nhận lại với anh/chị trong ít phút ạ.`,
    ];
    if (deposit) {
      lines.push(
        qr
          ? `Anh/chị vui lòng chuyển cọc ${formatVnd(deposit.amount)} với nội dung "${reference}" qua mã QR: ${qr}`
          : `Bàn này cần cọc ${formatVnd(deposit.amount)}, nhân viên quán sẽ gửi thông tin chuyển khoản (mã ${reference}).`,
      );
    }
    if (profile.settings.address) lines.push(`Địa chỉ: ${profile.settings.address}.`);
    // Agent 8 — điểm chạm phễu cộng đồng: mời khách vừa đặt bàn vào nhóm khách quen.
    const groupUrl = profile.settings.zalo_group_url ?? profile.links.group;
    if (groupUrl) lines.push(`Mời anh/chị vào nhóm khách quen của quán để nhận ưu đãi riêng: ${groupUrl}`);
    lines.push("Hẹn gặp anh/chị tại quán ạ!");
    await alertOwner(
      profile,
      `🍽️ Đặt bàn mới (${message.platform.replace(/_message$/, "")}): ${slots.customer_name} — ${slots.customer_phone}\n${slots.party_size} người, ${formatLocal(slots.booking_time!)}${slots.notes ? `\nGhi chú: ${slots.notes}` : ""}${deposit ? `\nCọc: ${formatVnd(deposit.amount)} (mã ${reference})` : ""}\nTrạng thái: ${autoConfirm ? "đã xác nhận" : "CHỜ NHÂN VIÊN XÁC NHẬN"} trong Booking Hub.`,
    );
    return { state: "confirmed", reply: lines.join("\n"), leadId: lead.id };
  }
}
