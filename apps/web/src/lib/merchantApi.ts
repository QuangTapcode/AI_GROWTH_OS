/**
 * Client cho API 8 agent merchant (đi qua apiRequest: có Bearer token, tự chuyển về /login khi hết phiên).
 * Kiểu dữ liệu khớp với apps/api/src/modules/* — chỉ là số liệu thật, không có dữ liệu mẫu phía client.
 */
import { apiRequest } from "./api";

const ws = (id: string) => `/workspaces/${encodeURIComponent(id)}`;

export type LlmProviderId = "gemini" | "deepseek" | "openai" | "claude";
export interface LlmProviderState {
  provider: LlmProviderId;
  model: string;
  key_source: "workspace" | "server_env" | "none";
  key_masked: string | null;
  status: "active" | "ready" | "rate_limited" | "error" | "not_configured";
  cooldown_until: string | null;
  supports_images: boolean;
}
export interface LlmConfig {
  workspace_id: string;
  primary_provider: LlmProviderId;
  auto_switch_enabled: boolean;
  fallback_order: LlmProviderId[];
  providers: LlmProviderState[];
  active_fallback: LlmProviderId | null;
  last_switch_at: string | null;
  last_switch_reason: string | null;
  latency_ms: number | null;
}
export interface PingResult {
  provider: LlmProviderId;
  status: "ok" | "error";
  latency_ms: number;
  message: string;
  error_kind?: string;
  model?: string;
}

export interface AgentStatus {
  id: string;
  name: string;
  role: string;
  status: "active" | "needs_connection" | "not_activated";
  detail: string;
  last_run_at: string | null;
  last_run_status: string | null;
}
export interface MenuItem {
  name: string;
  description?: string;
  price_vnd?: number;
  category?: string;
}
export interface MerchantSettings {
  business_name?: string;
  business_type?: string;
  phone?: string;
  address?: string;
  district?: string;
  city?: string;
  opening_hours?: { open: string; close: string; closed_weekdays?: number[] };
  max_party_size?: number;
  parking_note?: string;
  menu?: MenuItem[];
  faq?: Array<{ question: string; answer: string }>;
  promotions?: Array<{ title: string; detail?: string; until?: string }>;
  deposit?: { required_from_party_size: number; amount_per_guest_vnd: number; bank_bin?: string; bank_account?: string; account_name?: string };
  seo_keywords?: string[];
  brand_voice?: string;
  logo_url?: string;
  telegram_chat_id?: string;
  report_email?: string;
  report_hour_local?: number;
  gmaps_auto_reply_min_rating?: number;
  auto_publish_gmaps_posts?: boolean;
  auto_publish_calendar?: boolean;
  auto_confirm_bookings?: boolean;
  community_target_members?: number;
  zalo_group_url?: string;
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

export interface GMapsItem {
  id: string;
  item_type: "review" | "local_post" | "photo_update";
  author_name: string;
  author_avatar: string | null;
  rating: number | null;
  content: string;
  reply_text: string | null;
  draft_reply: string | null;
  replied_at: string | null;
  reply_source: string | null;
  seo_keywords: string[];
  status: "pending" | "needs_approval" | "replied" | "flagged" | "draft" | "published" | "failed";
  error_message: string | null;
  review_created_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}
export interface GMapsOverview {
  connection: { connected: boolean; reason?: string; location?: { account_id: string; location_id: string; title?: string } };
  average_rating: number | null;
  total_reviews_on_google: number | null;
  synced_reviews: number;
  replied_reviews: number;
  awaiting_approval: number;
  response_rate_percent: number | null;
  median_reply_minutes: number | null;
  last_synced_at: string | null;
  top_seo_keywords: string[];
}

export interface DriveAsset {
  id: string;
  file_name: string;
  file_url: string;
  drive_file_id: string | null;
  asset_type: string;
  vision_tags: string[];
  dish_name: string | null;
  flavor_notes: string | null;
  generated_caption: string | null;
  quality: string | null;
  status: "pending_analysis" | "staged" | "rejected" | "scheduled" | "published" | "archived";
  analysis_provider: string | null;
  error_message: string | null;
  folder_name: string | null;
  created_at: string;
}
export interface DriveConnection {
  folder_id: string | null;
  connected: boolean;
  reason?: string;
}

export type CalendarChannel = "facebook" | "instagram" | "google_maps" | "tiktok" | "facebook_group";
export interface CalendarEntry {
  id: string;
  week_start: string;
  scheduled_at: string;
  channel: CalendarChannel;
  format: string;
  asset_ids: string[];
  theme: string | null;
  caption: string;
  hashtags: string[];
  call_to_action: string | null;
  status: "draft" | "approved" | "publishing" | "published" | "failed" | "rejected";
  published_at: string | null;
  external_post_id: string | null;
  error_message: string | null;
  generated_by: string | null;
  metadata: Record<string, unknown>;
}
export interface CalendarWeek {
  week_start: string;
  entries: CalendarEntry[];
  channels: { channels: CalendarChannel[]; reasons: Partial<Record<CalendarChannel, string>> };
}

export interface BookingLead {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  platform: string;
  party_size: number;
  booking_time: string;
  special_notes: string | null;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  deposit_amount: number;
  deposit_status: "not_required" | "unpaid" | "paid" | "refunded";
  deposit_reference: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}
export interface BookingSummary {
  pending: number;
  confirmed_today: number;
  guests_today: number;
}

export interface WalletTransaction {
  id: string;
  package_name: string;
  amount_vnd: number;
  credits: number;
  qr_reference: string;
  status: "pending" | "success" | "expired" | "failed";
  vietqr_image_url: string | null;
  created_at: string;
  confirmed_at: string | null;
  expires_at: string | null;
}
export interface WalletState {
  balance_credits: number;
  tier: string;
  credits_used_7d: number;
  packages: Array<{ id: "starter" | "growth" | "scale"; amount_vnd: number; credits: number; label: string }>;
  transactions: WalletTransaction[];
  payment_configured: boolean;
  manual_confirm_enabled: boolean;
}

export interface DailyMetrics {
  date: string;
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
  report_date: string;
  metrics: DailyMetrics;
  summary_markdown: string;
  summary_source: string;
  delivery: Record<string, { status?: string; detail?: string } | string>;
  created_at: string;
}

export interface FunnelState {
  target_members: number;
  group_url: string | null;
  table_qr_url: string | null;
  activated_at: string | null;
  current_week: number | null;
  current_members: number | null;
  measured_at: string | null;
  planned_members_now: number | null;
  status: "not_measured" | "ahead" | "on_track" | "behind" | "not_activated";
  members_needed_per_week: number | null;
  touchpoints_7d: { comment_invites: number; booking_invites: number; group_posts_published: number };
  milestones: Array<{ week: number; planned: number }>;
}

export const merchantApi = {
  llmConfig: (id: string) => apiRequest<{ config: LlmConfig }>(`${ws(id)}/admin/llm-config`).then((r) => r.config),
  updateLlmConfig: (id: string, body: Record<string, unknown>) =>
    apiRequest<{ config: LlmConfig }>(`${ws(id)}/admin/llm-config`, { method: "POST", body }).then((r) => r.config),
  pingLlm: (id: string, provider: LlmProviderId) =>
    apiRequest<{ result: PingResult }>(`${ws(id)}/admin/llm-config/test-ping`, { method: "POST", body: { provider } }).then((r) => r.result),

  onboarding: (id: string) => apiRequest<{ state: OnboardingState }>(`${ws(id)}/onboarding`).then((r) => r.state),
  activate: (id: string, body: Record<string, unknown>) =>
    apiRequest<{ state: OnboardingState }>(`${ws(id)}/onboarding`, { method: "POST", body }).then((r) => r.state),
  updateSettings: (id: string, body: MerchantSettings) =>
    apiRequest<{ state: OnboardingState }>(`${ws(id)}/onboarding/settings`, { method: "PUT", body }).then((r) => r.state),

  gmaps: (id: string) => apiRequest<{ overview: GMapsOverview; items: GMapsItem[] }>(`${ws(id)}/gmaps/reputation`),
  gmapsSync: (id: string) => apiRequest<{ result: Record<string, unknown> & { status: string; detail?: string } }>(`${ws(id)}/gmaps/sync`, { method: "POST" }).then((r) => r.result),
  gmapsReply: (id: string, reviewId: string, replyText?: string) =>
    apiRequest<{ item: GMapsItem }>(`${ws(id)}/gmaps/reviews/reply`, { method: "POST", body: { review_id: reviewId, ...(replyText ? { reply_text: replyText } : {}) } }).then((r) => r.item),
  gmapsDraftPost: (id: string, body: { asset_id?: string; content?: string; publish_now?: boolean }) =>
    apiRequest<{ post: GMapsItem }>(`${ws(id)}/gmaps/posts`, { method: "POST", body }).then((r) => r.post),
  gmapsPublishPost: (id: string, postId: string) =>
    apiRequest<{ post: GMapsItem }>(`${ws(id)}/gmaps/posts/${encodeURIComponent(postId)}/publish`, { method: "POST", body: {} }).then((r) => r.post),
  gmapsSyncMenu: (id: string) => apiRequest<{ result: { sections: number; items: number } }>(`${ws(id)}/gmaps/menu`, { method: "POST" }).then((r) => r.result),
  gmapsPhoto: (id: string, assetId: string) => apiRequest(`${ws(id)}/gmaps/photos`, { method: "POST", body: { asset_id: assetId } }),

  driveAssets: (id: string) => apiRequest<{ assets: DriveAsset[]; connection: DriveConnection }>(`${ws(id)}/assets/drive/queue`),
  driveScan: (id: string) => apiRequest<{ result: Record<string, unknown> & { status: string; detail?: string } }>(`${ws(id)}/assets/drive/sync`, { method: "POST" }).then((r) => r.result),
  scheduleAsset: (id: string, assetId: string, channels: CalendarChannel[]) =>
    apiRequest<{ entries: CalendarEntry[] }>(`${ws(id)}/assets/drive/publish`, { method: "POST", body: { asset_id: assetId, channels } }).then((r) => r.entries),

  calendar: (id: string, week?: string) => apiRequest<CalendarWeek>(`${ws(id)}/calendar${week ? `?week=${week}` : ""}`),
  generateCalendar: (id: string, weekStart?: string) =>
    apiRequest<CalendarWeek & { created: number; generated_by: string }>(`${ws(id)}/calendar/generate`, { method: "POST", body: weekStart ? { week_start: weekStart } : {} }),
  reviewCalendar: (id: string, entryIds: string[], decision: "approve" | "reject") =>
    apiRequest<{ entries: CalendarEntry[] }>(`${ws(id)}/calendar/review`, { method: "POST", body: { entry_ids: entryIds, decision } }).then((r) => r.entries),
  updateCalendarEntry: (id: string, entryId: string, body: { caption?: string; hashtags?: string[]; scheduled_at?: string }) =>
    apiRequest<{ entry: CalendarEntry }>(`${ws(id)}/calendar/${encodeURIComponent(entryId)}`, { method: "PATCH", body }).then((r) => r.entry),

  bookings: (id: string, status?: string) =>
    apiRequest<{ leads: BookingLead[]; summary: BookingSummary }>(`${ws(id)}/booking/leads${status ? `?status=${status}` : ""}`),
  createBooking: (id: string, body: Record<string, unknown>) => apiRequest<{ lead: BookingLead }>(`${ws(id)}/booking/leads`, { method: "POST", body }).then((r) => r.lead),
  updateBooking: (id: string, leadId: string, body: Record<string, unknown>) =>
    apiRequest<{ lead: BookingLead }>(`${ws(id)}/booking/leads/${encodeURIComponent(leadId)}`, { method: "PATCH", body }).then((r) => r.lead),

  wallet: (id: string) => apiRequest<{ wallet: WalletState }>(`${ws(id)}/wallet`).then((r) => r.wallet),
  topup: (id: string, packageName: string) =>
    apiRequest<{ transaction: WalletTransaction }>(`${ws(id)}/wallet/topup`, { method: "POST", body: { package_name: packageName } }).then((r) => r.transaction),
  confirmTopup: (id: string, transactionId: string) =>
    apiRequest<{ wallet: WalletState }>(`${ws(id)}/wallet/confirm`, { method: "POST", body: { transaction_id: transactionId } }).then((r) => r.wallet),

  dailyReport: (id: string, date?: string) => apiRequest<{ report: DailyReport; preview: boolean }>(`${ws(id)}/reports/daily-executive${date ? `?date=${date}` : ""}`),
  sendDailyReport: (id: string) => apiRequest<{ report: DailyReport }>(`${ws(id)}/reports/daily-executive`, { method: "POST" }).then((r) => r.report),
  reportHistory: (id: string) => apiRequest<{ reports: DailyReport[] }>(`${ws(id)}/reports/daily-executive/history`).then((r) => r.reports),

  funnel: (id: string) => apiRequest<{ funnel: FunnelState }>(`${ws(id)}/community-growth/funnel`).then((r) => r.funnel),
};

export function formatVnd(amount: number): string {
  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
}

export function formatDateTimeVn(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

export const CHANNEL_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  google_maps: "Google Maps",
  tiktok: "TikTok",
  facebook_group: "Group",
};
