import type { Pool } from "pg";
import { z } from "zod";
import defaultPool from "../../lib/db";
import { AppError } from "../../lib/errors";
import { LlmUnavailableError, MultiLLMAdapterService, parseJsonReply } from "../ai/llmAdapter";
import { loadMerchantProfile, type MerchantProfile } from "../merchant/profile";
import { systemPromptFor } from "../merchant/prompts";

/**
 * Agent 3 — Content Planner: lịch nội dung tuần đa kênh, xếp vào khung giờ vàng ăn uống
 * (10:30–12:00 trưa, 17:00–19:30 tối, Asia/Ho_Chi_Minh), dùng ảnh thật đã được Agent 2 phân tích.
 * Mặc định mọi bài là bản nháp chờ chủ quán duyệt; chủ quán bật auto_publish_calendar thì tự duyệt.
 */
export type CalendarChannel = "facebook" | "instagram" | "google_maps" | "tiktok" | "facebook_group";
export type CalendarFormat = "photo_post" | "local_post" | "carousel_video" | "poll_post" | "minigame";

export interface CalendarEntry {
  id: string;
  workspace_id: string;
  week_start: string;
  scheduled_at: string;
  channel: CalendarChannel;
  format: CalendarFormat;
  asset_ids: string[];
  theme: string | null;
  caption: string;
  hashtags: string[];
  call_to_action: string | null;
  status: "draft" | "approved" | "publishing" | "published" | "failed" | "rejected";
  approved_at: string | null;
  published_at: string | null;
  external_post_id: string | null;
  error_message: string | null;
  generated_by: string | null;
  metadata: Record<string, unknown>;
}

interface SlotTemplate {
  channel: CalendarChannel;
  format: CalendarFormat;
  weekday: number; // 0 = Thứ Hai ... 6 = Chủ nhật
  time: string; // HH:MM giờ Việt Nam
  assets: number;
}

/** Lịch chuẩn cho quán nhỏ: đủ đều đặn mà không spam. */
export const WEEKLY_TEMPLATE: SlotTemplate[] = [
  { channel: "facebook", format: "photo_post", weekday: 0, time: "11:00", assets: 1 },
  { channel: "facebook", format: "photo_post", weekday: 1, time: "18:00", assets: 1 },
  { channel: "facebook", format: "photo_post", weekday: 2, time: "11:00", assets: 1 },
  { channel: "facebook", format: "photo_post", weekday: 3, time: "18:00", assets: 1 },
  { channel: "facebook", format: "photo_post", weekday: 4, time: "11:00", assets: 1 },
  { channel: "facebook", format: "photo_post", weekday: 5, time: "10:30", assets: 1 },
  { channel: "facebook", format: "photo_post", weekday: 6, time: "17:30", assets: 1 },
  { channel: "instagram", format: "photo_post", weekday: 1, time: "12:00", assets: 1 },
  { channel: "instagram", format: "photo_post", weekday: 3, time: "19:00", assets: 1 },
  { channel: "instagram", format: "photo_post", weekday: 5, time: "12:00", assets: 1 },
  { channel: "instagram", format: "photo_post", weekday: 6, time: "19:00", assets: 1 },
  { channel: "google_maps", format: "local_post", weekday: 2, time: "10:30", assets: 1 },
  { channel: "google_maps", format: "local_post", weekday: 5, time: "10:30", assets: 1 },
  { channel: "tiktok", format: "carousel_video", weekday: 0, time: "19:30", assets: 4 },
  { channel: "tiktok", format: "carousel_video", weekday: 2, time: "19:30", assets: 4 },
  { channel: "tiktok", format: "carousel_video", weekday: 4, time: "19:30", assets: 4 },
  { channel: "facebook_group", format: "minigame", weekday: 1, time: "20:00", assets: 1 },
  { channel: "facebook_group", format: "poll_post", weekday: 4, time: "20:00", assets: 2 },
];

/** Ngày đặc biệt (dương lịch) để gắn chủ đề bài viết. */
const SPECIAL_DAYS: Array<{ md: string; theme: string }> = [
  { md: "01-01", theme: "Tết Dương lịch" },
  { md: "02-14", theme: "Lễ Tình nhân" },
  { md: "03-08", theme: "Quốc tế Phụ nữ 8/3" },
  { md: "04-30", theme: "Lễ 30/4" },
  { md: "05-01", theme: "Quốc tế Lao động 1/5" },
  { md: "06-01", theme: "Quốc tế Thiếu nhi 1/6" },
  { md: "09-02", theme: "Quốc khánh 2/9" },
  { md: "10-20", theme: "Phụ nữ Việt Nam 20/10" },
  { md: "11-20", theme: "Nhà giáo Việt Nam 20/11" },
  { md: "12-24", theme: "Đêm Giáng sinh" },
  { md: "12-25", theme: "Giáng sinh" },
  { md: "12-31", theme: "Đêm Giao thừa dương lịch" },
];

const VN_OFFSET_MS = 7 * 3600_000;

/** Thứ Hai đầu tuần (YYYY-MM-DD, giờ VN) chứa thời điểm `at`. */
export function weekStartOf(at: Date): string {
  const local = new Date(at.getTime() + VN_OFFSET_MS);
  const weekday = (local.getUTCDay() + 6) % 7; // Thứ Hai = 0
  local.setUTCDate(local.getUTCDate() - weekday);
  return local.toISOString().slice(0, 10);
}

/** Thời điểm UTC của slot (giờ VN) trong tuần bắt đầu `weekStart`. */
export function slotInstant(weekStart: string, weekday: number, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const base = Date.parse(`${weekStart}T00:00:00Z`);
  return new Date(base + weekday * 86400_000 + (h * 60 + m) * 60_000 - VN_OFFSET_MS);
}

export function themeForDate(instant: Date, profile: MerchantProfile): string | null {
  const local = new Date(instant.getTime() + VN_OFFSET_MS);
  const md = local.toISOString().slice(5, 10);
  const day = SPECIAL_DAYS.find((d) => d.md === md);
  if (day) return day.theme;
  // Ngày đặc biệt sắp tới trong 3 ngày → bài "đếm ngược"
  for (let i = 1; i <= 3; i++) {
    const next = new Date(local.getTime() + i * 86400_000).toISOString().slice(5, 10);
    const upcoming = SPECIAL_DAYS.find((d) => d.md === next);
    if (upcoming) return `Chuẩn bị ${upcoming.theme}`;
  }
  const promo = profile.settings.promotions?.[0];
  return promo ? `Khuyến mãi: ${promo.title}` : null;
}

export interface ChannelAvailability {
  channels: CalendarChannel[];
  reasons: Partial<Record<CalendarChannel, string>>;
}

export async function availableChannels(db: Pick<Pool, "query">, profile: MerchantProfile): Promise<ChannelAvailability> {
  const channels: CalendarChannel[] = [];
  const reasons: ChannelAvailability["reasons"] = {};
  if (profile.links.fanpage || process.env.FACEBOOK_PAGE_ID) channels.push("facebook");
  else reasons.facebook = "Chưa có link Fanpage";
  if (process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim()) channels.push("instagram");
  else reasons.instagram = "Chưa liên kết tài khoản Instagram Business (INSTAGRAM_BUSINESS_ACCOUNT_ID)";
  if (profile.links.gmaps) channels.push("google_maps");
  else reasons.google_maps = "Chưa có link Google Maps";
  const tiktok = await db
    .query(`SELECT 1 FROM tiktok_oauth_tokens WHERE workspace_id = $1::uuid LIMIT 1`, [profile.workspaceId])
    .then((r) => r.rows.length > 0)
    .catch(() => false);
  if (tiktok || process.env.TIKTOK_ACCESS_TOKEN?.trim()) channels.push("tiktok");
  else reasons.tiktok = "Chưa kết nối TikTok";
  if (profile.links.group) channels.push("facebook_group");
  else reasons.facebook_group = "Chưa có link Group cộng đồng";
  return { channels, reasons };
}

const generatedSchema = z.object({
  posts: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      caption: z.string().trim().min(5).max(2200),
      hashtags: z.array(z.string().trim().min(2).max(60)).max(10).default([]),
      call_to_action: z.string().trim().max(200).nullable().optional(),
    }),
  ),
});

interface PlannedSlot {
  template: SlotTemplate;
  scheduledAt: Date;
  assets: Array<{ id: string; dish_name: string | null; flavor_notes: string | null; generated_caption: string | null; asset_type: string }>;
  theme: string | null;
}

function normalizeHashtag(tag: string): string {
  const clean = tag.replace(/^#+/, "").replace(/\s+/g, "");
  return clean ? `#${clean}` : "";
}

function templateCaption(slot: PlannedSlot, profile: MerchantProfile): { caption: string; hashtags: string[]; cta: string } {
  const a = slot.assets[0];
  const base = a?.generated_caption || (a?.dish_name ? `${a.dish_name} đang chờ bạn tại ${profile.businessName}.` : `Hôm nay ghé ${profile.businessName} nhé!`);
  const theme = slot.theme ? `${slot.theme} — ` : "";
  const cta = slot.template.channel === "google_maps" ? "Đặt bàn ngay" : "Nhắn tin cho quán để giữ bàn";
  switch (slot.template.format) {
    case "minigame":
      return { caption: `${theme}Mini game tuần này: đoán tên món trong ảnh, bình luận đáp án và tag 1 người bạn muốn đi ăn cùng!`, hashtags: [], cta: "Bình luận đáp án" };
    case "poll_post":
      return { caption: `${theme}Bình chọn món bạn muốn ăn nhất cuối tuần này: thả ❤️ cho món 1, 😆 cho món 2!`, hashtags: [], cta: "Thả cảm xúc để bình chọn" };
    default:
      return { caption: `${theme}${base}`, hashtags: [], cta };
  }
}

function mapRow(row: any): CalendarEntry {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    week_start: typeof row.week_start === "string" ? row.week_start.slice(0, 10) : new Date(row.week_start).toISOString().slice(0, 10),
    scheduled_at: new Date(row.scheduled_at).toISOString(),
    channel: row.channel,
    format: row.format,
    asset_ids: row.asset_ids ?? [],
    theme: row.theme ?? null,
    caption: row.caption,
    hashtags: row.hashtags ?? [],
    call_to_action: row.call_to_action ?? null,
    status: row.status,
    approved_at: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
    external_post_id: row.external_post_id ?? null,
    error_message: row.error_message ?? null,
    generated_by: row.generated_by ?? null,
    metadata: row.metadata ?? {},
  };
}

export class ContentPlannerService {
  constructor(
    private readonly db: Pick<Pool, "query"> = defaultPool,
    private readonly llm: MultiLLMAdapterService = new MultiLLMAdapterService(db),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listWeek(workspaceId: string, weekStart?: string): Promise<{ week_start: string; entries: CalendarEntry[] }> {
    const week = weekStart ?? weekStartOf(this.now());
    const res = await this.db.query(
      `SELECT * FROM content_calendar_entries WHERE workspace_id = $1::uuid AND week_start = $2::date ORDER BY scheduled_at, channel`,
      [workspaceId, week],
    );
    return { week_start: week, entries: res.rows.map(mapRow) };
  }

  /**
   * Lập lịch cho tuần `weekStart` (mặc định tuần sau nếu hôm nay là Chủ nhật, ngược lại tuần này).
   * Idempotent: slot đã có bài thì giữ nguyên, chỉ thêm slot còn trống và chưa qua.
   */
  async generateWeek(workspaceId: string, weekStart?: string): Promise<{ week_start: string; created: number; skipped_past: number; channels: ChannelAvailability; generated_by: string; entries: CalendarEntry[] }> {
    const now = this.now();
    const localDay = (new Date(now.getTime() + VN_OFFSET_MS).getUTCDay() + 6) % 7;
    const week = weekStart ?? (localDay === 6 ? weekStartOf(new Date(now.getTime() + 86400_000)) : weekStartOf(now));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) throw new AppError(422, "INVALID_WEEK", "week_start phải có dạng YYYY-MM-DD (Thứ Hai)");
    const profile = await loadMerchantProfile(this.db, workspaceId);
    const availability = await availableChannels(this.db, profile);
    if (availability.channels.length === 0) {
      throw new AppError(409, "NO_CHANNELS", "Chưa có kênh nào được kết nối để lập lịch (Fanpage, Google Maps, Instagram, TikTok, Group)");
    }
    const existing = new Set(
      (
        await this.db.query(`SELECT channel, scheduled_at FROM content_calendar_entries WHERE workspace_id = $1::uuid AND week_start = $2::date`, [workspaceId, week])
      ).rows.map((r) => `${r.channel}@${new Date(r.scheduled_at).toISOString()}`),
    );
    const assets = (
      await this.db.query(
        `SELECT a.id, a.dish_name, a.flavor_notes, a.generated_caption, a.asset_type,
                (SELECT COUNT(*) FROM content_calendar_entries c WHERE c.workspace_id = a.workspace_id AND a.id = ANY(c.asset_ids))::int AS used
           FROM drive_asset_queue a
          WHERE a.workspace_id = $1::uuid AND a.status IN ('staged', 'scheduled', 'published') AND a.asset_type <> 'logo'
          ORDER BY used ASC, a.drive_modified_at DESC NULLS LAST LIMIT 60`,
        [workspaceId],
      )
    ).rows;

    let skippedPast = 0;
    let cursor = 0;
    const slots: PlannedSlot[] = [];
    for (const template of WEEKLY_TEMPLATE) {
      if (!availability.channels.includes(template.channel)) continue;
      const scheduledAt = slotInstant(week, template.weekday, template.time);
      if (scheduledAt.getTime() < now.getTime() + 30 * 60_000) {
        skippedPast++;
        continue;
      }
      if (existing.has(`${template.channel}@${scheduledAt.toISOString()}`)) continue;
      const needsPhoto = template.format === "photo_post" || template.format === "local_post" || template.format === "carousel_video";
      if (needsPhoto && assets.length < (template.format === "carousel_video" ? 3 : 1) && template.channel !== "facebook") {
        // Instagram/ Maps/ TikTok bắt buộc có ảnh thật; chưa đủ ảnh thì không lập slot đó.
        continue;
      }
      const picked = [];
      for (let i = 0; i < Math.min(template.assets, assets.length); i++) {
        picked.push(assets[cursor % assets.length]);
        cursor++;
      }
      slots.push({ template, scheduledAt, assets: picked, theme: themeForDate(scheduledAt, profile) });
    }
    if (slots.length === 0) {
      return { created: 0, skipped_past: skippedPast, channels: availability, generated_by: "none", ...(await this.listWeek(workspaceId, week)) };
    }

    let generated: z.infer<typeof generatedSchema>["posts"] = [];
    let generatedBy = "template";
    try {
      const reply = await this.llm.generate(workspaceId, {
        agent: "content_planner",
        system: systemPromptFor("content_planner", profile),
        prompt: `Viết nội dung cho ${slots.length} bài trong lịch tuần ${week}. Trả về JSON {"posts":[{"index":number,"caption":string,"hashtags":string[],"call_to_action":string}]}, mỗi slot đúng 1 phần tử, giữ nguyên index.
${slots
  .map(
    (s, i) =>
      `#${i} | kênh=${s.template.channel} | dạng=${s.template.format} | giờ=${s.template.time} ${["T2", "T3", "T4", "T5", "T6", "T7", "CN"][s.template.weekday]}${s.theme ? ` | chủ đề=${s.theme}` : ""} | ảnh=${
        s.assets.map((a) => `${a.dish_name ?? a.asset_type}${a.flavor_notes ? ` (${a.flavor_notes})` : ""}`).join("; ") || "không có"
      }`,
  )
  .join("\n")}`,
        json: true,
        maxTokens: 3500,
        timeoutMs: 60_000,
        billable: true,
      });
      const parsed = generatedSchema.safeParse(parseJsonReply(reply.text));
      if (parsed.success) {
        generated = parsed.data.posts;
        generatedBy = reply.provider_used;
      }
    } catch (err) {
      // LLM không khả dụng: vẫn lập lịch bằng caption mà Agent 2 đã viết cho từng ảnh (đánh dấu 'template').
      if (!(err instanceof LlmUnavailableError) && !(err instanceof AppError && ["LLM_NOT_CONFIGURED", "INSUFFICIENT_CREDITS"].includes(err.code))) throw err;
    }

    const autoApprove = profile.settings.auto_publish_calendar === true;
    let created = 0;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const fromLlm = generated.find((g) => g.index === i);
      const fallback = templateCaption(slot, profile);
      const res = await this.db.query(
        `INSERT INTO content_calendar_entries (workspace_id, week_start, scheduled_at, channel, format, asset_ids, theme, caption,
                                               hashtags, call_to_action, status, approved_at, generated_by)
         VALUES ($1::uuid, $2::date, $3, $4, $5, $6::uuid[], $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (workspace_id, channel, scheduled_at) DO NOTHING RETURNING id`,
        [
          workspaceId,
          week,
          slot.scheduledAt.toISOString(),
          slot.template.channel,
          slot.template.format,
          slot.assets.map((a) => a.id),
          slot.theme,
          fromLlm?.caption ?? fallback.caption,
          (fromLlm?.hashtags ?? fallback.hashtags).map(normalizeHashtag).filter(Boolean),
          fromLlm?.call_to_action ?? fallback.cta,
          autoApprove ? "approved" : "draft",
          autoApprove ? now.toISOString() : null,
          fromLlm ? generatedBy : "template",
        ],
      );
      if (res.rows.length > 0) created++;
    }
    if (created > 0) {
      await this.db.query(
        `UPDATE drive_asset_queue SET status = 'scheduled', updated_at = NOW()
          WHERE workspace_id = $1::uuid AND status = 'staged'
            AND id IN (SELECT unnest(asset_ids) FROM content_calendar_entries WHERE workspace_id = $1::uuid AND week_start = $2::date)`,
        [workspaceId, week],
      );
    }
    return { created, skipped_past: skippedPast, channels: availability, generated_by: generatedBy, ...(await this.listWeek(workspaceId, week)) };
  }

  async getEntry(workspaceId: string, entryId: string): Promise<CalendarEntry> {
    const row = (await this.db.query(`SELECT * FROM content_calendar_entries WHERE workspace_id = $1::uuid AND id = $2::uuid`, [workspaceId, entryId])).rows[0];
    if (!row) throw new AppError(404, "CALENDAR_ENTRY_NOT_FOUND", "Không tìm thấy bài trong lịch");
    return mapRow(row);
  }

  async updateEntry(
    workspaceId: string,
    entryId: string,
    patch: { caption?: string; hashtags?: string[]; scheduled_at?: string; call_to_action?: string | null },
  ): Promise<CalendarEntry> {
    const entry = await this.getEntry(workspaceId, entryId);
    if (["publishing", "published"].includes(entry.status)) throw new AppError(409, "ENTRY_LOCKED", "Bài đã/ đang đăng, không sửa được");
    if (patch.scheduled_at && Date.parse(patch.scheduled_at) < this.now().getTime()) throw new AppError(422, "SCHEDULE_IN_PAST", "Không thể hẹn giờ trong quá khứ");
    // Sửa nội dung bài đã duyệt → quay lại bản nháp để chủ quán duyệt lại đúng nội dung mới.
    const res = await this.db.query(
      `UPDATE content_calendar_entries
          SET caption = COALESCE($3, caption), hashtags = COALESCE($4, hashtags), scheduled_at = COALESCE($5::timestamptz, scheduled_at),
              call_to_action = CASE WHEN $6::boolean THEN $7 ELSE call_to_action END,
              status = CASE WHEN status IN ('approved', 'failed', 'rejected') THEN 'draft' ELSE status END,
              approved_at = NULL, approved_by = NULL, error_message = NULL, updated_at = NOW()
        WHERE workspace_id = $1::uuid AND id = $2::uuid RETURNING *`,
      [
        workspaceId,
        entryId,
        patch.caption?.trim() ?? null,
        patch.hashtags ? patch.hashtags.map(normalizeHashtag).filter(Boolean) : null,
        patch.scheduled_at ?? null,
        patch.call_to_action !== undefined,
        patch.call_to_action ?? null,
      ],
    );
    return mapRow(res.rows[0]);
  }

  async review(workspaceId: string, entryIds: string[], decision: "approve" | "reject", actorId: string): Promise<CalendarEntry[]> {
    if (entryIds.length === 0) return [];
    const res = await this.db.query(
      `UPDATE content_calendar_entries
          SET status = $3::text, approved_by = CASE WHEN $3::text = 'approved' THEN $4::uuid ELSE NULL END,
              approved_at = CASE WHEN $3::text = 'approved' THEN NOW() ELSE NULL END,
              metadata = metadata - 'attempts' - 'next_attempt_at', error_message = NULL, updated_at = NOW()
        WHERE workspace_id = $1::uuid AND id = ANY($2::uuid[]) AND status IN ('draft', 'failed', 'approved', 'rejected')
        RETURNING *`,
      [workspaceId, entryIds, decision === "approve" ? "approved" : "rejected", actorId],
    );
    return res.rows.map(mapRow);
  }

  /** Đưa một ảnh vào slot gần nhất còn trống của các kênh được chọn (bản nháp). */
  async scheduleAsset(workspaceId: string, assetId: string, channels: CalendarChannel[]): Promise<CalendarEntry[]> {
    const asset = (await this.db.query(`SELECT * FROM drive_asset_queue WHERE workspace_id = $1::uuid AND id = $2::uuid`, [workspaceId, assetId])).rows[0];
    if (!asset) throw new AppError(404, "ASSET_NOT_FOUND", "Không tìm thấy ảnh");
    if (asset.status === "rejected") throw new AppError(409, "ASSET_REJECTED", asset.error_message ?? "Ảnh không đạt chất lượng để đăng");
    const profile = await loadMerchantProfile(this.db, workspaceId);
    const availability = await availableChannels(this.db, profile);
    const now = this.now();
    const created: CalendarEntry[] = [];
    for (const channel of channels) {
      if (!availability.channels.includes(channel)) throw new AppError(409, "CHANNEL_NOT_CONNECTED", availability.reasons[channel] ?? `Kênh ${channel} chưa kết nối`);
      const templates = WEEKLY_TEMPLATE.filter((t) => t.channel === channel && t.format !== "carousel_video" && t.format !== "poll_post" && t.format !== "minigame");
      let placed = false;
      for (let weekOffset = 0; weekOffset < 3 && !placed; weekOffset++) {
        const week = weekStartOf(new Date(now.getTime() + weekOffset * 7 * 86400_000));
        for (const t of templates) {
          const at = slotInstant(week, t.weekday, t.time);
          if (at.getTime() < now.getTime() + 30 * 60_000) continue;
          const fallback = templateCaption({ template: t, scheduledAt: at, assets: [asset], theme: themeForDate(at, profile) }, profile);
          const res = await this.db.query(
            `INSERT INTO content_calendar_entries (workspace_id, week_start, scheduled_at, channel, format, asset_ids, theme, caption, call_to_action, status, generated_by)
             VALUES ($1::uuid, $2::date, $3, $4, $5, ARRAY[$6]::uuid[], $7, $8, $9, 'draft', 'asset_caption')
             ON CONFLICT (workspace_id, channel, scheduled_at) DO NOTHING RETURNING *`,
            [workspaceId, week, at.toISOString(), channel, t.format, assetId, themeForDate(at, profile), fallback.caption, fallback.cta],
          );
          if (res.rows.length > 0) {
            created.push(mapRow(res.rows[0]));
            placed = true;
            break;
          }
        }
      }
    }
    if (created.length > 0) {
      await this.db.query(`UPDATE drive_asset_queue SET status = 'scheduled', updated_at = NOW() WHERE workspace_id = $1::uuid AND id = $2::uuid AND status = 'staged'`, [workspaceId, assetId]);
    }
    return created;
  }
}
