import type { Pool } from "pg";
import { z } from "zod";
import defaultPool from "../../lib/db";
import { AppError } from "../../lib/errors";
import { loadMerchantProfile } from "../merchant/profile";
import { formatLocal } from "./slots";

/**
 * Booking Leads Hub: danh sách đặt bàn thật (do Agent 7 chốt qua tin nhắn hoặc nhân viên nhập tay).
 * Nhân viên xác nhận/ hủy → khách nhận tin nhắn báo lại qua đúng kênh đã đặt.
 */
export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
export type DepositStatus = "not_required" | "unpaid" | "paid" | "refunded";

export interface BookingLead {
  id: string;
  workspace_id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  platform: string;
  party_size: number;
  booking_time: string;
  special_notes: string | null;
  status: BookingStatus;
  deposit_amount: number;
  deposit_status: DepositStatus;
  deposit_reference: string | null;
  contact_ref: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const phoneSchema = z.string().trim().regex(/^(\+?84|0)\d{9,10}$/, "Số điện thoại không hợp lệ");

export const createBookingSchema = z
  .object({
    customer_name: z.string().trim().min(1).max(255),
    customer_phone: phoneSchema.optional(),
    customer_email: z.string().email().optional(),
    platform: z.enum(["phone", "walk_in", "messenger", "instagram", "zalo", "telegram", "web"]).default("phone"),
    party_size: z.number().int().min(1).max(500),
    booking_time: z.string().datetime({ offset: true }),
    special_notes: z.string().trim().max(1000).optional(),
    status: z.enum(["pending", "confirmed"]).default("confirmed"),
  })
  .strict();

export const updateBookingSchema = z
  .object({
    status: z.enum(["pending", "confirmed", "cancelled", "completed", "no_show"]).optional(),
    deposit_status: z.enum(["not_required", "unpaid", "paid", "refunded"]).optional(),
    party_size: z.number().int().min(1).max(500).optional(),
    booking_time: z.string().datetime({ offset: true }).optional(),
    special_notes: z.string().trim().max(1000).nullable().optional(),
    notify_customer: z.boolean().default(true),
  })
  .strict();

function mapRow(row: any): BookingLead {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    customer_name: row.customer_name,
    customer_phone: row.customer_phone ?? null,
    customer_email: row.customer_email ?? null,
    platform: row.platform,
    party_size: Number(row.party_size),
    booking_time: new Date(row.booking_time).toISOString(),
    special_notes: row.special_notes ?? null,
    status: row.status,
    deposit_amount: Number(row.deposit_amount ?? 0),
    deposit_status: row.deposit_status,
    deposit_reference: row.deposit_reference ?? null,
    contact_ref: row.contact_ref ?? null,
    metadata: row.metadata ?? {},
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

const MESSAGE_PLATFORM: Record<string, string> = {
  messenger: "facebook_message",
  facebook: "facebook_message",
  instagram: "instagram_message",
  zalo: "zalo_message",
  telegram: "telegram_message",
};

export class BookingLeadService {
  constructor(private readonly db: Pick<Pool, "query"> = defaultPool) {}

  async listLeads(
    workspaceId: string,
    filters: { status?: string; from?: string; to?: string; limit?: number } = {},
  ): Promise<{ items: BookingLead[]; summary: { pending: number; confirmed_today: number; guests_today: number } }> {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const items = (
      await this.db.query(
        `SELECT * FROM booking_leads
          WHERE workspace_id = $1::uuid AND ($2::text IS NULL OR status = $2::text)
            AND ($3::timestamptz IS NULL OR booking_time >= $3::timestamptz)
            AND ($4::timestamptz IS NULL OR booking_time < $4::timestamptz)
          ORDER BY CASE WHEN status = 'pending' THEN 0 ELSE 1 END, booking_time ASC LIMIT $5`,
        [workspaceId, filters.status ?? null, filters.from ?? null, filters.to ?? null, limit],
      )
    ).rows.map(mapRow);
    const summary = (
      await this.db.query(
        `SELECT COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
                COUNT(*) FILTER (WHERE status = 'confirmed' AND (booking_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::int AS confirmed_today,
                COALESCE(SUM(party_size) FILTER (WHERE status = 'confirmed' AND (booking_time AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date), 0)::int AS guests_today
           FROM booking_leads WHERE workspace_id = $1::uuid`,
        [workspaceId],
      )
    ).rows[0];
    return { items, summary: { pending: summary?.pending ?? 0, confirmed_today: summary?.confirmed_today ?? 0, guests_today: summary?.guests_today ?? 0 } };
  }

  async createLead(workspaceId: string, raw: unknown): Promise<BookingLead> {
    const input = createBookingSchema.parse(raw);
    if (Date.parse(input.booking_time) < Date.now() - 3600_000) throw new AppError(422, "BOOKING_IN_PAST", "Thời gian đặt bàn đã qua");
    const row = (
      await this.db.query(
        `INSERT INTO booking_leads (workspace_id, customer_name, customer_phone, customer_email, platform, party_size, booking_time,
                                    special_notes, status, deposit_status, metadata)
         VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, 'not_required', '{"source":"staff"}'::jsonb) RETURNING *`,
        [workspaceId, input.customer_name, input.customer_phone ?? null, input.customer_email ?? null, input.platform, input.party_size, input.booking_time, input.special_notes ?? null, input.status],
      )
    ).rows[0];
    return mapRow(row);
  }

  async updateLead(workspaceId: string, leadId: string, raw: unknown): Promise<BookingLead> {
    const input = updateBookingSchema.parse(raw);
    const current = (await this.db.query(`SELECT * FROM booking_leads WHERE workspace_id = $1::uuid AND id = $2::uuid`, [workspaceId, leadId])).rows[0];
    if (!current) throw new AppError(404, "BOOKING_NOT_FOUND", "Không tìm thấy đặt bàn");
    const row = (
      await this.db.query(
        `UPDATE booking_leads
            SET status = COALESCE($3, status), deposit_status = COALESCE($4, deposit_status), party_size = COALESCE($5, party_size),
                booking_time = COALESCE($6::timestamptz, booking_time),
                special_notes = CASE WHEN $7::boolean THEN $8 ELSE special_notes END, updated_at = NOW()
          WHERE workspace_id = $1::uuid AND id = $2::uuid RETURNING *`,
        [
          workspaceId,
          leadId,
          input.status ?? null,
          input.deposit_status ?? null,
          input.party_size ?? null,
          input.booking_time ?? null,
          input.special_notes !== undefined,
          input.special_notes ?? null,
        ],
      )
    ).rows[0];
    const lead = mapRow(row);
    const statusChanged = input.status && input.status !== current.status;
    const timeChanged = input.booking_time && Date.parse(input.booking_time) !== new Date(current.booking_time).getTime();
    if (input.notify_customer && (statusChanged || timeChanged) && lead.contact_ref) {
      await this.notifyCustomer(workspaceId, lead, statusChanged ? lead.status : "rescheduled");
    }
    return lead;
  }

  private async notifyCustomer(workspaceId: string, lead: BookingLead, event: BookingStatus | "rescheduled"): Promise<void> {
    const platform = MESSAGE_PLATFORM[lead.platform];
    if (!platform || !lead.contact_ref) return;
    const profile = await loadMerchantProfile(this.db, workspaceId);
    const when = formatLocal(lead.booking_time);
    const text =
      event === "confirmed"
        ? `Dạ ${profile.businessName} xác nhận đã giữ bàn ${lead.party_size} người lúc ${when} cho anh/chị ${lead.customer_name}. Hẹn gặp anh/chị ạ!`
        : event === "cancelled"
          ? `Dạ ${profile.businessName} rất tiếc phải báo bàn lúc ${when} không thể giữ được. Anh/chị nhắn quán để chọn giờ khác nhé, quán xin lỗi vì sự bất tiện ạ.`
          : event === "rescheduled"
            ? `Dạ quán đã cập nhật giờ đặt bàn của anh/chị thành ${when} (${lead.party_size} người) ạ.`
            : null;
    if (!text) return;
    await this.db.query(
      `INSERT INTO outbox_events (workspace_id, event_type, dedup_key, payload) VALUES ($1::uuid, 'community.reply', $2, $3::jsonb)
       ON CONFLICT (workspace_id, dedup_key) DO NOTHING`,
      [
        workspaceId,
        `booking-${event}:${lead.id}:${Date.now()}`,
        JSON.stringify({ message_id: null, recipient: lead.contact_ref, text, platform, agent: "inbox_concierge" }),
      ],
    );
  }
}
