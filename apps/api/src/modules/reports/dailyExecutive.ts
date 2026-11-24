import type { Pool } from "pg";
import defaultPool from "../../lib/db";
import { AppError } from "../../lib/errors";
import { LlmUnavailableError, MultiLLMAdapterService } from "../ai/llmAdapter";
import { loadMerchantProfile, type MerchantProfile } from "../merchant/profile";
import { systemPromptFor } from "../merchant/prompts";
import { ownerTelegramChat, sendEmail, sendTelegramText, type DeliveryResult } from "../merchant/notify";

/**
 * Agent 1 — AI Growth Lead: Báo cáo Tổng kết Ngày (Daily Executive Report).
 * Mọi con số được đếm trực tiếp từ DB trong ngày (giờ Việt Nam). AI chỉ viết lời tóm tắt dựa trên
 * các con số đó; khi LLM không khả dụng thì dùng mẫu cố định — không có số liệu ước đoán.
 */
export interface DailyMetrics {
  date: string; // YYYY-MM-DD (giờ VN)
  posts_published: number;
  posts_published_by_channel: Record<string, number>;
  posts_failed: number;
  posts_awaiting_approval: number;
  comments_received: number;
  comments_replied: number;
  comments_escalated: number;
  comment_median_reply_minutes: number | null;
  dms_received: number;
  dms_replied: number;
  booking_requests_new: number;
  booking_guests_new: number;
  bookings_pending_confirmation: number;
  bookings_today_confirmed: number;
  guests_today_confirmed: number;
  gmaps_new_reviews: number;
  gmaps_replies_published: number;
  gmaps_awaiting_approval: number;
  gmaps_average_rating: number | null;
  drive_assets_ingested: number;
  drive_assets_ready: number;
  community_members: number | null;
  community_members_delta: number | null;
  llm_calls: number;
  llm_failures: number;
  llm_switches: number;
  credits_used: number;
  wallet_balance_credits: number | null;
}

export interface DailyReport {
  workspace_id: string;
  report_date: string;
  metrics: DailyMetrics;
  summary_markdown: string;
  summary_source: string;
  delivery: Record<string, unknown>;
  created_at: string;
}

const VN_OFFSET_MS = 7 * 3600_000;

export function vnDate(at: Date): string {
  return new Date(at.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function n(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export async function computeDailyMetrics(db: Pick<Pool, "query">, workspaceId: string, date: string): Promise<DailyMetrics> {
  // Khoảng [00:00, 24:00) giờ VN của `date`, dạng UTC.
  const from = new Date(Date.parse(`${date}T00:00:00Z`) - VN_OFFSET_MS).toISOString();
  const to = new Date(Date.parse(`${date}T00:00:00Z`) - VN_OFFSET_MS + 86400_000).toISOString();
  const p = [workspaceId, from, to];
  const q = async (sql: string) => (await db.query(sql, p)).rows[0] ?? {};

  const [posts, byChannel, comments, dms, bookings, gmaps, drive, llm, wallet, members, profile] = await Promise.all([
    q(`SELECT COUNT(*) FILTER (WHERE status = 'published' AND published_at >= $2 AND published_at < $3) AS published,
              COUNT(*) FILTER (WHERE status = 'failed' AND updated_at >= $2 AND updated_at < $3) AS failed,
              COUNT(*) FILTER (WHERE status = 'draft' AND scheduled_at >= $2) AS awaiting
         FROM content_calendar_entries WHERE workspace_id = $1::uuid`),
    db.query(
      `SELECT channel, COUNT(*)::int AS c FROM content_calendar_entries
        WHERE workspace_id = $1::uuid AND status = 'published' AND published_at >= $2 AND published_at < $3 GROUP BY channel`,
      p,
    ),
    q(`SELECT COUNT(*) FILTER (WHERE received_at >= $2 AND received_at < $3) AS received,
              COUNT(*) FILTER (WHERE status = 'replied' AND updated_at >= $2 AND updated_at < $3) AS replied,
              COUNT(*) FILTER (WHERE status = 'escalated' AND updated_at >= $2 AND updated_at < $3) AS escalated,
              PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ((metadata->>'replied_at')::timestamptz - received_at)) / 60.0)
                FILTER (WHERE status = 'replied' AND metadata ? 'replied_at' AND updated_at >= $2 AND updated_at < $3) AS median_minutes
         FROM community_messages WHERE workspace_id = $1::uuid AND platform IN ('facebook_comment', 'instagram_comment')`),
    q(`SELECT COUNT(*) FILTER (WHERE received_at >= $2 AND received_at < $3) AS received,
              COUNT(*) FILTER (WHERE status = 'replied' AND updated_at >= $2 AND updated_at < $3) AS replied
         FROM community_messages WHERE workspace_id = $1::uuid AND platform IN ('facebook_message', 'instagram_message', 'zalo_message', 'telegram_message')`),
    q(`SELECT COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $3) AS new_requests,
              COALESCE(SUM(party_size) FILTER (WHERE created_at >= $2 AND created_at < $3), 0) AS new_guests,
              COUNT(*) FILTER (WHERE status = 'pending' AND booking_time >= NOW()) AS pending,
              COUNT(*) FILTER (WHERE status IN ('confirmed', 'completed') AND booking_time >= $2 AND booking_time < $3) AS today_confirmed,
              COALESCE(SUM(party_size) FILTER (WHERE status IN ('confirmed', 'completed') AND booking_time >= $2 AND booking_time < $3), 0) AS today_guests
         FROM booking_leads WHERE workspace_id = $1::uuid`),
    q(`SELECT COUNT(*) FILTER (WHERE item_type = 'review' AND created_at >= $2 AND created_at < $3 AND reply_source IS DISTINCT FROM 'google_existing') AS new_reviews,
              COUNT(*) FILTER (WHERE item_type = 'review' AND replied_at >= $2 AND replied_at < $3 AND reply_source IN ('auto', 'owner_approved', 'owner_manual')) AS replies,
              COUNT(*) FILTER (WHERE item_type = 'review' AND status = 'needs_approval') AS awaiting
         FROM gmaps_reputation WHERE workspace_id = $1::uuid`),
    q(`SELECT COUNT(*) FILTER (WHERE created_at >= $2 AND created_at < $3 AND asset_type <> 'logo') AS ingested,
              COUNT(*) FILTER (WHERE status = 'staged') AS ready
         FROM drive_asset_queue WHERE workspace_id = $1::uuid`),
    q(`SELECT COUNT(*) FILTER (WHERE ok) AS calls, COUNT(*) FILTER (WHERE NOT ok) AS failures,
              COUNT(*) FILTER (WHERE ok AND switched_from IS NOT NULL) AS switches, COALESCE(SUM(credits_charged), 0) AS credits
         FROM llm_usage_events WHERE workspace_id = $1::uuid AND created_at >= $2 AND created_at < $3`),
    db.query(`SELECT balance_credits FROM merchant_wallet WHERE workspace_id = $1::uuid`, [workspaceId]),
    db.query(
      `SELECT
         (SELECT group_member_count FROM community_member_snapshots WHERE workspace_id = $1::uuid AND captured_at < $3 ORDER BY captured_at DESC LIMIT 1) AS latest,
         (SELECT group_member_count FROM community_member_snapshots WHERE workspace_id = $1::uuid AND captured_at < $2 ORDER BY captured_at DESC LIMIT 1) AS previous`,
      p,
    ),
    loadMerchantProfile(db, workspaceId),
  ]);
  const channelCounts: Record<string, number> = {};
  for (const row of byChannel.rows) channelCounts[row.channel] = n(row.c);
  const latest = members.rows[0]?.latest;
  const previous = members.rows[0]?.previous;
  const gbp = (profile.parsedRefs.gbp ?? {}) as { average_rating?: number };
  return {
    date,
    posts_published: n(posts.published),
    posts_published_by_channel: channelCounts,
    posts_failed: n(posts.failed),
    posts_awaiting_approval: n(posts.awaiting),
    comments_received: n(comments.received),
    comments_replied: n(comments.replied),
    comments_escalated: n(comments.escalated),
    comment_median_reply_minutes: comments.median_minutes === null || comments.median_minutes === undefined ? null : Math.round(n(comments.median_minutes) * 10) / 10,
    dms_received: n(dms.received),
    dms_replied: n(dms.replied),
    booking_requests_new: n(bookings.new_requests),
    booking_guests_new: n(bookings.new_guests),
    bookings_pending_confirmation: n(bookings.pending),
    bookings_today_confirmed: n(bookings.today_confirmed),
    guests_today_confirmed: n(bookings.today_guests),
    gmaps_new_reviews: n(gmaps.new_reviews),
    gmaps_replies_published: n(gmaps.replies),
    gmaps_awaiting_approval: n(gmaps.awaiting),
    gmaps_average_rating: typeof gbp.average_rating === "number" ? gbp.average_rating : null,
    drive_assets_ingested: n(drive.ingested),
    drive_assets_ready: n(drive.ready),
    community_members: latest === null || latest === undefined ? null : n(latest),
    community_members_delta: latest !== null && latest !== undefined && previous !== null && previous !== undefined ? n(latest) - n(previous) : null,
    llm_calls: n(llm.calls),
    llm_failures: n(llm.failures),
    llm_switches: n(llm.switches),
    credits_used: n(llm.credits),
    wallet_balance_credits: wallet.rows[0] ? n(wallet.rows[0].balance_credits) : null,
  };
}

/** Báo cáo dạng mẫu (không cần LLM) — vẫn là số liệu thật. */
export function templateSummary(profile: MerchantProfile, m: DailyMetrics): string {
  const [y, mo, d] = m.date.split("-");
  const channels = Object.entries(m.posts_published_by_channel)
    .map(([c, v]) => `${c} ${v}`)
    .join(", ");
  const lines = [
    `📊 Báo cáo ngày ${d}/${mo}/${y} — ${profile.businessName}`,
    "",
    `• Bài đã đăng: ${m.posts_published}${channels ? ` (${channels})` : ""}${m.posts_failed ? ` · lỗi ${m.posts_failed}` : ""}`,
    `• Bình luận: nhận ${m.comments_received}, AI đã trả lời ${m.comments_replied}${m.comment_median_reply_minutes !== null ? ` (trung vị ${m.comment_median_reply_minutes} phút)` : ""}${m.comments_escalated ? `, ${m.comments_escalated} cần anh/chị xử lý` : ""}`,
    `• Tin nhắn riêng: nhận ${m.dms_received}, đã trả lời ${m.dms_replied}`,
    `• Đặt bàn mới: ${m.booking_requests_new} (${m.booking_guests_new} khách)${m.bookings_pending_confirmation ? ` · ${m.bookings_pending_confirmation} đang chờ xác nhận` : ""}`,
    `• Google Maps: ${m.gmaps_new_reviews} review mới, đã trả lời ${m.gmaps_replies_published}${m.gmaps_average_rating !== null ? `, điểm ${m.gmaps_average_rating}★` : ""}${m.gmaps_awaiting_approval ? `, ${m.gmaps_awaiting_approval} chờ duyệt` : ""}`,
    `• Ảnh mới từ Drive: ${m.drive_assets_ingested} (sẵn sàng đăng: ${m.drive_assets_ready})`,
  ];
  if (m.community_members !== null) {
    lines.push(`• Cộng đồng: ${m.community_members} thành viên${m.community_members_delta !== null ? ` (${m.community_members_delta >= 0 ? "+" : ""}${m.community_members_delta} hôm nay)` : ""}`);
  }
  if (m.wallet_balance_credits !== null) lines.push(`• Ví AI: dùng ${m.credits_used} credit, còn ${m.wallet_balance_credits}`);
  const todo: string[] = [];
  if (m.bookings_pending_confirmation) todo.push(`Xác nhận ${m.bookings_pending_confirmation} đặt bàn đang chờ`);
  if (m.gmaps_awaiting_approval) todo.push(`Duyệt ${m.gmaps_awaiting_approval} trả lời review Google Maps`);
  if (m.comments_escalated) todo.push(`Xử lý ${m.comments_escalated} bình luận tiêu cực`);
  if (m.posts_awaiting_approval) todo.push(`Duyệt ${m.posts_awaiting_approval} bài trong lịch đăng`);
  if (m.drive_assets_ready < 3) todo.push("Chụp thêm ảnh món thật và bỏ vào thư mục Drive");
  if (todo.length) {
    lines.push("", "Việc cho ngày mai:");
    todo.slice(0, 3).forEach((t, i) => lines.push(`${i + 1}. ${t}`));
  }
  return lines.join("\n");
}

function toHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;white-space:pre-wrap">${esc}</div>`;
}

export class DailyExecutiveReportService {
  constructor(
    private readonly db: Pick<Pool, "query"> = defaultPool,
    private readonly llm: MultiLLMAdapterService = new MultiLLMAdapterService(db),
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** useLlm=false: bản xem trước chỉ dùng mẫu (không tốn lượt gọi AI mỗi lần mở trang). */
  async build(workspaceId: string, date: string = vnDate(this.now()), options: { useLlm?: boolean } = {}): Promise<{ metrics: DailyMetrics; summary: string; source: string; profile: MerchantProfile }> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(422, "INVALID_DATE", "date phải có dạng YYYY-MM-DD");
    const [metrics, profile] = await Promise.all([computeDailyMetrics(this.db, workspaceId, date), loadMerchantProfile(this.db, workspaceId)]);
    let summary = templateSummary(profile, metrics);
    let source = "template";
    if (options.useLlm === false) return { metrics, summary, source, profile };
    try {
      const reply = await this.llm.generate(workspaceId, {
        agent: "growth_lead",
        system: systemPromptFor("growth_lead", profile),
        prompt: `Số liệu ngày ${metrics.date} (JSON, chỉ dùng đúng các số này):\n${JSON.stringify(metrics)}\n\nViết báo cáo cho chủ quán đọc trên điện thoại (tối đa 1200 ký tự, dùng emoji vừa phải, không dùng markdown bảng).`,
        maxTokens: 900,
        billable: false, // báo cáo hệ thống, không trừ ví của quán
      });
      summary = reply.text.trim().slice(0, 3500);
      source = reply.provider_used;
    } catch (err) {
      if (!(err instanceof LlmUnavailableError) && !(err instanceof AppError && ["LLM_NOT_CONFIGURED", "INSUFFICIENT_CREDITS"].includes(err.code))) throw err;
    }
    return { metrics, summary, source, profile };
  }

  /** Lập + lưu + gửi báo cáo; idempotent theo (workspace, ngày): đã gửi thành công thì không gửi lại. */
  async generateAndDeliver(workspaceId: string, date?: string, options: { force?: boolean } = {}): Promise<DailyReport> {
    const reportDate = date ?? vnDate(this.now());
    const existing = await this.getReport(workspaceId, reportDate);
    const alreadySent = existing && (existing.delivery as Record<string, { status?: string }>).telegram?.status === "sent";
    if (existing && alreadySent && !options.force) return existing;
    const { metrics, summary, source, profile } = await this.build(workspaceId, reportDate);
    const telegram: DeliveryResult = await sendTelegramText(ownerTelegramChat(profile), summary);
    const email: DeliveryResult = await sendEmail(profile.settings.report_email, `Báo cáo ngày ${reportDate} — ${profile.businessName}`, toHtml(summary));
    const delivery = { telegram, email, delivered_at: new Date().toISOString() };
    const row = (
      await this.db.query(
        `INSERT INTO daily_executive_reports (workspace_id, report_date, metrics, summary_markdown, summary_source, delivery)
         VALUES ($1::uuid, $2::date, $3::jsonb, $4, $5, $6::jsonb)
         ON CONFLICT (workspace_id, report_date) DO UPDATE
           SET metrics = EXCLUDED.metrics, summary_markdown = EXCLUDED.summary_markdown, summary_source = EXCLUDED.summary_source,
               delivery = EXCLUDED.delivery, created_at = NOW()
         RETURNING *`,
        [workspaceId, reportDate, JSON.stringify(metrics), summary, source, JSON.stringify(delivery)],
      )
    ).rows[0];
    return this.mapRow(row);
  }

  async getReport(workspaceId: string, date: string): Promise<DailyReport | null> {
    const row = (await this.db.query(`SELECT * FROM daily_executive_reports WHERE workspace_id = $1::uuid AND report_date = $2::date`, [workspaceId, date])).rows[0];
    return row ? this.mapRow(row) : null;
  }

  async listReports(workspaceId: string, limit = 14): Promise<DailyReport[]> {
    const rows = (await this.db.query(`SELECT * FROM daily_executive_reports WHERE workspace_id = $1::uuid ORDER BY report_date DESC LIMIT $2`, [workspaceId, limit])).rows;
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: any): DailyReport {
    return {
      workspace_id: row.workspace_id,
      report_date: typeof row.report_date === "string" ? row.report_date.slice(0, 10) : vnDate(new Date(row.report_date)),
      metrics: row.metrics,
      summary_markdown: row.summary_markdown,
      summary_source: row.summary_source,
      delivery: row.delivery ?? {},
      created_at: new Date(row.created_at).toISOString(),
    };
  }
}
