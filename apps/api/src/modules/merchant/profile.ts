import type { Pool } from "pg";
import { z } from "zod";

/**
 * Hồ sơ vận hành của quán (F&B / du lịch) mà 8 agent dùng chung: giờ mở cửa, thực đơn & giá,
 * FAQ, chính sách cọc, từ khóa SEO địa phương, kênh nhận báo cáo. Lưu trong merchant_onboarding.settings.
 *
 * Nguyên tắc chống bịa: agent chỉ được nêu giá / giờ / địa chỉ có trong hồ sơ này. Thiếu dữ liệu thì
 * hỏi lại khách hoặc chuyển cho nhân viên, không tự suy đoán.
 */
const timeHHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Định dạng giờ HH:MM");

export const menuItemSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(500).optional(),
  price_vnd: z.number().int().nonnegative().optional(),
  category: z.string().trim().max(80).optional(),
  tags: z.array(z.string().trim().max(40)).max(10).optional(),
});

export const merchantSettingsSchema = z
  .object({
    business_name: z.string().trim().min(1).max(255).optional(),
    business_type: z.enum(["restaurant", "cafe", "bar", "street_food", "tour", "homestay", "other"]).optional(),
    phone: z.string().trim().max(30).optional(),
    address: z.string().trim().max(300).optional(),
    district: z.string().trim().max(100).optional(),
    city: z.string().trim().max(100).optional(),
    opening_hours: z.object({ open: timeHHMM, close: timeHHMM, closed_weekdays: z.array(z.number().int().min(0).max(6)).optional() }).optional(),
    max_party_size: z.number().int().min(1).max(500).optional(),
    parking_note: z.string().trim().max(300).optional(),
    menu: z.array(menuItemSchema).max(300).optional(),
    faq: z.array(z.object({ question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(1000) })).max(100).optional(),
    promotions: z.array(z.object({ title: z.string().trim().min(1).max(200), detail: z.string().trim().max(500).optional(), until: z.string().optional() })).max(20).optional(),
    deposit: z
      .object({
        required_from_party_size: z.number().int().min(1).max(500),
        amount_per_guest_vnd: z.number().int().min(0),
        bank_bin: z.string().trim().max(10).optional(),
        bank_account: z.string().trim().max(30).optional(),
        account_name: z.string().trim().max(100).optional(),
      })
      .optional(),
    seo_keywords: z.array(z.string().trim().min(2).max(80)).max(40).optional(),
    brand_voice: z.string().trim().max(300).optional(),
    logo_url: z.string().url().optional(),
    telegram_chat_id: z.string().trim().max(40).optional(),
    report_email: z.string().email().optional(),
    report_hour_local: z.number().int().min(0).max(23).optional(),
    gmaps_auto_reply_min_rating: z.number().int().min(1).max(6).optional(),
    auto_publish_gmaps_posts: z.boolean().optional(),
    auto_publish_calendar: z.boolean().optional(),
    /** true: bot xác nhận giữ bàn ngay; false (mặc định): nhân viên bấm xác nhận trong Booking Hub. */
    auto_confirm_bookings: z.boolean().optional(),
    community_target_members: z.number().int().min(10).max(100000).optional(),
    zalo_group_url: z.string().url().optional(),
  })
  .strict();

export type MerchantSettings = z.infer<typeof merchantSettingsSchema>;
export type MenuItem = z.infer<typeof menuItemSchema>;

export interface MerchantProfile {
  workspaceId: string;
  businessName: string;
  settings: MerchantSettings;
  links: { fanpage: string | null; gmaps: string | null; gdrive: string | null; group: string | null };
  parsedRefs: Record<string, unknown>;
  activated: boolean;
  brandVoice: string;
}

export async function loadMerchantProfile(db: Pick<Pool, "query">, workspaceId: string): Promise<MerchantProfile> {
  const row = (
    await db.query(
      `SELECT o.*, bp.company_name, bp.brand_voice AS profile_voice, w.name AS workspace_name
         FROM workspaces w
         LEFT JOIN merchant_onboarding o ON o.workspace_id = w.id
         LEFT JOIN business_profiles bp ON bp.workspace_id = w.id
        WHERE w.id = $1::uuid`,
      [workspaceId],
    )
  ).rows[0];
  const parsed = merchantSettingsSchema.safeParse(row?.settings ?? {});
  // Dữ liệu cũ có thể chứa khóa lạ: giữ phần hợp lệ, bỏ phần không nhận ra.
  const settings: MerchantSettings = parsed.success ? parsed.data : sanitizeSettings(row?.settings);
  const businessName = settings.business_name || row?.business_name || row?.company_name || row?.workspace_name || "Quán";
  return {
    workspaceId,
    businessName,
    settings,
    links: {
      fanpage: row?.fanpage_url ?? null,
      gmaps: row?.gmaps_url ?? null,
      gdrive: row?.gdrive_url ?? null,
      group: row?.community_group_url ?? null,
    },
    parsedRefs: (row?.parsed_refs as Record<string, unknown>) ?? {},
    activated: Boolean(row?.onboarding_completed),
    brandVoice: settings.brand_voice || row?.profile_voice || "thân thiện, ấm áp, chân thành như chủ quán",
  };
}

function sanitizeSettings(raw: unknown): MerchantSettings {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, unknown> = {};
  const shape = merchantSettingsSchema.shape;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(key in shape)) continue;
    const field = (shape as Record<string, z.ZodTypeAny>)[key];
    const ok = field.safeParse(value);
    if (ok.success) out[key] = ok.data;
  }
  return out as MerchantSettings;
}

export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
}

/** Tóm tắt dữ kiện đã được chủ quán xác nhận — đưa vào prompt để AI chỉ dựa trên dữ kiện này. */
export function factSheet(profile: MerchantProfile, options: { maxMenuItems?: number } = {}): string {
  const s = profile.settings;
  const lines: string[] = [`Tên quán: ${profile.businessName}`];
  if (s.address) lines.push(`Địa chỉ: ${s.address}`);
  if (s.phone) lines.push(`Hotline: ${s.phone}`);
  if (s.opening_hours) lines.push(`Giờ mở cửa: ${s.opening_hours.open}–${s.opening_hours.close}`);
  if (s.parking_note) lines.push(`Gửi xe: ${s.parking_note}`);
  const menu = (s.menu ?? []).slice(0, options.maxMenuItems ?? 40);
  if (menu.length > 0) {
    lines.push("Thực đơn (giá đã xác nhận):");
    for (const item of menu) {
      lines.push(`- ${item.name}${item.price_vnd !== undefined ? `: ${formatVnd(item.price_vnd)}` : ""}${item.description ? ` — ${item.description}` : ""}`);
    }
  }
  if (s.promotions?.length) {
    lines.push("Khuyến mãi đang chạy:");
    for (const p of s.promotions) lines.push(`- ${p.title}${p.detail ? `: ${p.detail}` : ""}${p.until ? ` (đến ${p.until})` : ""}`);
  }
  if (s.faq?.length) {
    lines.push("Hỏi đáp thường gặp:");
    for (const f of s.faq.slice(0, 20)) lines.push(`- H: ${f.question} | Đ: ${f.answer}`);
  }
  return lines.join("\n");
}

export function seoKeywords(profile: MerchantProfile): string[] {
  if (profile.settings.seo_keywords?.length) return profile.settings.seo_keywords;
  const city = profile.settings.city || "Đà Nẵng";
  const type = profile.settings.business_type;
  const base =
    type === "cafe" ? [`quán cà phê ${city}`, `cafe đẹp ${city}`]
      : type === "tour" ? [`tour ${city}`, `du lịch ${city}`]
        : [`quán ăn ngon ${city}`, `nhà hàng ${city}`];
  if (profile.settings.district) base.push(`${type === "cafe" ? "cafe" : "quán ăn"} ${profile.settings.district}`);
  return base;
}
