import type { Pool } from "pg";
import { z } from "zod";
import defaultPool from "../../lib/db";
import { AppError } from "../../lib/errors";
import { parseDriveFolderId } from "../google/drive";
import { googleOAuthConfigured } from "../google/oauth";
import { loadMerchantProfile, merchantSettingsSchema, type MerchantSettings } from "../merchant/profile";
import type { MerchantAgentId } from "../merchant/prompts";

/**
 * Zero-Tech Onboarding: chủ quán dán 4 link (Fanpage, Google Maps, Google Drive, Group) và bấm Kích hoạt.
 * Hệ thống kiểm tra link, lưu, rồi xếp lịch cho 8 agent chạy ngay ở nhịp worker kế tiếp.
 * Trạng thái từng agent phản ánh đúng việc đã kết nối hay chưa — không hiển thị "đang chạy" khi thiếu kết nối.
 */
const fanpageRe = /^https?:\/\/(www\.|m\.|web\.)?(facebook|fb)\.com\/(?!groups\/)[^\s/?#]+/i;
const gmapsRe = /^https?:\/\/((www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|g\.page)\//i;
const driveRe = /^https?:\/\/drive\.google\.com\//i;
const groupRe = /^https?:\/\/((www\.|m\.)?facebook\.com\/groups\/[^\s/?#]+|zalo\.me\/g\/[^\s/?#]+)/i;

export const activateSchema = z
  .object({
    business_name: z.string().trim().min(2).max(255),
    fanpage_url: z.string().trim().regex(fanpageRe, "Link Fanpage phải có dạng https://facebook.com/ten-trang"),
    gmaps_url: z.string().trim().regex(gmapsRe, "Link Google Maps phải là link chia sẻ từ Google Maps"),
    gdrive_url: z
      .string()
      .trim()
      .regex(driveRe, "Link Google Drive phải bắt đầu bằng https://drive.google.com/")
      .refine((v) => parseDriveFolderId(v) !== null, "Không đọc được ID thư mục — hãy dán link thư mục (…/drive/folders/…)"),
    community_group_url: z.union([z.string().trim().regex(groupRe, "Link Group phải là Group Facebook hoặc nhóm Zalo (zalo.me/g/…)"), z.literal("")]).optional(),
    business_type: z.enum(["restaurant", "cafe", "bar", "street_food", "tour", "homestay", "other"]).default("restaurant"),
  })
  .strict();

export type AgentReadiness = "active" | "needs_connection" | "not_activated";

export interface AgentStatus {
  id: string;
  name: MerchantAgentId;
  role: string;
  status: AgentReadiness;
  detail: string;
  last_run_at: string | null;
  last_run_status: string | null;
}

export interface OnboardingState {
  workspace_id: string;
  business_name: string | null;
  business_type: string;
  fanpage_url: string | null;
  gmaps_url: string | null;
  gdrive_url: string | null;
  community_group_url: string | null;
  onboarding_completed: boolean;
  activated_at: string | null;
  welcome_message: string | null;
  settings: MerchantSettings;
  active_agents: AgentStatus[];
  updated_at: string | null;
}

const AGENTS: Array<{ id: string; name: MerchantAgentId; role: string }> = [
  { id: "agent_1", name: "growth_lead", role: "AI Growth Lead — điều phối & báo cáo ngày" },
  { id: "agent_2", name: "asset_manager", role: "Chuyên viên tư liệu — quét ảnh Google Drive" },
  { id: "agent_3", name: "content_planner", role: "Chuyên viên kế hoạch — lịch đăng đa kênh" },
  { id: "agent_4", name: "publisher", role: "Chuyên viên xuất bản — Facebook, Instagram, Maps, TikTok" },
  { id: "agent_5", name: "gmaps_specialist", role: "Chuyên gia Google Maps — review & Local Post" },
  { id: "agent_6", name: "comment_reply", role: "Chuyên viên trả lời bình luận công khai" },
  { id: "agent_7", name: "inbox_concierge", role: "Trợ lý tư vấn & đặt bàn qua tin nhắn" },
  { id: "agent_8", name: "community_growth", role: "Chuyên viên phát triển cộng đồng Group/ Zalo" },
];

export function welcomeMessage(businessName: string): string {
  return (
    `Xin chào Ông Chủ ${businessName}! Tôi là AI Growth Lead phụ trách chiến lược tiếp thị cho quán. ` +
    "Tôi đã phân bổ nhiệm vụ cho 7 chuyên viên AI: quét ảnh món thật trong Drive, lập lịch đăng bài theo khung giờ vàng, " +
    "trả lời review Google Maps, bình luận và tin nhắn đặt bàn, nuôi cộng đồng khách quen. " +
    "Mỗi tối tôi sẽ gửi anh/chị báo cáo ngắn gọn về những gì đội AI đã làm."
  );
}

export class ZeroTechOnboardingService {
  constructor(private readonly db: Pick<Pool, "query"> = defaultPool) {}

  private readiness(agent: MerchantAgentId, state: { activated: boolean; links: Record<string, string | null>; settings: MerchantSettings }): { status: AgentReadiness; detail: string } {
    if (!state.activated) return { status: "not_activated", detail: "Chưa kích hoạt — hãy dán 4 link và bấm Kích hoạt" };
    const fbReady = Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() && process.env.FACEBOOK_PAGE_ID?.trim());
    const needs = (detail: string) => ({ status: "needs_connection" as const, detail });
    switch (agent) {
      case "growth_lead":
        return state.settings.telegram_chat_id || process.env.TELEGRAM_OWNER_CHAT_ID || state.settings.report_email
          ? { status: "active", detail: "Gửi báo cáo ngày qua " + [state.settings.telegram_chat_id || process.env.TELEGRAM_OWNER_CHAT_ID ? "Telegram" : null, state.settings.report_email ? "Email" : null].filter(Boolean).join(" & ") }
          : needs("Chưa có Telegram/ Email nhận báo cáo — thêm trong Cài đặt quán");
      case "asset_manager":
        if (!parseDriveFolderId(state.links.gdrive)) return needs("Link Drive chưa hợp lệ");
        return googleOAuthConfigured() || process.env.GOOGLE_API_KEY ? { status: "active", detail: "Quét thư mục Drive mỗi 20 phút" } : needs("Máy chủ chưa có quyền đọc Google Drive");
      case "content_planner":
        return { status: "active", detail: "Lập lịch tuần theo khung giờ vàng 10:30–12:00 và 17:00–19:30" };
      case "publisher":
        return fbReady ? { status: "active", detail: "Đăng bài đã duyệt đúng giờ hẹn" } : needs("Chưa kết nối Fanpage (Page token)");
      case "gmaps_specialist":
        return googleOAuthConfigured() ? { status: "active", detail: "Đồng bộ review mỗi 3 phút, tự trả lời review tốt" } : needs("Chưa kết nối Google Business Profile");
      case "comment_reply":
        return fbReady ? { status: "active", detail: "Trả lời bình luận an toàn, báo động bình luận tiêu cực" } : needs("Chưa kết nối Fanpage (Page token + webhook)");
      case "inbox_concierge":
        return fbReady || process.env.ZALO_OA_ACCESS_TOKEN ? { status: "active", detail: "Tư vấn & giữ bàn qua Messenger/ Instagram/ Zalo" } : needs("Chưa kết nối Messenger/ Zalo OA");
      case "community_growth":
        return state.links.group ? { status: "active", detail: "Bài mini game/ bình chọn 2 lần mỗi tuần, theo dõi phễu thành viên" } : needs("Chưa có link Group cộng đồng");
    }
  }

  async getStatus(workspaceId: string): Promise<OnboardingState> {
    const row = (await this.db.query(`SELECT * FROM merchant_onboarding WHERE workspace_id = $1::uuid`, [workspaceId])).rows[0];
    const profile = await loadMerchantProfile(this.db, workspaceId);
    const runs = (await this.db.query(`SELECT agent, last_finished_at, last_status FROM merchant_agent_runs WHERE workspace_id = $1::uuid`, [workspaceId])).rows;
    const activated = Boolean(row?.onboarding_completed);
    const links = { fanpage: row?.fanpage_url ?? null, gmaps: row?.gmaps_url ?? null, gdrive: row?.gdrive_url ?? null, group: row?.community_group_url ?? null };
    return {
      workspace_id: workspaceId,
      business_name: row?.business_name ?? profile.settings.business_name ?? null,
      business_type: row?.business_type ?? "restaurant",
      fanpage_url: links.fanpage,
      gmaps_url: links.gmaps,
      gdrive_url: links.gdrive,
      community_group_url: links.group,
      onboarding_completed: activated,
      activated_at: row?.activated_at ? new Date(row.activated_at).toISOString() : null,
      welcome_message: row?.welcome_message ?? null,
      settings: profile.settings,
      active_agents: AGENTS.map((a) => {
        const run = runs.find((r) => r.agent === a.name);
        return {
          ...a,
          ...this.readiness(a.name, { activated, links, settings: profile.settings }),
          last_run_at: run?.last_finished_at ? new Date(run.last_finished_at).toISOString() : null,
          last_run_status: run?.last_status ?? null,
        };
      }),
      updated_at: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  }

  async activate(workspaceId: string, raw: unknown): Promise<OnboardingState> {
    const input = activateSchema.parse(raw);
    const folderId = parseDriveFolderId(input.gdrive_url)!;
    const group = input.community_group_url || null;
    const parsedRefs = {
      drive_folder_id: folderId,
      group_type: group ? (group.includes("zalo.me") ? "zalo" : "facebook") : null,
    };
    await this.db.query(
      `INSERT INTO merchant_onboarding (workspace_id, business_name, business_type, fanpage_url, gmaps_url, gdrive_url, community_group_url,
                                        onboarding_completed, welcome_message_sent, welcome_message, activated_at, parsed_refs, settings, updated_at)
       VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, true, true, $8::text, NOW(), $9::jsonb, jsonb_build_object('business_name', $2::text, 'business_type', $3::text), NOW())
       ON CONFLICT (workspace_id) DO UPDATE SET
         business_name = EXCLUDED.business_name, business_type = EXCLUDED.business_type,
         fanpage_url = EXCLUDED.fanpage_url, gmaps_url = EXCLUDED.gmaps_url, gdrive_url = EXCLUDED.gdrive_url,
         community_group_url = EXCLUDED.community_group_url, onboarding_completed = true, welcome_message_sent = true,
         welcome_message = EXCLUDED.welcome_message, activated_at = COALESCE(merchant_onboarding.activated_at, NOW()),
         -- Link Drive/ Maps đổi thì bỏ thông tin đã dò cũ (vd. địa điểm GBP), giữ phần còn đúng.
         parsed_refs = CASE WHEN merchant_onboarding.gmaps_url IS DISTINCT FROM EXCLUDED.gmaps_url
                            THEN EXCLUDED.parsed_refs ELSE merchant_onboarding.parsed_refs || EXCLUDED.parsed_refs END,
         settings = merchant_onboarding.settings || jsonb_build_object('business_name', $2::text, 'business_type', $3::text),
         updated_at = NOW()`,
      [workspaceId, input.business_name, input.business_type, input.fanpage_url, input.gmaps_url, input.gdrive_url, group, welcomeMessage(input.business_name), JSON.stringify(parsedRefs)],
    );
    // Cho mọi agent chạy ngay ở nhịp worker kế tiếp.
    for (const agent of AGENTS) {
      await this.db.query(
        `INSERT INTO merchant_agent_runs (workspace_id, agent, next_run_at) VALUES ($1::uuid, $2, NOW())
         ON CONFLICT (workspace_id, agent) DO UPDATE SET next_run_at = NOW()`,
        [workspaceId, agent.name],
      );
    }
    return this.getStatus(workspaceId);
  }

  /** Cập nhật hồ sơ vận hành (giờ mở cửa, thực đơn, cọc, từ khóa SEO, kênh báo cáo...). Gộp với giá trị cũ. */
  async updateSettings(workspaceId: string, raw: unknown): Promise<OnboardingState> {
    const parsed = merchantSettingsSchema.partial().safeParse(raw);
    if (!parsed.success) {
      throw new AppError(422, "VALIDATION_FAILED", "Cài đặt quán không hợp lệ", parsed.error.flatten().fieldErrors as Record<string, string[]>);
    }
    const current = await loadMerchantProfile(this.db, workspaceId);
    const merged = merchantSettingsSchema.parse({ ...current.settings, ...parsed.data });
    await this.db.query(
      `INSERT INTO merchant_onboarding (workspace_id, settings, business_name) VALUES ($1::uuid, $2::jsonb, $3)
       ON CONFLICT (workspace_id) DO UPDATE SET settings = $2::jsonb, business_name = COALESCE($3, merchant_onboarding.business_name), updated_at = NOW()`,
      [workspaceId, JSON.stringify(merged), merged.business_name ?? null],
    );
    return this.getStatus(workspaceId);
  }
}
