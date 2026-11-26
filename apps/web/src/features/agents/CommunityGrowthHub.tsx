"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const subscribeNoop = () => () => {};
const getSwitchFallbackSnapshot = () =>
  typeof HTMLInputElement !== "undefined" && !("switch" in HTMLInputElement.prototype);
const getSwitchFallbackServerSnapshot = () => false;
import Link from "next/link";
import { API_BASE_URL, apiRequest } from "@/lib/api";
import KnowledgeGapsPanel, { type KnowledgeGap } from "./KnowledgeGapsPanel";

type WeeklyTargetPlanItem = {
  week: number;
  label: string;
  member_target: number;
  weekly_new_target: number;
  focus: string;
  channel_tactic: string;
};

type RecentCommentItem = {
  id: string;
  platform: string;
  source_channel: string;
  external_id: string | null;
  author_name: string;
  content: string;
  post_url: string | null;
  status: string;
  rag_reply_text: string | null;
  reply_artifact_id: string | null;
  invite_sent: boolean;
  received_at: string;
  updated_at: string;
};

type InviteLogItem = {
  id: string;
  target_ref: string;
  display_name: string;
  channel: string;
  status: string;
  detail: string | null;
  invited_at: string;
};

type MemberSnapshotItem = {
  id: string;
  group_member_count: number;
  page_followers_count: number | null;
  identified_prospects_count: number;
  invites_sent_count: number;
  replies_sent_count: number;
  campaign_week: number;
  captured_at: string;
};

type SearxngOpportunity = {
  query: string;
  title: string;
  url: string;
  snippet: string;
  domain: string;
};

type WeeklyCampaign = {
  week: number;
  date_range?: string;
  title: string;
  target_members: number;
  current_members: number;
  status: string;
  theme: string;
  target_trends: string[];
  responsible_agents?: string;
  tactics: string[];
};

type MatchedMember = {
  id: string;
  external_ref: string;
  display_name: string;
  channel: string;
  matched_signal: string;
  matched_trend: string;
  interest_tags: string[];
  affinity_score: number;
  campaign_week: number;
  status: string;
  invite_group_url: string;
  recommended_topic: string | null;
  created_at: string;
};

type DiscussionReply = {
  author: string;
  role: string;
  text: string;
  created_at: string;
};

type DiscussionThread = {
  id: string;
  category: string;
  title: string;
  author_name: string;
  author_role: string;
  body: string;
  discussion_prompt: string;
  source_url: string | null;
  image_url: string | null;
  replies: DiscussionReply[];
  participants_count: number;
  facebook_post_id: string | null;
  created_at: string;
};

type PublishTarget = "group" | "fanpage" | "both";

type GroupBotSessionStatus = {
  isLoggedIn: boolean;
  sessionSource: "file" | "cookie" | "none";
  detail?: string;
  loginInProgress?: boolean;
  usingPageProfile?: boolean;
  accountIdMask?: string;
};

type TelegramBotStatus = {
  configured: boolean;
  mode: "polling" | "webhook";
  bot_username: string | null;
  bot_name: string | null;
  t_me_url: string | null;
  webhook_url: string | null;
  pending_update_count: number;
  last_error_message: string | null;
  conversations_count: number;
  messages_received_count: number;
  messages_replied_count: number;
  invites_sent_count: number;
};

type PostEngagementSummary = {
  likes: number;
  comments: number;
  shares: number;
  total_engagement: number;
  group_likes: number;
  group_comments: number;
  group_shares: number;
  page_likes: number;
  page_comments: number;
  page_shares: number;
  last_synced_at: string | null;
};

type PostMetricItem = {
  id: string;
  source_id: string | null;
  channel: "group" | "fanpage";
  external_post_key: string;
  post_title: string;
  post_url: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  total_engagement: number;
  sync_source: string;
  published_at: string | null;
  last_synced_at: string;
};

type EngagementSnapshotItem = {
  id: string;
  total_posts_tracked: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  group_likes: number;
  group_comments: number;
  group_shares: number;
  page_likes: number;
  page_comments: number;
  page_shares: number;
  group_members: number;
  captured_at: string;
};
type TopicVideo = {
  path: string;
  title: string;
  duration_s: number;
  status: "draft" | "approved";
  created_at: string;
  /** The Reel the worker posted after the card's Facebook post, if any. */
  facebook_reel?: { status: "published" | "failed" | "no_video" | string; post_url: string | null; error: string | null } | null;
};

function TopicVideoPanel({ video, onPublishReel, busy }: { video?: TopicVideo | null; onPublishReel?: () => void; busy?: boolean }) {
  if (!video) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-500">
        Chưa có video giải thích cho chủ đề này
      </div>
    );
  }
  const src = `${API_BASE_URL}${video.path}`;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold text-slate-800">
        <span>
          Video giải thích · {Math.round(video.duration_s)}s · Lời Anh, phụ đề Việt
        </span>
        <span
          className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
            video.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
          }`}
        >
          {video.status === "approved" ? "Đã duyệt" : "Chờ duyệt"}
        </span>
      </div>
      <video
        key={src}
        controls
        playsInline
        preload="metadata"
        src={src}
        className="mx-auto max-h-64 rounded-lg bg-black w-full"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <a
          href={`${src}&download=1`}
          className="text-xs font-semibold text-blue-700 hover:underline"
        >
          Tải video MP4
        </a>
        {video.facebook_reel?.status === "published" && video.facebook_reel.post_url && (
          <a
            href={video.facebook_reel.post_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-emerald-800 hover:underline"
          >
            Xem Reel trên Fanpage
          </a>
        )}
      </div>
      {video.facebook_reel?.status === "failed" && (
        <p className="mt-2 rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-xs text-rose-700">
          Chưa đăng Reel được: {video.facebook_reel.error}
        </p>
      )}
      {video.facebook_reel?.status === "queued" && (
        <p className="mt-2 text-xs font-medium text-slate-600">
          Đang chuẩn bị đăng video lên Fanpage dạng Reel...
        </p>
      )}
      {onPublishReel && video.facebook_reel?.status !== "published" && video.facebook_reel?.status !== "queued" && (
        <button
          type="button"
          disabled={busy}
          onClick={onPublishReel}
          className="mt-2 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {busy ? "Đang gửi..." : video.facebook_reel?.status === "failed" ? "Thử lại đăng video lên Fanpage" : "Đăng video lên Fanpage"}
        </button>
      )}
    </div>
  );
}

type DailyCalendarItem = {
  day_index: number;
  day_label: string;
  scheduled_date_vn?: string;
  scheduled_date_short?: string;
  scheduled_date_only?: string;
  scheduled_iso?: string;
  date_iso_vn?: string;
  day_vn?: number;
  month_vn?: number;
  year_vn?: number;
  time_hm_vn?: string;
  week_number: number;
  week_range_label?: string;
  source_id: string;
  topic_title: string;
  published_post_title?: string | null;
  source_url: string;
  image_url: string;
  image_attribution: string;
  target_trend: string;
  interest_tags: string[];
  community_discussion_hook: string;
  responsible_agents?: {
    planning: string;
    seo_draft: string;
    social_pack: string;
    community_engagement: string;
  };
  concrete_action?: string;
  status: "published" | "ready_to_publish";
  job_status?: "published" | "scheduled" | "failed" | "ready_to_publish";
  publishing_job_id?: string | null;
  target_channel?: PublishTarget;
  is_published_group?: boolean;
  is_published_fanpage?: boolean;
  group_status?: "published" | "scheduled" | "failed" | "not_published";
  group_post_url?: string | null;
  group_published_at?: string | null;
  group_error?: string | null;
  fanpage_post_url?: string | null;
  fanpage_published_at?: string | null;
  published_slug: string | null;
  published_at: string | null;
  facebook_post_url?: string | null;
  post_body_preview?: string | null;
  /** Explainer video for the topic; `path` is a signed link under API_BASE_URL. */
  video?: TopicVideo | null;
  unique_topic_verified: boolean;
  unique_image_verified: boolean;
  engagement?: PostEngagementSummary;
};

type WeeklyCalendarItem = {
  week_number: number;
  week_label: string;
  date_range?: string;
  member_target: string;
  pillar_theme: string;
  responsible_agents?: string;
  planned_topics: string[];
  interactive_format: string;
};

type MonthlyCalendarItem = {
  month_number: number;
  month_label: string;
  date_range?: string;
  member_goal: string;
  content_commitment: string;
  key_pillars: string[];
};

type AgentRoleInfo = {
  agent_id: string;
  agent_name: string;
  operations: string[];
  responsibility: string;
};

type RagReplyMechanism = {
  mode: string;
  approved_sources_count: number;
  total_chunks_count: number;
  embedded_chunks_count: number;
  inbound_messages_count: number;
  grounded_replies_count: number;
  steps: string[];
};

type HubResponse = {
  synced_at?: string;
  group: {
    name: string;
    group_url: string;
    group_share_url: string;
    publish_target?: PublishTarget;
    group_bot_session?: GroupBotSessionStatus;
    page_name: string;
    page_url: string;
    connected_fanpage_id: string;
    positioning: string;
    target_source?: "growth_lead_agent" | "manual" | "locked_manual";
    strategy_artifact_id?: string | null;
    strategy_plan_id?: string | null;
    target_rationale?: string | null;
    target_updated_at?: string | null;
    weekly_targets_json?: WeeklyTargetPlanItem[] | null;
    auto_reply_comments?: boolean;
    auto_invite_enabled?: boolean;
    daily_invite_limit?: number;
    last_comment_sync_at?: string | null;
    last_group_comment_sync_at?: string | null;
    last_post_stats_sync_at?: string | null;
    fb_admin_name?: string | null;
    last_invite_run_at?: string | null;
  };
  growth_lead_targets?: {
    target_source: "growth_lead_agent" | "manual" | "locked_manual";
    strategy_artifact_id: string | null;
    strategy_plan_id: string | null;
    rationale: string | null;
    updated_at: string | null;
    weekly_targets: WeeklyTargetPlanItem[] | null;
    auto_reply_comments: boolean;
    auto_invite_enabled: boolean;
    daily_invite_limit: number;
  };
  stats: {
    total_matched_members: number;
    real_group_members?: number | null;
    real_page_followers: number | null;
    real_page_likes: number | null;
    real_identified_people: number;
    manual_prospects: number;
    current_campaign_week?: number;
    week1_baseline_members?: number;
    week1_target: number;
    week1_achieved: number;
    week2_target: number;
    week2_progress: number;
    week3_target?: number;
    week4_target?: number;
    daily_invite_limit?: number;
    invites_sent_today?: number;
    invites_remaining_today?: number;
    invites_sent_7d?: number;
    invites_sent_total?: number;
    comments_received_count?: number;
    comments_replied_count?: number;
    messages_received_count?: number;
    messages_replied_count?: number;
    pending_questions_count?: number;
    active_discussions: number;
    total_approved_playbook_topics: number;
    published_topics_count?: number;
    published_group_count?: number;
    published_fanpage_count?: number;
    scheduled_topics_count?: number;
    scheduled_group_count?: number;
    failed_group_count?: number;
    fresh_unposted_topics: number;
    approved_unique_images: number;
    duplication_rate_pct: number;
    total_post_likes?: number;
    total_post_comments?: number;
    total_post_shares?: number;
    total_post_engagement?: number;
    tracked_posts_count?: number;
    avg_engagement_per_post?: number;
    group_post_likes?: number;
    group_post_comments?: number;
    group_post_shares?: number;
    fanpage_post_likes?: number;
    fanpage_post_comments?: number;
    fanpage_post_shares?: number;
    member_growth_delta?: number;
    engagement_growth_delta?: number;
  };
  architecture_info?: {
    agent_roles: AgentRoleInfo[];
    rag_reply_mechanism: RagReplyMechanism;
  };
  weekly_campaigns: WeeklyCampaign[];
  matched_members: MatchedMember[];
  discussions: DiscussionThread[];
  recent_comments?: RecentCommentItem[];
  recent_invite_logs?: InviteLogItem[];
  snapshots?: MemberSnapshotItem[];
  post_metrics?: PostMetricItem[];
  engagement_snapshots?: EngagementSnapshotItem[];
  calendar: {
    daily: DailyCalendarItem[];
    weekly: WeeklyCalendarItem[];
    monthly: MonthlyCalendarItem[];
  };
  telegram_bot?: TelegramBotStatus;
  knowledge_gaps?: KnowledgeGap[];
};

type WeekFilterId = `week${number}`;
type HubTabId = "calendar" | "published_archive" | "campaigns" | "discussions" | "architecture";
const HUB_TAB_ORDER: HubTabId[] = [
  "calendar",
  "published_archive",
  "campaigns",
  "discussions",
  "architecture",
];

function buildShareableCardBody(item: DailyCalendarItem): string {
  if (item.post_body_preview && item.post_body_preview.trim()) {
    return item.post_body_preview.trim();
  }
  const articleLink = item.published_slug
    ? `http://localhost:3001/posts/${item.published_slug}`
    : item.source_url;
  return [
    `Chủ đề: ${item.target_trend}`,
    articleLink ? `Xem bài viết chi tiết tại: ${articleLink}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function getTodayVnParts(): {
  dayStr: string;
  monthStr: string;
  yearStr: string;
  dateIso: string;
  dateDisplay: string;
} {
  const vn = new Date(Date.now() + 7 * 3600_000);
  const dayStr = String(vn.getUTCDate()).padStart(2, "0");
  const monthStr = String(vn.getUTCMonth() + 1).padStart(2, "0");
  const yearStr = String(vn.getUTCFullYear());
  return {
    dayStr,
    monthStr,
    yearStr,
    dateIso: `${yearStr}-${monthStr}-${dayStr}`,
    dateDisplay: `${dayStr}/${monthStr}/${yearStr}`,
  };
}

export default function CommunityGrowthHub({
  workspaceId,
  canEdit,
  onUpdated,
}: {
  workspaceId: string;
  canEdit: boolean;
  onUpdated?: () => void;
}) {
  const [hub, setHub] = useState<HubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingRealtime, setSyncingRealtime] = useState(false);
  const [lastSyncedDisplay, setLastSyncedDisplay] = useState<string>("");
  const [activeTab, setActiveTab] = useState<HubTabId>("calendar");
  const tabButtonRefs = useRef<Partial<Record<HubTabId, HTMLButtonElement | null>>>({});
  const [calendarView, setCalendarView] = useState<"daily" | "weekly" | "monthly">("daily");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string>("");
  const [bannerTone, setBannerTone] = useState<"success" | "warning" | "error">("success");
  const [bannerRecovery, setBannerRecovery] = useState<{
    title: string;
    body: string;
    prompt: string;
  } | null>(null);
  const [bannerScrollId, setBannerScrollId] = useState(0);
  const [editingSettings, setEditingSettings] = useState(false);
  const editingSettingsRef = useRef(editingSettings);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const loginPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutatingSettingsRef = useRef(false);
  useEffect(() => {
    editingSettingsRef.current = editingSettings;
  }, [editingSettings]);
  useEffect(() => {
    return () => {
      if (loginPollTimerRef.current) {
        clearInterval(loginPollTimerRef.current);
        loginPollTimerRef.current = null;
      }
    };
  }, []);

  // Settings & Custom Target form state
  const [customCommunityName, setCustomCommunityName] = useState("");
  const [customGroupUrl, setCustomGroupUrl] = useState("");
  const [customPublishTarget, setCustomPublishTarget] = useState<PublishTarget>("group");
  const [customGroupMemberCount, setCustomGroupMemberCount] = useState<number>(5);
  const [customWeek1Target, setCustomWeek1Target] = useState<number>(5);
  const [customWeek2Target, setCustomWeek2Target] = useState<number>(10);
  const [customWeek3Target, setCustomWeek3Target] = useState<number>(18);
  const [customWeek4Target, setCustomWeek4Target] = useState<number>(30);
  const [autoReplyComments, setAutoReplyComments] = useState<boolean>(true);
  const [autoInviteEnabled, setAutoInviteEnabled] = useState<boolean>(true);
  const [dailyInviteLimit, setDailyInviteLimit] = useState<number>(12);
  const [lockManualTargets, setLockManualTargets] = useState<boolean>(false);
  const [manualTargetsTouched, setManualTargetsTouched] = useState<boolean>(false);
  const [searxngOpportunities, setSearxngOpportunities] = useState<SearxngOpportunity[]>([]);
  const [loginWaitingOnEdge, setLoginWaitingOnEdge] = useState<boolean>(false);
  const [cliFallbackCommand, setCliFallbackCommand] = useState<string>(
    "npm.cmd --prefix apps/worker run group-bot:switch"
  );
  const [copiedCliFallback, setCopiedCliFallback] = useState<boolean>(false);
  const [commentChannelFilter, setCommentChannelFilter] = useState<
    "all" | "group_comment" | "page_comment" | "telegram" | "messenger"
  >("all");
  const [postMetricsChannelFilter, setPostMetricsChannelFilter] = useState<"all" | "group" | "fanpage">("all");
  const switchFallbackNeeded = useSyncExternalStore(
    subscribeNoop,
    getSwitchFallbackSnapshot,
    getSwitchFallbackServerSnapshot
  );

  const scrollTabIntoView = useCallback((tabId: HubTabId) => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const btn = tabButtonRefs.current[tabId];
      if (!btn || typeof btn.scrollIntoView !== "function") return;
      (
        btn.scrollIntoView as (
          options?: ScrollIntoViewOptions & { container?: "all" | "nearest" }
        ) => void
      )({
        block: "nearest",
        inline: "nearest",
        container: "nearest",
      });
    });
  }, []);

  const selectHubTab = useCallback(
    (tabId: HubTabId, scrollTargetId?: string) => {
      setActiveTab(tabId);
      scrollTabIntoView(tabId);
      if (scrollTargetId && typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const target = document.getElementById(scrollTargetId);
            if (!target) return;
            const prefersReducedMotion =
              typeof window.matchMedia === "function" &&
              window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            target.scrollIntoView({
              behavior: prefersReducedMotion ? "auto" : "smooth",
              block: "start",
            });
          });
        });
      }
    },
    [scrollTabIntoView]
  );

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      let nextIndex: number | null = null;
      if (e.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % HUB_TAB_ORDER.length;
      } else if (e.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + HUB_TAB_ORDER.length) % HUB_TAB_ORDER.length;
      } else if (e.key === "Home") {
        nextIndex = 0;
      } else if (e.key === "End") {
        nextIndex = HUB_TAB_ORDER.length - 1;
      }
      if (nextIndex === null) return;
      e.preventDefault();
      const nextId = HUB_TAB_ORDER[nextIndex];
      selectHubTab(nextId);
      tabButtonRefs.current[nextId]?.focus();
    },
    [selectHubTab]
  );

  const handleCopyCliFallback = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(cliFallbackCommand);
      setCopiedCliFallback(true);
      setTimeout(() => setCopiedCliFallback(false), 2500);
    } catch {
      setCopiedCliFallback(false);
    }
  }, [cliFallbackCommand]);

  // Form states for adding prospect & creating discussion
  const [prospectName, setProspectName] = useState("");
  const [prospectSignal, setProspectSignal] = useState("");
  const [discussionTitle, setDiscussionTitle] = useState("");
  const [discussionBody, setDiscussionBody] = useState("");
  const [discussionPrompt, setDiscussionPrompt] = useState("");
  const [customScheduleMap, setCustomScheduleMap] = useState<Record<string, string>>({});
  const [dailyPage, setDailyPage] = useState<number>(1);
  const [dailyPageSize, setDailyPageSize] = useState<number>(6);
  const [pubCalPage, setPubCalPage] = useState<number>(1);
  const [pendingCalPage, setPendingCalPage] = useState<number>(1);
  const [archivePage, setArchivePage] = useState<number>(1);
  const [metricsPage, setMetricsPage] = useState<number>(1);
  const [commentsPage, setCommentsPage] = useState<number>(1);
  const [discussionsPage, setDiscussionsPage] = useState<number>(1);
  const [dailyFilter, setDailyFilter] = useState<
    "all" | "published" | "scheduled" | "failed" | "fanpage_only" | WeekFilterId
  >("all");
  const [selectedDay, setSelectedDay] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedExactDate, setSelectedExactDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Dedicated "Các bài đã đăng theo ngày tháng năm" section state (never hidden)
  const [archiveChannelFilter, setArchiveChannelFilter] = useState<
    "primary" | "group" | "website" | "fanpage" | "all_published"
  >("primary");
  const [archiveDay, setArchiveDay] = useState<string>("all");
  const [archiveMonth, setArchiveMonth] = useState<string>("all");
  const [archiveYear, setArchiveYear] = useState<string>("all");
  const [archiveExactDate, setArchiveExactDate] = useState<string>("");
  const [archiveSearch, setArchiveSearch] = useState<string>("");

  function extractItemDateParts(item: DailyCalendarItem): {
    dayStr: string;
    monthStr: string;
    yearStr: string;
    dateIso: string;
    timeHm: string;
    dateDisplay: string;
  } {
    if (item.day_vn && item.month_vn && item.year_vn) {
      const dayStr = String(item.day_vn).padStart(2, "0");
      const monthStr = String(item.month_vn).padStart(2, "0");
      const yearStr = String(item.year_vn);
      const dateIso = item.date_iso_vn || `${yearStr}-${monthStr}-${dayStr}`;
      const timeHm =
        item.time_hm_vn ||
        (item.scheduled_date_short?.split("•")[1]?.trim() ?? "09:00");
      return {
        dayStr,
        monthStr,
        yearStr,
        dateIso,
        timeHm,
        dateDisplay: `${dayStr}/${monthStr}/${yearStr}`,
      };
    }
    if (item.scheduled_date_only && item.scheduled_date_only.includes("/")) {
      const [d = "01", m = "11", y = "2026"] = item.scheduled_date_only.split("/");
      const dayStr = d.padStart(2, "0");
      const monthStr = m.padStart(2, "0");
      const yearStr = y;
      const timeHm = item.scheduled_date_short?.split("•")[1]?.trim() ?? "09:00";
      return {
        dayStr,
        monthStr,
        yearStr,
        dateIso: `${yearStr}-${monthStr}-${dayStr}`,
        timeHm,
        dateDisplay: `${dayStr}/${monthStr}/${yearStr}`,
      };
    }
    if (item.scheduled_iso) {
      const vn = new Date(new Date(item.scheduled_iso).getTime() + 7 * 3600_000);
      const dayStr = String(vn.getUTCDate()).padStart(2, "0");
      const monthStr = String(vn.getUTCMonth() + 1).padStart(2, "0");
      const yearStr = String(vn.getUTCFullYear());
      const timeHm = `${String(vn.getUTCHours()).padStart(2, "0")}:${String(vn.getUTCMinutes()).padStart(2, "0")}`;
      return {
        dayStr,
        monthStr,
        yearStr,
        dateIso: `${yearStr}-${monthStr}-${dayStr}`,
        timeHm,
        dateDisplay: `${dayStr}/${monthStr}/${yearStr}`,
      };
    }
    return {
      dayStr: "09",
      monthStr: "11",
      yearStr: "2026",
      dateIso: "2026-11-09",
      timeHm: "09:00",
      dateDisplay: "09/11/2026",
    };
  }

  function resetAllDateFilters() {
    setDailyFilter("all");
    setSelectedDay("all");
    setSelectedMonth("all");
    setSelectedYear("all");
    setSelectedExactDate("");
    setSearchQuery("");
    setDailyPage(1);
    setPubCalPage(1);
    setPendingCalPage(1);
  }

  function toDatetimeLocalValue(iso?: string): string {
    if (!iso) return "";
    const raw = new Date(iso);
    if (Number.isNaN(raw.getTime())) return "";
    // Always display Vietnam Standard Time (Asia/Ho_Chi_Minh, UTC+7) to match the calendar card labels
    const vn = new Date(raw.getTime() + 7 * 3600_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())}T${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}`;
  }

  function parseVnDatetimeLocalToIso(localValue: string): string | null {
    const trimmed = localValue.trim();
    if (!trimmed) return null;
    const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)
      ? `${trimmed}:00+07:00`
      : /(?:Z|[+-]\d{2}:\d{2})$/i.test(trimmed)
        ? trimmed
        : `${trimmed}+07:00`;
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const stopLoginPolling = useCallback(() => {
    if (loginPollTimerRef.current) {
      clearInterval(loginPollTimerRef.current);
      loginPollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (bannerScrollId === 0 || !bannerMessage || typeof window === "undefined") {
      return;
    }
    const rafId = window.requestAnimationFrame(() => {
      const el = bannerRef.current;
      if (!el) return;
      const prefersReducedMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [bannerScrollId, bannerMessage]);

  const showBanner = useCallback(
    (
      tone: "success" | "warning" | "error",
      message: string,
      recovery: { title: string; body: string; prompt: string } | null = null
    ) => {
      setBannerTone(tone);
      setBannerMessage(message);
      setBannerRecovery(recovery);
      setBannerScrollId((prev) => prev + 1);
    },
    []
  );

  const syncFormFromHub = useCallback((res: HubResponse, isEditing: boolean) => {
    if (isEditing) return;
    setCustomCommunityName(res.group.name);
    setCustomGroupUrl(res.group.group_url);
    setCustomPublishTarget(res.group.publish_target ?? "group");
    setCustomGroupMemberCount(res.stats.real_group_members ?? res.stats.week1_achieved ?? 5);
    setCustomWeek1Target(res.stats.week1_target || 5);
    setCustomWeek2Target(res.stats.week2_target || 10);
    setCustomWeek3Target(res.stats.week3_target || res.weekly_campaigns?.[2]?.target_members || 18);
    setCustomWeek4Target(res.stats.week4_target || res.weekly_campaigns?.[3]?.target_members || 30);
    setAutoReplyComments(
      res.group.auto_reply_comments ?? res.growth_lead_targets?.auto_reply_comments ?? true
    );
    setAutoInviteEnabled(
      res.group.auto_invite_enabled ?? res.growth_lead_targets?.auto_invite_enabled ?? true
    );
    setDailyInviteLimit(
      res.group.daily_invite_limit ?? res.stats.daily_invite_limit ?? 12
    );
    setLockManualTargets(
      (res.group.target_source ?? res.growth_lead_targets?.target_source) === "locked_manual"
    );
    setManualTargetsTouched(false);
  }, []);

  const syncFromServer = useCallback(
    async (options: { showErrorOnFailure?: boolean } = {}): Promise<HubResponse | null> => {
      try {
        const res = await apiRequest<HubResponse>(`/workspaces/${workspaceId}/community/hub`);
        setHub(res);
        syncFormFromHub(res, editingSettingsRef.current || mutatingSettingsRef.current);
        const now = res.synced_at ? new Date(res.synced_at) : new Date();
        setLastSyncedDisplay(now.toLocaleTimeString("vi-VN", { hour12: false }));
        return res;
      } catch (err) {
        if (options.showErrorOnFailure) {
          showBanner("error", (err as Error).message);
        }
        return null;
      } finally {
        setLoading(false);
        setSyncingRealtime(false);
      }
    },
    [workspaceId, syncFormFromHub, showBanner]
  );

  const fetchHub = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setLoading(true);
      } else {
        setSyncingRealtime(true);
      }
      await syncFromServer({ showErrorOnFailure: !options.silent });
    },
    [syncFromServer]
  );

  // Initial load + Automatic background sync every 15s + Sync on window focus / tab visibility
  useEffect(() => {
    let active = true;
    const initialTimer = setTimeout(() => {
      if (active) {
        void syncFromServer({ showErrorOnFailure: true });
      }
    }, 0);
    const interval = setInterval(() => {
      void fetchHub({ silent: true });
    }, 15000);

    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchHub({ silent: true });
      }
    };
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);

    return () => {
      active = false;
      clearTimeout(initialTimer);
      clearInterval(interval);
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [syncFromServer, fetchHub]);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    mutatingSettingsRef.current = true;
    setBusyAction("save_settings");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const wasLocked =
        (hub?.group.target_source ?? hub?.growth_lead_targets?.target_source) === "locked_manual";
      const payloadBody: Record<string, unknown> = {
        action: "update_settings",
        community_name: customCommunityName.trim(),
        group_url: customGroupUrl.trim(),
        publish_target: customPublishTarget,
        group_member_count: Number(customGroupMemberCount),
        auto_reply_comments: autoReplyComments,
        auto_invite_enabled: autoInviteEnabled,
        daily_invite_limit: Number(dailyInviteLimit),
      };
      if (lockManualTargets) {
        payloadBody.lock_manual = true;
        payloadBody.week1_target = Number(customWeek1Target);
        payloadBody.week2_target = Number(customWeek2Target);
        payloadBody.week3_target = Number(customWeek3Target);
        payloadBody.week4_target = Number(customWeek4Target);
      } else if (manualTargetsTouched) {
        payloadBody.week1_target = Number(customWeek1Target);
        payloadBody.week2_target = Number(customWeek2Target);
        payloadBody.week3_target = Number(customWeek3Target);
        payloadBody.week4_target = Number(customWeek4Target);
        if (wasLocked) payloadBody.target_source = "manual";
      } else if (wasLocked && !lockManualTargets) {
        payloadBody.target_source = "growth_lead_agent";
      }

      const res = await apiRequest<{ data: HubResponse }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: payloadBody,
      });
      setHub(res.data);
      syncFormFromHub(res.data, false);
      setEditingSettings(false);
      setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      const targetLabel =
        (res.data.group.publish_target ?? customPublishTarget) === "fanpage"
          ? "Chỉ Fanpage cũ"
          : (res.data.group.publish_target ?? customPublishTarget) === "both"
            ? "Cả Group Cộng đồng & Fanpage"
            : "Chỉ Group Cộng đồng";
      showBanner(
        "success",
        `Đã lưu cấu hình Cộng đồng ("${res.data.group.name}") — Đích đăng: ${targetLabel} • Mục tiêu 4 tuần: ${res.data.stats.week1_target} → ${res.data.stats.week2_target} → ${res.data.stats.week3_target ?? customWeek3Target} → ${res.data.stats.week4_target ?? customWeek4Target} • Quota mời: ${res.data.group.daily_invite_limit ?? dailyInviteLimit} lượt/ngày.`
      );
      onUpdated?.();
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      mutatingSettingsRef.current = false;
      setBusyAction(null);
    }
  }

  async function handleSyncGrowthLeadTargets() {
    setBusyAction("sync_growth_lead_targets");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        sync_result: {
          applied: boolean;
          reason?: string;
          message?: string;
          week1_target: number;
          week2_target: number;
          week3_target: number;
          week4_target: number;
          daily_invite_limit: number;
          target_rationale: string | null;
        };
        data: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "sync_growth_lead_targets",
          force_recalculate: true,
          force_override_manual: true,
        },
      });
      setHub(res.data);
      syncFormFromHub(res.data, false);
      setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      showBanner(
        res.sync_result.applied ? "success" : "warning",
        res.sync_result.applied
          ? `🤖 Growth Lead Agent đã phân tích số liệu thực tế & tự động áp dụng mục tiêu mới: Tuần 1 (${res.sync_result.week1_target}) → Tuần 2 (${res.sync_result.week2_target}) → Tuần 3 (${res.sync_result.week3_target}) → Tuần 4 (${res.sync_result.week4_target}) thành viên • Giới hạn mời an toàn: ${res.sync_result.daily_invite_limit} lượt/ngày.`
          : `⚠️ Không thể áp dụng tự động mục tiêu Growth Lead (${res.sync_result.reason || "locked_manual"}).${res.sync_result.message ? ` ${res.sync_result.message}` : ""}`
      );
      onUpdated?.();
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleToggleCommunityAutomation(
    field: "auto_reply_comments" | "auto_invite_enabled",
    nextVal: boolean
  ) {
    const prevVal = field === "auto_reply_comments" ? autoReplyComments : autoInviteEnabled;
    mutatingSettingsRef.current = true;
    if (field === "auto_reply_comments") setAutoReplyComments(nextVal);
    if (field === "auto_invite_enabled") setAutoInviteEnabled(nextVal);
    setBusyAction(`toggle_${field}`);
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{ data: HubResponse }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "update_settings",
          [field]: nextVal,
        },
      });
      setHub(res.data);
      if (field === "auto_reply_comments") setAutoReplyComments(nextVal);
      if (field === "auto_invite_enabled") setAutoInviteEnabled(nextVal);
      setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      showBanner(
        "success",
        field === "auto_reply_comments"
          ? nextVal
            ? "✅ Đã BẬT chế độ Tự động trả lời Bình luận bằng RAG trên Fanpage & Group."
            : "⏸️ Đã TẠM TẮT chế độ Tự động trả lời Bình luận (chỉ thu thập để xem trước)."
          : nextVal
            ? `✅ Đã BẬT chế độ Tự động gửi Lời mời Tham gia Group an toàn (tối đa ${res.data.group.daily_invite_limit ?? dailyInviteLimit} lượt/ngày).`
            : "⏸️ Đã TẠM TẮT chế độ Tự động gửi Lời mời Tham gia Group."
      );
      onUpdated?.();
    } catch (err) {
      if (field === "auto_reply_comments") setAutoReplyComments(prevVal);
      if (field === "auto_invite_enabled") setAutoInviteEnabled(prevVal);
      showBanner("error", (err as Error).message);
    } finally {
      mutatingSettingsRef.current = false;
      setBusyAction(null);
    }
  }

  async function handleScanComments() {
    setBusyAction("scan_comments");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        scan_result: {
          page_ingested: number;
          group_ingested: number;
          queued_for_rag: number;
          auto_reply_comments: boolean;
          auto_replies_sent?: number;
          page_replies_sent?: number;
          group_replies_sent?: number;
          warnings: string[];
        };
        data: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: { action: "scan_comments", include_group_bot: true },
      });
      setHub(res.data);
      setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      const warnSuffix =
        res.scan_result.warnings.length > 0
          ? ` (Lưu ý: ${res.scan_result.warnings.join(" | ")})`
          : "";
      const replySentInfo =
        res.scan_result.auto_replies_sent !== undefined && res.scan_result.auto_replies_sent > 0
          ? ` • ĐÃ TỰ ĐỘNG ĐĂNG ${res.scan_result.auto_replies_sent} TRẢ LỜI LÊN FACEBOOK (Page: ${res.scan_result.page_replies_sent ?? 0}, Group: ${res.scan_result.group_replies_sent ?? 0})`
          : "";
      showBanner(
        res.scan_result.warnings.length > 0 ? "warning" : "success",
        `💬 Đã quét bình luận thật (Fanpage: +${res.scan_result.page_ingested}, Group: +${res.scan_result.group_ingested})${replySentInfo} • Đã xếp hàng ${res.scan_result.queued_for_rag} bình luận chờ trả lời RAG${res.scan_result.auto_reply_comments ? " (Auto-Reply ĐANG BẬT)" : " (Auto-Reply đang tắt)"}.${warnSuffix}`
      );
      onUpdated?.();
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDispatchCommentReplies() {
    setBusyAction("dispatch_replies");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        reply_result: {
          total_checked: number;
          replies_sent: number;
          page_replies: number;
          group_replies: number;
          failed_count: number;
        };
        data: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: { action: "dispatch_comment_replies", max_batch: 10 },
      });
      setHub(res.data);
      setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      if (res.reply_result.replies_sent > 0) {
        showBanner(
          "success",
          `✅ Đã tự động đăng thành công ${res.reply_result.replies_sent} câu trả lời bình luận lên Facebook (Fanpage: ${res.reply_result.page_replies}, Group: ${res.reply_result.group_replies})!`
        );
      } else if (res.reply_result.total_checked === 0) {
        showBanner("success", "👍 Hiện không có bình luận nào đang chờ trả lời.");
      } else {
        showBanner("warning", `⚠️ Đã kiểm tra ${res.reply_result.total_checked} bình luận nhưng chưa thể đăng (Lỗi/chờ: ${res.reply_result.failed_count}).`);
      }
      onUpdated?.();
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSendSafeInvites() {
    setBusyAction("send_safe_invites");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        invite_result: {
          invited_count: number;
          remaining_today: number;
          daily_limit: number;
          cap_reached: boolean;
          disabled?: boolean;
          results: { name: string; channel: string; status: string; detail: string }[];
        };
        data: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: { action: "send_safe_invites", max_batch: 5, include_native_group_ui: true },
      });
      setHub(res.data);
      setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      if (res.invite_result.disabled) {
        showBanner(
          "warning",
          "⚠️ Chế độ Tự động gửi lời mời vào Group đang TẮT. Hãy bật công tắc 'Tự động mời vào Group' trước khi chạy."
        );
      } else if (res.invite_result.cap_reached && res.invite_result.invited_count === 0) {
        showBanner(
          "warning",
          `🛡️ Đã chạm ngưỡng an toàn hôm nay (${res.invite_result.daily_limit}/${res.invite_result.daily_limit} lời mời). Hệ thống tự động nghỉ đến ngày mai để bảo vệ tài khoản khỏi bị Facebook hạn chế.`
        );
      } else {
        const detailSummary =
          res.invite_result.results
            .slice(0, 3)
            .map((r) => `${r.name} [${r.channel}]: ${r.detail}`)
            .join(" | ") || "Đã đồng bộ nhật ký lời mời";
        showBanner(
          res.invite_result.invited_count > 0 ? "success" : "warning",
          `✉️ Đã gửi ${res.invite_result.invited_count} lời mời tham gia Group an toàn (còn ${res.invite_result.remaining_today}/${res.invite_result.daily_limit} lượt hôm nay). ${detailSummary}`
        );
      }
      onUpdated?.();
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDiscoverOpportunities() {
    setBusyAction("discover_opportunities");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        opportunities: SearxngOpportunity[];
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: { action: "discover_opportunities" },
      });
      setSearxngOpportunities(res.opportunities ?? []);
      showBanner(
        (res.opportunities?.length ?? 0) > 0 ? "success" : "warning",
        (res.opportunities?.length ?? 0) > 0
          ? `🔍 SearXNG vừa tìm thấy ${res.opportunities.length} chủ đề & thảo luận công khai có người đang hỏi về du lịch/cư trú Việt Nam để mời vào cộng đồng.`
          : "🔍 Chưa tìm thêm được luồng thảo luận mới từ SearXNG (kiểm tra container SearXNG đang chạy ở cổng 18081)."
      );
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSyncTelegramBot(clearWebhookForPolling = false) {
    setBusyAction("sync_telegram_bot");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        success: boolean;
        message: string;
        telegram_bot?: TelegramBotStatus;
        data?: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "sync_telegram_bot",
          clear_webhook_for_polling: clearWebhookForPolling,
        },
      });
      if (res.data) {
        setHub(res.data);
      }
      setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      showBanner(res.success ? "success" : "warning", `✈️ ${res.message}`);
      onUpdated?.();
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  function startLoginSessionPolling(successVerb: string) {
    stopLoginPolling();
    let attempts = 0;
    loginPollTimerRef.current = setInterval(() => {
      attempts += 1;
      void (async () => {
        const latest = await syncFromServer({ showErrorOnFailure: false });
        const sess = latest?.group?.group_bot_session;
        if (sess?.isLoggedIn && !sess?.loginInProgress) {
          stopLoginPolling();
          setLoginWaitingOnEdge(false);
          const profileDesc = sess.usingPageProfile
            ? `Page Profile (${sess.accountIdMask ?? "***"})`
            : sess.accountIdMask
              ? `Tài khoản (${sess.accountIdMask})`
              : "Phiên Edge";
          showBanner(
            "success",
            `✅ Đã ${successVerb} Facebook Group Bot thành công [${profileDesc}]! Hệ thống sẵn sàng tự động đăng bài và trả lời comment trong Group.`
          );
          onUpdated?.();
        } else if (attempts >= 72) {
          stopLoginPolling();
        }
      })();
    }, 2500);
  }

  async function handleLaunchGroupBotLogin() {
    stopLoginPolling();
    setBusyAction("login_group_bot");
    setBannerMessage("");
    setBannerRecovery(null);
    setCopiedCliFallback(false);
    try {
      const res = await apiRequest<{
        status: string;
        started: boolean;
        alreadyRunning?: boolean;
        loginInProgress?: boolean;
        cliFallbackCommand?: string;
        message: string;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: { action: "login_group_bot", wait_confirm: true },
      });
      setCliFallbackCommand(
        res.cliFallbackCommand || "npm.cmd --prefix apps/worker run group-bot:login"
      );
      showBanner(res.started ? "warning" : "error", res.message);
      if (res.started) {
        setLoginWaitingOnEdge(true);
        startLoginSessionPolling("lưu phiên đăng nhập");
      }
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSwitchGroupBotAccount() {
    stopLoginPolling();
    setBusyAction("switch_group_bot_account");
    setBannerMessage("");
    setBannerRecovery(null);
    setCopiedCliFallback(false);
    try {
      const res = await apiRequest<{
        status: string;
        started: boolean;
        loginInProgress?: boolean;
        cliFallbackCommand?: string;
        message: string;
        data?: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: { action: "switch_group_bot_account" },
      });
      if (res.data) {
        setHub(res.data);
      }
      setCliFallbackCommand(
        res.cliFallbackCommand || "npm.cmd --prefix apps/worker run group-bot:switch"
      );
      showBanner(res.started ? "warning" : "error", res.message);
      if (res.started) {
        setLoginWaitingOnEdge(true);
        startLoginSessionPolling("đổi sang tài khoản / Trang Quản trị viên mới cho");
      }
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCompleteGroupBotLogin() {
    setBusyAction("complete_group_bot_login");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        completed: boolean;
        session: GroupBotSessionStatus;
        cliFallbackCommand?: string;
        message: string;
        data?: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: { action: "complete_group_bot_login" },
      });
      if (res.cliFallbackCommand) {
        setCliFallbackCommand(res.cliFallbackCommand);
      }
      if (res.data) {
        setHub(res.data);
        setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      }
      if (res.completed) {
        stopLoginPolling();
        setLoginWaitingOnEdge(false);
        showBanner("success", `✅ ${res.message}`);
        onUpdated?.();
      } else {
        showBanner("warning", `⏳ ${res.message}`);
      }
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleVerifyGroupBotSession() {
    setBusyAction("verify_group_bot");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        isLoggedIn: boolean;
        sessionSource: "file" | "cookie" | "none";
        usingPageProfile?: boolean;
        accountIdMask?: string;
        loginInProgress?: boolean;
        detail?: string;
        data?: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: { action: "verify_group_bot" },
      });
      if (res.data) {
        setHub(res.data);
        setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      }
      if (!res.loginInProgress) {
        setLoginWaitingOnEdge(false);
      }
      if (res.isLoggedIn) {
        const profileNote = res.usingPageProfile
          ? ` [Đang dùng Page Profile ${res.accountIdMask ?? ""}]`
          : res.accountIdMask
            ? ` [${res.accountIdMask}]`
            : "";
        showBanner(
          "success",
          `✅ ${res.detail || "Phiên Quản trị viên Facebook Group Bot đang hoạt động và sẵn sàng tự động đăng bài vào Group!"}${profileNote}`
        );
        onUpdated?.();
      } else {
        showBanner(
          "warning",
          `⚠️ ${res.detail || "Chưa phát hiện phiên đăng nhập Quản trị viên Facebook Group. Hãy bấm 'Mở Edge Đăng nhập Group Bot (1 lần)'."}`
        );
      }
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSyncPostStats() {
    setBusyAction("sync_post_stats");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        sync_stats_result: {
          fanpage_posts_synced: number;
          group_posts_synced: number;
          total_likes: number;
          total_comments: number;
          total_shares: number;
          warnings: string[];
        };
        data: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: { action: "sync_post_stats", include_group_bot: true },
      });
      if (res.data) {
        setHub(res.data);
        setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      }
      const r = res.sync_stats_result;
      const warnSuffix = r.warnings.length > 0 ? ` (${r.warnings.join(" | ")})` : "";
      showBanner(
        r.warnings.length > 0 && r.fanpage_posts_synced + r.group_posts_synced === 0 ? "warning" : "success",
        `📊 Đã đồng bộ thống kê ${r.group_posts_synced} bài Group & ${r.fanpage_posts_synced} bài Fanpage: ${r.total_likes} Likes · ${r.total_comments} Comments · ${r.total_shares} Chia sẻ.${warnSuffix}`
      );
      onUpdated?.();
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleScanMembers(includeManualProspect = false) {
    setBusyAction("scan");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const shouldCreateManual =
        includeManualProspect && Boolean(prospectName.trim() && prospectSignal.trim());
      const res = await apiRequest<{ data: HubResponse }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "scan_members",
          ...(shouldCreateManual
            ? { display_name: prospectName.trim(), signal: prospectSignal.trim(), campaign_week: 2 }
            : {}),
        },
      });
      setHub(res.data);
      if (shouldCreateManual) {
        setProspectName("");
        setProspectSignal("");
      }
      setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      showBanner(
        "success",
        shouldCreateManual
          ? `Đã ghi nhận khách tiềm năng mới và đồng bộ dữ liệu Cộng đồng (${res.data.stats.real_group_members} thành viên Group).`
          : `Đã đồng bộ trực tiếp số thành viên Group (${res.data.stats.real_group_members} thành viên) & hộp thư Messenger thật trên Fanpage "${res.data.group.page_name}".`
      );
      onUpdated?.();
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSendMessengerInvite(externalRef?: string) {
    setBusyAction(externalRef || "invite_all");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        invite_result: { sent_count: number; results: { name: string; status: string; detail: string }[] };
        data: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "send_messenger_invite",
          ...(externalRef ? { external_ref: externalRef } : {}),
        },
      });
      setHub(res.data);
      const summary = res.invite_result.results
        .map((r) => `${r.name}: ${r.detail}`)
        .join(" | ");
      showBanner(
        res.invite_result.sent_count > 0 ? "success" : "warning",
        `Kết quả gửi lời mời tham gia Group (${res.data.group.group_url}) qua Messenger thật: ${summary}`
      );
      onUpdated?.();
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateDiscussion(e: React.FormEvent) {
    e.preventDefault();
    if (!discussionTitle.trim() || !discussionBody.trim()) return;
    setBusyAction("discussion");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{ data: HubResponse }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "create_discussion",
          category: "Thảo luận Cộng đồng",
          title: discussionTitle.trim(),
          body: discussionBody.trim(),
          discussion_prompt:
            discussionPrompt.trim() ||
            "Chia sẻ góc nhìn và kinh nghiệm thực tế của bạn cùng các thành viên trong cộng đồng mình nhé!",
        },
      });
      setHub(res.data);
      setDiscussionTitle("");
      setDiscussionBody("");
      setDiscussionPrompt("");
      showBanner("success", `Đã tạo chủ đề thảo luận mới trong "${res.data.group.name}"!`);
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePublishFreshPost(
    sourceId?: string,
    recoveryMeta?: { title: string; body: string; prompt: string }
  ) {
    setBusyAction(sourceId || "publish_fresh");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status?: string;
        published: {
          status?: string;
          error_code?: string;
          error?: string;
          publish_target?: PublishTarget;
          title: string;
          website_slug: string | null;
          image_url: string;
          group_post_url?: string;
          group_url?: string;
        };
        data: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "publish_fresh_post",
          ...(sourceId ? { source_id: sourceId } : {}),
        },
      });
      setHub(res.data);
      setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));

      const pubStatus = res.published?.status ?? res.status ?? "published";
      const usedTarget = res.published?.publish_target ?? res.data.group.publish_target ?? "group";

      if (pubStatus === "group_session_required" || pubStatus === "group_publish_failed") {
        const fallbackRecovery = recoveryMeta ?? {
          title: res.published.title,
          body: res.published.website_slug
            ? `Bài viết chi tiết: http://localhost:3001/posts/${res.published.website_slug}\n\nKhám phá kinh nghiệm thực tế về "${res.published.title}".`
            : `Khám phá kinh nghiệm thực tế về "${res.published.title}".`,
          prompt: `Kinh nghiệm thực tế của bạn về "${res.published.title}" là gì? Chia sẻ cùng ${res.data.group.name} nhé!`,
        };
        showBanner(
          pubStatus === "group_session_required" ? "warning" : "error",
          `⚠️ Chưa đăng được bài "${res.published.title}" lên Group "${res.data.group.name}" (${res.published.error || res.published.error_code || pubStatus}). Bài Website (/posts/${res.published.website_slug ?? "post"}) đã sẵn sàng và hệ thống KHÔNG đẩy nhầm sang Fanpage.`,
          fallbackRecovery
        );
      } else {
        const destText =
          usedTarget === "fanpage"
            ? `Fanpage "${res.data.group.page_name}"`
            : usedTarget === "both"
              ? `Group Cộng đồng "${res.data.group.name}" & Fanpage "${res.data.group.page_name}"`
              : `Group Cộng đồng "${res.data.group.name}"`;
        showBanner(
          "success",
          `✅ Đã xuất bản bài viết "${res.published.title}" lên Website (/posts/${res.published.website_slug ?? "post"}) và đăng thẳng lên ${destText}!`
        );
      }
      onUpdated?.();
    } catch (err) {
      showBanner("error", (err as Error).message, recoveryMeta ?? null);
    } finally {
      setBusyAction(null);
    }
  }

  /** Posts the topic's video as a Reel for a card that is already on the Fanpage (posts from before Reels existed). */
  async function handlePublishReel(sourceId: string, title: string) {
    if (!window.confirm(`Đăng video của "${title}" lên Fanpage dạng Reel? Video sẽ công khai ngay.`)) return;
    setBusyAction(`reel:${sourceId}`);
    setBannerMessage("");
    try {
      const res = await apiRequest<{ data: HubResponse }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: { action: "publish_reel", source_id: sourceId },
      });
      setHub(res.data);
      setBannerMessage(`Đã gửi video "${title}" lên hàng đợi; Reel sẽ xuất hiện trên Fanpage trong ít phút.`);
    } catch (err) {
      setBannerMessage((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  /**
   * Facebook removed the Groups API (Graph API v19, April 2024), so nothing can post to a Group for us. This does every
   * step but the last: copy the text, download the topic's video, open the Group; the person pastes, attaches, posts.
   */
  async function handleCopyAndOpenGroup(title: string, bodyText: string, promptText: string, video?: TopicVideo | null) {
    if (!hub) return;
    const postContent = [
      `🇻🇳 [CẨM NANG CỘNG ĐỒNG] ${title}`,
      "",
      bodyText,
      "",
      `💬 ${promptText}`,
      "",
      `#CongDongDuLich #DichVuHoTroDuLich #DaNang #ExploreVietnam`,
    ].join("\n");
    if (video) {
      // The API answers download=1 with Content-Disposition: attachment, so this saves the file without leaving the page.
      const a = document.createElement("a");
      a.href = `${API_BASE_URL}${video.path}&download=1`;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    const videoNote = video ? " Video của chủ đề đang tải về thư mục Downloads: kéo file vào ô bài viết." : "";
    try {
      await navigator.clipboard.writeText(postContent);
      showBanner(
        "success",
        `Đã copy sẵn toàn bộ nội dung bài "${title}" vào bộ nhớ tạm! Cửa sổ Group "${hub.group.name}" đã mở — bạn chỉ cần bấm vào ô "Bạn viết gì đi..." và nhấn Ctrl + V để đăng vào Nhóm.${videoNote}`
      );
    } catch {
      showBanner(
        "warning",
        `Đã mở Group "${hub.group.name}". Bạn có thể sao chép nội dung bài "${title}" để dán trực tiếp vào Nhóm.${videoNote}`
      );
    }
    window.open(hub.group.group_url, "_blank", "noopener,noreferrer");
  }

  async function handlePostGroupViaBot(
    title: string,
    bodyText: string,
    promptText?: string,
    imageUrl?: string,
    meta?: { sourceId?: string }
  ) {
    setBusyAction(title);
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        botResult: { success: boolean; message: string; groupUrl?: string; postUrl?: string; errorCode?: string };
        data: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "post_group_bot",
          title,
          body: bodyText,
          discussion_prompt: promptText,
          image_url: imageUrl,
          ...(meta?.sourceId ? { source_id: meta.sourceId } : {}),
        },
      });
      if (res.data) setHub(res.data);
      if (res.botResult?.success) {
        showBanner("success", `✅ ${res.botResult.message}`);
        onUpdated?.();
      } else {
        const isSessionMissing = res.botResult?.errorCode === "FACEBOOK_GROUP_SESSION_MISSING";
        showBanner(
          isSessionMissing ? "warning" : "error",
          `⚠️ ${res.botResult?.message || "Không thể đăng bài qua Bot Quản trị viên."}`,
          {
            title,
            body: bodyText,
            prompt: promptText || `Chia sẻ kinh nghiệm của bạn về "${title}" nhé!`,
          }
        );
      }
    } catch (err) {
      showBanner("error", (err as Error).message, {
        title,
        body: bodyText,
        prompt: promptText || "",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleScheduleAllPosts() {
    setBusyAction("schedule_all");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        result: { publish_target?: PublishTarget; scheduled_count: number };
        data: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "schedule_all_posts",
        },
      });
      setHub(res.data);
      setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      const usedTarget = res.result.publish_target ?? res.data.group.publish_target ?? "group";
      const destLabel =
        usedTarget === "fanpage"
          ? `Fanpage "${res.data.group.page_name}"`
          : usedTarget === "both"
            ? `Group "${res.data.group.name}" & Fanpage "${res.data.group.page_name}"`
            : `Group Cộng đồng "${res.data.group.name}"`;
      showBanner(
        "success",
        `✅ Agent đã đồng bộ lịch cho ${res.result.scheduled_count} bài vào Hàng đợi Tự động (publishing_jobs & outbox_events)! Khi đến đúng giờ hẹn, Worker 24/7 sẽ tự động đăng lên Website và ${destLabel}.`
      );
      onUpdated?.();
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReschedulePost(sourceId: string, fallbackIso?: string) {
    const chosenLocal = customScheduleMap[sourceId] || toDatetimeLocalValue(fallbackIso);
    const scheduledIso = parseVnDatetimeLocalToIso(chosenLocal);
    if (!scheduledIso) return;
    setBusyAction(`reschedule_${sourceId}`);
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        result: { scheduled_for: string; job_id: string };
        data: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "reschedule_post",
          source_id: sourceId,
          scheduled_for: scheduledIso,
        },
      });
      setHub(res.data);
      setCustomScheduleMap((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
      setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      const formatted = new Date(res.result.scheduled_for).toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      showBanner(
        "success",
        `⏰ Đã cập nhật giờ hẹn tự động đăng bài vào Cộng đồng: ${formatted} (Giờ VN)! Worker chạy ngầm sẽ tự động xử lý khi đến giờ này.`
      );
      onUpdated?.();
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRetractGroupPost(item: DailyCalendarItem) {
    setBusyAction(`retract_${item.source_id}`);
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        retractResult: { success: boolean; message: string; errorCode?: string };
        data: HubResponse;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "retract_group_post",
          source_id: item.source_id,
          post_url: item.group_post_url || item.facebook_post_url || undefined,
          title: item.topic_title,
        },
      });
      if (res.data) {
        setHub(res.data);
        setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      }
      if (res.retractResult?.success) {
        showBanner(
          "success",
          `🗑️ ${res.retractResult.message} Bài "${item.topic_title}" đã được đặt lại trạng thái sẵn sàng để bạn đăng lại bản chuẩn.`
        );
        onUpdated?.();
      } else {
        showBanner(
          "error",
          `⚠️ ${res.retractResult?.message || "Không thể thu hồi bài viết trên Group Facebook."}`
        );
      }
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  if (loading && !hub) {
    return (
      <section className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-blue-800">
          Đang đồng bộ trực tiếp dữ liệu từ Facebook Group, Fanpage & Kế hoạch Nội dung của bạn…
        </p>
      </section>
    );
  }

  if (!hub) return null;

  const targetMode: PublishTarget = hub.group.publish_target ?? "group";
  const groupBotSession = hub.group.group_bot_session;
  const isEdgeLoginOpen = loginWaitingOnEdge || Boolean(groupBotSession?.loginInProgress);
  const todayVn = getTodayVnParts();

  const publishedGroupCount =
    hub.stats.published_group_count ??
    hub.calendar.daily.filter((d) => d.is_published_group).length;
  const publishedFanpageCount =
    hub.stats.published_fanpage_count ??
    hub.calendar.daily.filter((d) => d.is_published_fanpage).length;
  const scheduledGroupCount =
    hub.stats.scheduled_group_count ??
    hub.calendar.daily.filter((d) => d.group_status === "scheduled").length;
  const failedGroupCount =
    hub.stats.failed_group_count ??
    hub.calendar.daily.filter((d) => d.group_status === "failed").length;
  const fanpageOnlyCount = hub.calendar.daily.filter(
    (d) => d.is_published_fanpage && !d.is_published_group
  ).length;

  const publishedCount =
    hub.stats.published_topics_count ??
    hub.calendar.daily.filter((d) => d.status === "published").length;
  const scheduledFilterCount =
    targetMode === "fanpage"
      ? hub.calendar.daily.length - publishedCount
      : hub.calendar.daily.filter((d) => d.status !== "published" && d.group_status !== "failed").length;

  const dayCountsMap = new Map<string, { total: number; published: number; scheduled: number }>();
  const monthCountsMap = new Map<string, number>();
  const yearCountsMap = new Map<string, number>();

  for (const item of hub.calendar.daily) {
    const parts = extractItemDateParts(item);
    const matchMonthForDay = selectedMonth === "all" || parts.monthStr === selectedMonth;
    const matchYearForDay = selectedYear === "all" || parts.yearStr === selectedYear;
    if (matchMonthForDay && matchYearForDay) {
      const prevDay = dayCountsMap.get(parts.dayStr) ?? { total: 0, published: 0, scheduled: 0 };
      prevDay.total += 1;
      if (item.status === "published") prevDay.published += 1;
      else prevDay.scheduled += 1;
      dayCountsMap.set(parts.dayStr, prevDay);
    }

    if (matchYearForDay) {
      monthCountsMap.set(parts.monthStr, (monthCountsMap.get(parts.monthStr) ?? 0) + 1);
    }
    yearCountsMap.set(parts.yearStr, (yearCountsMap.get(parts.yearStr) ?? 0) + 1);
  }

  const filteredDailyItems = hub.calendar.daily.filter((item) => {
    if (dailyFilter === "published" && item.status !== "published") return false;
    if (dailyFilter === "scheduled") {
      if (item.status === "published") return false;
      if (targetMode !== "fanpage" && item.group_status === "failed") return false;
    }
    if (dailyFilter === "failed" && item.group_status !== "failed") return false;
    if (dailyFilter === "fanpage_only" && !(item.is_published_fanpage && !item.is_published_group)) return false;
    if (dailyFilter.startsWith("week")) {
      const targetWeekNum = Number(dailyFilter.slice(4));
      if (Number.isFinite(targetWeekNum) && item.week_number !== targetWeekNum) return false;
    }

    const parts = extractItemDateParts(item);
    if (selectedExactDate && parts.dateIso !== selectedExactDate) return false;
    if (selectedDay !== "all" && parts.dayStr !== selectedDay) return false;
    if (selectedMonth !== "all" && parts.monthStr !== selectedMonth) return false;
    if (selectedYear !== "all" && parts.yearStr !== selectedYear) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const matchTitle = item.topic_title.toLowerCase().includes(q);
      const matchTrend = item.target_trend.toLowerCase().includes(q);
      const matchTags = (item.interest_tags || []).some((t) => t.toLowerCase().includes(q));
      const matchDate = (item.scheduled_date_vn || "").toLowerCase().includes(q);
      if (!matchTitle && !matchTrend && !matchTags && !matchDate) return false;
    }

    return true;
  });

  const nextUpcomingItem = hub.calendar.daily.find((i) => i.status !== "published") ?? null;
  const nextUpcomingParts = nextUpcomingItem ? extractItemDateParts(nextUpcomingItem) : null;
  const availableYears = Array.from(new Set(["2026", "2027", ...Array.from(yearCountsMap.keys())])).sort();

  const filteredPublishedCount = filteredDailyItems.filter((i) => i.status === "published").length;
  const filteredFailedCount =
    targetMode === "fanpage"
      ? 0
      : filteredDailyItems.filter((i) => i.status !== "published" && i.group_status === "failed").length;
  const filteredScheduledCount = filteredDailyItems.length - filteredPublishedCount - filteredFailedCount;
  const hasActiveCustomFilter =
    dailyFilter !== "all" ||
    selectedDay !== "all" ||
    selectedMonth !== "all" ||
    selectedYear !== "all" ||
    Boolean(selectedExactDate) ||
    Boolean(searchQuery.trim());

  const totalDailyPages = Math.max(1, Math.ceil(filteredDailyItems.length / dailyPageSize));
  const currentDailyPage = Math.min(Math.max(1, dailyPage), totalDailyPages);
  const dailyStartIndex = (currentDailyPage - 1) * dailyPageSize;
  const paginatedDailyItems = filteredDailyItems.slice(dailyStartIndex, dailyStartIndex + dailyPageSize);

  function extractPublishedDateParts(item: DailyCalendarItem): {
    dayStr: string;
    monthStr: string;
    yearStr: string;
    dateIso: string;
    timeHm: string;
    dateDisplay: string;
    timestampMs: number;
  } {
    const rawIso =
      (archiveChannelFilter === "fanpage"
        ? item.fanpage_published_at
        : archiveChannelFilter === "group"
          ? item.group_published_at
          : item.group_published_at || item.published_at || item.fanpage_published_at) || item.scheduled_iso;
    if (rawIso) {
      const parsed = new Date(rawIso);
      if (!Number.isNaN(parsed.getTime())) {
        const vn = new Date(parsed.getTime() + 7 * 3600_000);
        const dayStr = String(vn.getUTCDate()).padStart(2, "0");
        const monthStr = String(vn.getUTCMonth() + 1).padStart(2, "0");
        const yearStr = String(vn.getUTCFullYear());
        const timeHm = `${String(vn.getUTCHours()).padStart(2, "0")}:${String(vn.getUTCMinutes()).padStart(2, "0")}`;
        return {
          dayStr,
          monthStr,
          yearStr,
          dateIso: `${yearStr}-${monthStr}-${dayStr}`,
          timeHm,
          dateDisplay: `${dayStr}/${monthStr}/${yearStr}`,
          timestampMs: parsed.getTime(),
        };
      }
    }
    const fallback = extractItemDateParts(item);
    return { ...fallback, timestampMs: 0 };
  }

  const primaryPublishedItems = hub.calendar.daily.filter((item) => item.status === "published");
  const anyChannelPublishedItems = hub.calendar.daily.filter(
    (item) =>
      item.status === "published" ||
      Boolean(item.is_published_group) ||
      Boolean(item.is_published_fanpage) ||
      Boolean(item.published_slug)
  );

  const archiveChannelScopedItems = hub.calendar.daily.filter((item) => {
    if (archiveChannelFilter === "primary") return item.status === "published";
    if (archiveChannelFilter === "group") return Boolean(item.is_published_group || item.group_status === "published");
    if (archiveChannelFilter === "website") return Boolean(item.published_slug);
    if (archiveChannelFilter === "fanpage") return Boolean(item.is_published_fanpage || item.fanpage_post_url);
    return (
      item.status === "published" ||
      Boolean(item.is_published_group) ||
      Boolean(item.is_published_fanpage) ||
      Boolean(item.published_slug)
    );
  });

  const filteredArchiveItems = archiveChannelScopedItems
    .filter((item) => {
      const p = extractPublishedDateParts(item);
      if (archiveExactDate && p.dateIso !== archiveExactDate) return false;
      if (archiveDay !== "all" && p.dayStr !== archiveDay) return false;
      if (archiveMonth !== "all" && p.monthStr !== archiveMonth) return false;
      if (archiveYear !== "all" && p.yearStr !== archiveYear) return false;
      if (archiveSearch.trim()) {
        const q = archiveSearch.trim().toLowerCase();
        const hitTitle = item.topic_title.toLowerCase().includes(q);
        const hitTrend = item.target_trend.toLowerCase().includes(q);
        const hitTags = (item.interest_tags || []).some((t) => t.toLowerCase().includes(q));
        const hitBody = (item.post_body_preview || "").toLowerCase().includes(q);
        if (!hitTitle && !hitTrend && !hitTags && !hitBody) return false;
      }
      return true;
    })
    .sort((a, b) => extractPublishedDateParts(b).timestampMs - extractPublishedDateParts(a).timestampMs);

  const archiveGroupsByDate = Array.from(
    filteredArchiveItems.reduce((map, item) => {
      const p = extractPublishedDateParts(item);
      const list = map.get(p.dateDisplay) ?? [];
      list.push(item);
      map.set(p.dateDisplay, list);
      return map;
    }, new Map<string, DailyCalendarItem[]>())
  );

  const hasArchiveFilter =
    archiveDay !== "all" ||
    archiveMonth !== "all" ||
    archiveYear !== "all" ||
    Boolean(archiveExactDate) ||
    Boolean(archiveSearch.trim());

  const weekEntries =
    hub.calendar.weekly.length > 0
      ? hub.calendar.weekly
      : [1, 2, 3, 4].map((wNum) => ({
          week_number: wNum,
          week_label: `Tuần ${wNum}`,
          date_range:
            wNum === 1
              ? "02/11/2026 – 08/11/2026"
              : wNum === 2
                ? "09/11/2026 – 15/11/2026"
                : wNum === 3
                  ? "16/11/2026 – 22/11/2026"
                  : "23/11/2026 – 30/11/2026",
          member_target: "",
          pillar_theme: "",
          planned_topics: [],
          interactive_format: "",
        }));

  const weekSummaryStats = weekEntries.map((wk) => {
    const wNum = wk.week_number;
    const items = hub.calendar.daily.filter((i) => i.week_number === wNum);
    const pub = items.filter((i) => i.status === "published").length;
    const fail =
      targetMode === "fanpage"
        ? 0
        : items.filter((i) => i.status !== "published" && i.group_status === "failed").length;
    const sched = items.length - pub - fail;
    const dateRange = wk.date_range || wk.week_label;
    return {
      weekNum: wNum,
      id: `week${wNum}` as WeekFilterId,
      total: items.length,
      pub,
      fail,
      sched,
      dateRange,
    };
  });

  const memberDelta = hub.stats.member_growth_delta ?? 0;
  const engagementDelta = hub.stats.engagement_growth_delta ?? 0;
  const currentCampaignWeek = hub.stats.current_campaign_week ?? 2;
  const currentMembersCount = hub.stats.real_group_members ?? hub.stats.week1_achieved;
  const w3Target = hub.stats.week3_target ?? 18;
  const w4Target = hub.stats.week4_target ?? 30;
  const currentWeekTargetCount =
    currentCampaignWeek === 1
      ? hub.stats.week1_target
      : currentCampaignWeek === 3
        ? w3Target
        : currentCampaignWeek === 4
          ? w4Target
          : hub.stats.week2_target;
  const currentWeekProgressCount =
    currentCampaignWeek === 1 ? hub.stats.week1_achieved : hub.stats.week2_progress;
  const currentWeekProgressPct = Math.min(
    100,
    Math.round((currentWeekProgressCount / Math.max(1, currentWeekTargetCount)) * 100)
  );
  const effectiveInviteLimit = hub.stats.daily_invite_limit ?? dailyInviteLimit;
  const invitesSentToday = hub.stats.invites_sent_today ?? 0;
  const invitesRemainingToday =
    hub.stats.invites_remaining_today ?? Math.max(0, effectiveInviteLimit - invitesSentToday);

  const hubTabs: { id: HubTabId; label: string }[] = [
    { id: "calendar", label: `Bài viết & Lịch xuất bản (${hub.calendar.daily.length})` },
    { id: "published_archive", label: `Kho bài đã đăng & Thống kê (${primaryPublishedItems.length})` },
    { id: "campaigns", label: `Hội thoại RAG, Mời Group & Lộ trình (${(hub.recent_comments ?? []).length})` },
    { id: "discussions", label: `Thảo luận Cộng đồng (${hub.discussions.length})` },
    { id: "architecture", label: "Kiến trúc 4 Agent & RAG" },
  ];

  const renderPaginationBar = (
    currentPage: number,
    totalPages: number,
    totalItems: number,
    pageSize: number,
    onPageChange: (page: number) => void,
    position: "header" | "footer" = "header"
  ) => {
    if (totalItems === 0) return null;
    const startIdx = (currentPage - 1) * pageSize;
    const endIdx = Math.min(startIdx + pageSize, totalItems);
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-600">
          Hiển thị <strong>{startIdx + 1}–{endIdx}</strong> / {totalItems} (Trang <strong>{currentPage}/{totalPages}</strong>)
        </span>
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            {position === "footer" && (
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => onPageChange(1)}
                className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
              >
                « Đầu
              </button>
            )}
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
            >
              Trước
            </button>
            {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pNum) => (
              <button
                key={pNum}
                type="button"
                onClick={() => onPageChange(pNum)}
                className={`w-7 h-7 rounded-lg font-semibold transition-colors ${
                  pNum === currentPage
                    ? "bg-blue-700 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {pNum}
              </button>
            ))}
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
            >
              Sau
            </button>
            {position === "footer" && (
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange(totalPages)}
                className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
              >
                Cuối »
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // Compact vertical card for 3-column grid (matching Google Maps Tab 2 Drive Assets card layout)
  const renderCompactPostRow = (item: DailyCalendarItem, keyPrefix = "item") => {
    const isPublished = item.status === "published";
    const isGroupPublished = Boolean(item.is_published_group || item.group_status === "published");
    const isFanpagePublished = Boolean(item.is_published_fanpage || item.fanpage_post_url);
    const isGroupFailed = targetMode !== "fanpage" && !isGroupPublished && item.group_status === "failed";
    const dateParts = isPublished ? extractPublishedDateParts(item) : extractItemDateParts(item);
    const primaryGroupHref =
      (isGroupPublished ? item.group_post_url || item.facebook_post_url : null) || hub.group.group_url;
    const fanpageHref =
      item.fanpage_post_url || (targetMode === "fanpage" ? item.facebook_post_url : null) || hub.group.page_url;

    return (
      <article
        key={`${keyPrefix}_${item.source_id}`}
        className="rounded-xl border border-slate-200 bg-white overflow-hidden transition-colors hover:border-blue-400 flex flex-col"
      >
        {/* Ảnh đầu thẻ gọn gàng chuẩn lưới 3 cột */}
        {item.image_url && (
          <div className="relative h-40 bg-slate-100 border-b border-slate-100">
            <img
              src={item.image_url}
              alt={item.published_post_title || item.topic_title}
              loading="lazy"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1">
              <span className="rounded-md bg-white/95 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                Bài #{item.day_index} · Tuần {item.week_number}
              </span>
            </div>
            <div className="absolute top-2 right-2">
              {isPublished ? (
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  Đã đăng ({dateParts.dateDisplay})
                </span>
              ) : isGroupFailed ? (
                <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
                  Lỗi đăng ({dateParts.dateDisplay})
                </span>
              ) : (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                  Hẹn {dateParts.dateDisplay} · {dateParts.timeHm}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Nội dung chính của thẻ */}
        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {!item.image_url && (
                <span className="rounded-md bg-slate-900 px-2 py-0.5 font-semibold text-white">
                  Bài #{item.day_index} · Tuần {item.week_number}
                </span>
              )}
              <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                {isPublished
                  ? `Đăng ngày ${dateParts.dateDisplay} lúc ${dateParts.timeHm}`
                  : `Lịch hẹn: ${dateParts.dateDisplay} lúc ${dateParts.timeHm}`}
              </span>
              {isGroupPublished && (
                <span className="rounded-md bg-blue-50 px-2 py-0.5 font-semibold text-blue-800">
                  Group
                </span>
              )}
              {item.published_slug && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  Web
                </span>
              )}
              {isFanpagePublished && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  Fanpage
                </span>
              )}
            </div>

            <h4 className="font-semibold text-sm text-slate-900 leading-snug line-clamp-2">
              {item.published_post_title || item.topic_title}
            </h4>

            <p className="text-xs text-slate-600 line-clamp-2">
              {item.post_body_preview || item.community_discussion_hook}
            </p>

            {item.engagement && (item.engagement.total_engagement > 0 || isPublished) && (
              <div className="text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1">
                Thích: {item.engagement.likes} · Bình luận: {item.engagement.comments} · Chia sẻ: {item.engagement.shares}
              </div>
            )}

            {isGroupFailed && item.group_error && (
              <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-2.5 py-1 line-clamp-2">
                Lỗi Group Bot: {item.group_error}
              </p>
            )}
          </div>

          {/* Cụm nút hành động dưới chân thẻ */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            {isPublished ? (
              <div className="grid grid-cols-2 gap-1.5">
                {targetMode !== "fanpage" ? (
                  <a
                    href={primaryGroupHref}
                    target="_blank"
                    rel="noreferrer"
                    className="py-1.5 px-2 rounded-lg text-xs font-semibold border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-center"
                  >
                    Xem trên Group
                  </a>
                ) : (
                  <a
                    href={fanpageHref}
                    target="_blank"
                    rel="noreferrer"
                    className="py-1.5 px-2 rounded-lg text-xs font-semibold border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-center"
                  >
                    Xem Fanpage
                  </a>
                )}
                {item.published_slug ? (
                  <a
                    href={`http://localhost:3001/posts/${item.published_slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="py-1.5 px-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-center"
                  >
                    Xem bài Web
                  </a>
                ) : (
                  <a
                    href={fanpageHref}
                    target="_blank"
                    rel="noreferrer"
                    className="py-1.5 px-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-center"
                  >
                    Xem Fanpage
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                <button
                  type="button"
                  disabled={!canEdit || !!busyAction}
                  onClick={() =>
                    void handlePublishFreshPost(item.source_id, {
                      title: item.topic_title,
                      body: buildShareableCardBody(item),
                      prompt: item.community_discussion_hook,
                    })
                  }
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {busyAction === item.source_id
                    ? "Đang đăng..."
                    : targetMode === "fanpage"
                      ? "Đăng ngay lên Fanpage"
                      : "Đăng ngay vào Group"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleCopyAndOpenGroup(
                      item.topic_title,
                      buildShareableCardBody(item),
                      item.community_discussion_hook
                    )
                  }
                  className="w-full py-1.5 px-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-center"
                >
                  Copy &amp; Mở Group
                </button>
              </div>
            )}

            {/* Phần mở rộng thu gọn */}
            <details className="pt-1 text-xs">
              <summary className="cursor-pointer font-semibold text-slate-600 hover:text-slate-900 select-none">
                {isPublished ? "Xem nội dung, video & thao tác" : "Xem nội dung, video & đổi lịch hẹn"}
              </summary>
              <div className="mt-2.5 space-y-2.5">
                {item.post_body_preview && (
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 whitespace-pre-wrap leading-relaxed text-slate-800">
                    {item.post_body_preview}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-1">
                  {(item.interest_tags || []).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {item.video && (
                  <TopicVideoPanel
                    video={item.video}
                    busy={busyAction === `reel:${item.source_id}`}
                    onPublishReel={
                      isFanpagePublished && canEdit ? () => handlePublishReel(item.source_id, item.topic_title) : undefined
                    }
                  />
                )}

                {!isPublished ? (
                  <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <label htmlFor={`reschedule-${keyPrefix}-${item.source_id}`} className="block font-semibold text-slate-700">
                      Đổi giờ hẹn tự động:
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id={`reschedule-${keyPrefix}-${item.source_id}`}
                        type="datetime-local"
                        disabled={!canEdit || !!busyAction}
                        value={customScheduleMap[item.source_id] ?? toDatetimeLocalValue(item.scheduled_iso)}
                        onChange={(e) =>
                          setCustomScheduleMap((prev) => ({
                            ...prev,
                            [item.source_id]: e.target.value,
                          }))
                        }
                        className="flex-1 min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800"
                      />
                      <button
                        type="button"
                        disabled={!canEdit || !!busyAction}
                        onClick={() => void handleReschedulePost(item.source_id, item.scheduled_iso)}
                        className="shrink-0 rounded-lg bg-blue-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                      >
                        {busyAction === `reschedule_${item.source_id}` ? "Lưu..." : "Lưu"}
                      </button>
                    </div>
                  </div>
                ) : (
                  isGroupPublished &&
                  canEdit && (
                    <button
                      type="button"
                      disabled={!!busyAction}
                      onClick={() => void handleRetractGroupPost(item)}
                      className="w-full rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      {busyAction === `retract_${item.source_id}` ? "Đang thu hồi..." : "Thu hồi bài trên Group"}
                    </button>
                  )
                )}
              </div>
            </details>
          </div>
        </div>
      </article>
    );
  };

  function renderPublishedArchivePanel(currentHub: HubResponse) {
    const totalArchivePages = Math.max(1, Math.ceil(filteredArchiveItems.length / dailyPageSize));
    const currentArchivePage = Math.min(Math.max(1, archivePage), totalArchivePages);
    const archiveStart = (currentArchivePage - 1) * dailyPageSize;
    const pagedArchiveItems = filteredArchiveItems.slice(archiveStart, archiveStart + dailyPageSize);

    return (
      <section
        id="published-posts-by-date"
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Kho bài viết đã xuất bản ({filteredArchiveItems.length} bài)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Hiển thị dạng lưới 3 cột có phân trang cho toàn bộ bài đã đăng trên Group Cộng đồng ({publishedGroupCount} bài), Website và Fanpage ({publishedFanpageCount} bài).
            </p>
          </div>
          {hasArchiveFilter && (
            <button
              type="button"
              onClick={() => {
                setArchiveDay("all");
                setArchiveMonth("all");
                setArchiveYear("all");
                setArchiveExactDate("");
                setArchiveSearch("");
                setArchivePage(1);
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Xóa bộ lọc ngày
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-700">Kênh đã đăng:</span>
            {[
              {
                id: "primary" as const,
                label: `Kênh chính: ${targetMode === "fanpage" ? "Fanpage" : "Group"} (${primaryPublishedItems.length})`,
              },
              { id: "group" as const, label: `Group Facebook (${publishedGroupCount})` },
              {
                id: "website" as const,
                label: `Website (${currentHub.calendar.daily.filter((i) => Boolean(i.published_slug)).length})`,
              },
              { id: "fanpage" as const, label: `Fanpage (${publishedFanpageCount})` },
              { id: "all_published" as const, label: `Tất cả kênh (${anyChannelPublishedItems.length})` },
            ].map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  setArchiveChannelFilter(ch.id);
                  setArchivePage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  archiveChannelFilter === ch.id
                    ? "bg-blue-700 text-white"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Chọn ngày đăng"
              value={archiveExactDate}
              onChange={(e) => {
                const val = e.target.value;
                setArchiveExactDate(val);
                if (val) {
                  const [y, m, d] = val.split("-");
                  if (y && m && d) {
                    setArchiveYear(y);
                    setArchiveMonth(m);
                    setArchiveDay(d);
                  }
                } else {
                  setArchiveDay("all");
                }
                setArchivePage(1);
              }}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800"
            />
            <input
              type="search"
              value={archiveSearch}
              onChange={(e) => {
                setArchiveSearch(e.target.value);
                setArchivePage(1);
              }}
              placeholder="Tìm tiêu đề bài đã đăng..."
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 w-48"
            />
          </div>
        </div>

        {filteredArchiveItems.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
            Không có bài đã đăng nào khớp với bộ lọc hiện tại.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              {renderPaginationBar(
                currentArchivePage,
                totalArchivePages,
                filteredArchiveItems.length,
                dailyPageSize,
                setArchivePage,
                "header"
              )}
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pagedArchiveItems.map((item) => renderCompactPostRow(item, "archive"))}
            </div>
            {totalArchivePages > 1 && (
              <div className="px-4 py-3 bg-white border-t border-slate-200">
                {renderPaginationBar(
                  currentArchivePage,
                  totalArchivePages,
                  filteredArchiveItems.length,
                  dailyPageSize,
                  setArchivePage,
                  "footer"
                )}
              </div>
            )}
          </div>
        )}
      </section>
    );
  }

  function renderPostEngagementStatsSection(currentHub: HubResponse) {
    const allPostMetrics = currentHub.post_metrics ?? [];
    const filteredPostMetrics = allPostMetrics.filter((m) =>
      postMetricsChannelFilter === "all" ? true : m.channel === postMetricsChannelFilter
    );
    const engSnapshots = currentHub.engagement_snapshots ?? [];
    const metricsPageSize = 6;
    const totalMetricsPages = Math.max(1, Math.ceil(filteredPostMetrics.length / metricsPageSize));
    const currentMetricsPage = Math.min(Math.max(1, metricsPage), totalMetricsPages);
    const pagedPostMetrics = filteredPostMetrics.slice(
      (currentMetricsPage - 1) * metricsPageSize,
      currentMetricsPage * metricsPageSize
    );

    return (
      <div id="post-engagement-stats-panel" className="min-w-0 space-y-5">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Thống kê tương tác từng bài đã đăng (Group &amp; Fanpage)
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Tổng hợp: {currentHub.stats.total_post_likes ?? 0} lượt thích · {currentHub.stats.total_post_comments ?? 0} bình luận · {currentHub.stats.total_post_shares ?? 0} chia sẻ
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { id: "all" as const, label: `Tất cả (${allPostMetrics.length})` },
                {
                  id: "group" as const,
                  label: `Group Cộng đồng (${allPostMetrics.filter((m) => m.channel === "group").length})`,
                },
                {
                  id: "fanpage" as const,
                  label: `Fanpage (${allPostMetrics.filter((m) => m.channel === "fanpage").length})`,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setPostMetricsChannelFilter(tab.id);
                    setMetricsPage(1);
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    postMetricsChannelFilter === tab.id
                      ? "bg-blue-700 text-white"
                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              <button
                type="button"
                disabled={!canEdit || !!busyAction}
                onClick={() => void handleSyncPostStats()}
                className="rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {busyAction === "sync_post_stats" ? "Đang đồng bộ..." : "Đồng bộ tương tác"}
              </button>
            </div>
          </div>

          {filteredPostMetrics.length === 0 ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
              Chưa có số liệu tương tác nào trong kênh đã chọn.
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-slate-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                {renderPaginationBar(
                  currentMetricsPage,
                  totalMetricsPages,
                  filteredPostMetrics.length,
                  metricsPageSize,
                  setMetricsPage,
                  "header"
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-slate-50 uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th scope="col" className="px-4 py-2.5">Bài viết &amp; Kênh</th>
                      <th scope="col" className="px-3 py-2.5">Lượt thích</th>
                      <th scope="col" className="px-3 py-2.5">Bình luận</th>
                      <th scope="col" className="px-3 py-2.5">Chia sẻ</th>
                      <th scope="col" className="px-3 py-2.5">Tổng</th>
                      <th scope="col" className="px-4 py-2.5">Liên kết</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedPostMetrics.map((pm) => (
                      <tr key={pm.id} className="hover:bg-slate-50/60">
                        <th scope="row" className="max-w-xs px-4 py-3 font-normal">
                          <p className="line-clamp-1 font-semibold text-slate-900">{pm.post_title}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {pm.channel === "group" ? "Facebook Group" : "Fanpage"} ·{" "}
                            {pm.published_at ? new Date(pm.published_at).toLocaleDateString("vi-VN") : "Đã xuất bản"}
                          </p>
                        </th>
                        <td className="px-3 py-3 font-semibold text-slate-800">{pm.likes_count}</td>
                        <td className="px-3 py-3 font-semibold text-slate-800">{pm.comments_count}</td>
                        <td className="px-3 py-3 font-semibold text-slate-800">{pm.shares_count}</td>
                        <td className="px-3 py-3 font-bold text-blue-700">{pm.total_engagement}</td>
                        <td className="px-4 py-3">
                          {pm.post_url ? (
                            <a
                              href={pm.post_url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-blue-700 hover:underline"
                            >
                              Mở bài viết
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {engSnapshots.length > 0 && (
          <details className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <summary className="cursor-pointer px-5 py-3.5 bg-slate-50 text-xs font-bold text-slate-800">
              Lịch sử tăng trưởng thành viên &amp; tương tác qua các lần đồng bộ ({engSnapshots.length} mốc)
            </summary>
            <div className="p-4 overflow-x-auto border-t border-slate-200">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="bg-slate-50 uppercase text-slate-500">
                  <tr>
                    <th scope="col" className="px-3 py-2">Thời điểm</th>
                    <th scope="col" className="px-3 py-2">Thành viên Group</th>
                    <th scope="col" className="px-3 py-2">Lượt thích</th>
                    <th scope="col" className="px-3 py-2">Bình luận</th>
                    <th scope="col" className="px-3 py-2">Chia sẻ</th>
                    <th scope="col" className="px-3 py-2">Số bài theo dõi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...engSnapshots].reverse().slice(0, 10).map((snap) => (
                    <tr key={snap.id}>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {new Date(snap.captured_at).toLocaleString("vi-VN", { hour12: false })}
                      </td>
                      <td className="px-3 py-2 font-semibold text-emerald-800">{snap.group_members} người</td>
                      <td className="px-3 py-2">{snap.total_likes}</td>
                      <td className="px-3 py-2">{snap.total_comments}</td>
                      <td className="px-3 py-2">{snap.total_shares}</td>
                      <td className="px-3 py-2">{snap.total_posts_tracked} bài</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>
    );
  }

  // Group filteredDailyItems into Published vs Pending/Scheduled with dedicated pagination
  const publishedInFilter = filteredDailyItems
    .filter((i) => i.status === "published")
    .sort((a, b) => extractPublishedDateParts(b).timestampMs - extractPublishedDateParts(a).timestampMs);
  const pendingInFilter = filteredDailyItems.filter((i) => i.status !== "published");

  const totalPubCalPages = Math.max(1, Math.ceil(publishedInFilter.length / dailyPageSize));
  const currentPubCalPage = Math.min(Math.max(1, pubCalPage), totalPubCalPages);
  const pagedPublishedInCalendar = publishedInFilter.slice(
    (currentPubCalPage - 1) * dailyPageSize,
    currentPubCalPage * dailyPageSize
  );

  const totalPendingCalPages = Math.max(1, Math.ceil(pendingInFilter.length / dailyPageSize));
  const currentPendingCalPage = Math.min(Math.max(1, pendingCalPage), totalPendingCalPages);
  const pagedPendingInCalendar = pendingInFilter.slice(
    (currentPendingCalPage - 1) * dailyPageSize,
    currentPendingCalPage * dailyPageSize
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* HEADER CHUẨN TEMPLATE AGENT MAPS (KHÔNG ICON) */}
      <div className="p-5 border-b border-slate-200">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h2 className="font-bold text-slate-900 text-base">
              Agent 8: Community Growth &amp; Retention — {hub.group.name}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Thành viên Group: {currentMembersCount} người (Mục tiêu Tuần {currentCampaignWeek}: {currentWeekTargetCount} · {currentWeekProgressPct}%) · Đã đăng Group: {publishedGroupCount} bài · Hàng đợi hẹn giờ: {scheduledGroupCount} bài · Tương tác: {hub.stats.total_post_likes ?? 0} thích, {hub.stats.total_post_comments ?? 0} bình luận, {hub.stats.total_post_shares ?? 0} chia sẻ
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {hub.group.positioning}
            </p>
          </div>
          <span className="self-start rounded-md bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            Tự động 24/7 đã bật
          </span>
        </div>

        {/* KHUNG ĐIỀU KHIỂN TỰ ĐỘNG (HỘP XANH NHẠT CHUẨN TEMPLATE AGENT MAPS) */}
        <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-900 text-sm">
              Quy trình tự động vận hành Facebook Group Bot, Phản hồi RAG &amp; Mời thành viên
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-md px-2.5 py-0.5 text-xs font-semibold ${
                  groupBotSession?.isLoggedIn
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {isEdgeLoginOpen
                  ? "Đang mở Edge chờ lưu phiên..."
                  : groupBotSession?.isLoggedIn
                    ? `Đã kết nối phiên Group Bot${hub.group.fb_admin_name ? ` (${hub.group.fb_admin_name})` : ""}`
                    : "Chưa đăng nhập phiên Group Bot"}
              </span>
              <span className="rounded-md bg-white border border-blue-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                Đích đăng: {targetMode === "fanpage" ? "Fanpage" : targetMode === "both" ? "Group & Fanpage" : "Facebook Group"}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-600">
            Bước 1: Đăng nhập Quản trị viên Group trên Edge 1 lần → Bước 2: Worker tự động đăng bài theo lịch 09:00 sáng, tự động trả lời bình luận/tin nhắn bằng RAG ({hub.stats.comments_replied_count ?? 0} phản hồi) và tự động gửi lời mời an toàn ({invitesSentToday}/{effectiveInviteLimit} lượt hôm nay).
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!canEdit || !!busyAction}
                onClick={() => void handleLaunchGroupBotLogin()}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {busyAction === "login_group_bot"
                  ? "Đang mở Microsoft Edge..."
                  : "Bước 1: Mở Edge đăng nhập Group Bot (1 lần)"}
              </button>

              <button
                type="button"
                disabled={!canEdit || !!busyAction}
                onClick={() => void handlePublishFreshPost()}
                className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {busyAction === "publish_fresh"
                  ? "Đang đăng bài mới..."
                  : "Bước 2: Đăng ngay 1 bài mới lên Group"}
              </button>

              <button
                type="button"
                disabled={!canEdit || !!busyAction}
                onClick={() => void handleSyncPostStats()}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busyAction === "sync_post_stats" ? "Đang đồng bộ..." : "Đồng bộ bài & tương tác"}
              </button>

              <button
                type="button"
                disabled={!canEdit || !!busyAction}
                onClick={() => void handleSwitchGroupBotAccount()}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Đổi tài khoản Bot
              </button>

              <button
                type="button"
                onClick={() => setEditingSettings((v) => !v)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {editingSettings ? "Đóng cấu hình" : "Cấu hình Group & Mục tiêu"}
              </button>

              <a
                href={hub.group.group_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Mở Group Facebook
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-800">
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canEdit || !!busyAction}
                  checked={autoReplyComments}
                  onChange={(e) => void handleToggleCommunityAutomation("auto_reply_comments", e.target.checked)}
                />
                <span>Tự động trả lời bình luận (RAG)</span>
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={!canEdit || !!busyAction}
                  checked={autoInviteEnabled}
                  onChange={(e) => void handleToggleCommunityAutomation("auto_invite_enabled", e.target.checked)}
                />
                <span>Tự động mời Group ({invitesSentToday}/{effectiveInviteLimit})</span>
              </label>
            </div>
          </div>

          {isEdgeLoginOpen && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  Cửa sổ Microsoft Edge đang mở để đăng nhập hoặc chuyển sang Trang Quản trị viên Group. Sau khi hoàn tất trên Edge, bấm nút bên phải để lưu phiên:
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canEdit || !!busyAction}
                    onClick={() => void handleCompleteGroupBotLogin()}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                  >
                    Lưu phiên &amp; Đóng Edge
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopLoginPolling();
                      setLoginWaitingOnEdge(false);
                    }}
                    className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-900"
                  >
                    Đóng
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <code className="flex-1 min-w-[240px] px-2.5 py-1 rounded bg-white border border-amber-200 font-mono text-[11px] text-slate-800">
                  {cliFallbackCommand}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopyCliFallback()}
                  className="px-3 py-1 rounded border border-amber-300 bg-white text-xs font-semibold text-amber-900"
                >
                  {copiedCliFallback ? "Đã copy lệnh" : "Copy lệnh PowerShell"}
                </button>
              </div>
            </div>
          )}

          {bannerMessage && (
            <div
              ref={bannerRef}
              role={bannerTone === "error" ? "alert" : "status"}
              className="rounded-lg border border-blue-200 bg-white p-3 text-xs font-medium text-slate-800 flex items-start justify-between gap-3"
            >
              <p>{bannerMessage}</p>
              <button
                type="button"
                onClick={() => {
                  stopLoginPolling();
                  setBannerMessage("");
                  setBannerRecovery(null);
                }}
                className="shrink-0 text-slate-500 hover:text-slate-900 font-semibold"
              >
                Đóng
              </button>
            </div>
          )}
        </div>

        {/* Form cấu hình Group & Mục tiêu (chỉ mở khi bấm nút Cấu hình) */}
        {editingSettings && (
          <form
            id="community-settings-panel"
            onSubmit={handleSaveSettings}
            className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs"
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="community-name" className="block font-semibold text-slate-700">
                  Tên Cộng đồng
                </label>
                <input
                  id="community-name"
                  type="text"
                  required
                  value={customCommunityName}
                  onChange={(e) => setCustomCommunityName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                />
              </div>
              <div>
                <label htmlFor="community-group-url" className="block font-semibold text-slate-700">
                  Link Facebook Group
                </label>
                <input
                  id="community-group-url"
                  type="url"
                  required
                  value={customGroupUrl}
                  onChange={(e) => setCustomGroupUrl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5"
                />
              </div>
              <div>
                <label htmlFor="daily-invite-limit" className="block font-semibold text-slate-700">
                  Đích đăng mặc định &amp; Quota mời/ngày
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <select
                    value={customPublishTarget}
                    onChange={(e) => setCustomPublishTarget(e.target.value as PublishTarget)}
                    className="flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                  >
                    <option value="group">Chỉ Group Cộng đồng</option>
                    <option value="both">Cả Group &amp; Fanpage</option>
                    <option value="fanpage">Chỉ Fanpage</option>
                  </select>
                  <input
                    id="daily-invite-limit"
                    type="number"
                    min={10}
                    max={15}
                    value={dailyInviteLimit}
                    onChange={(e) => setDailyInviteLimit(Number(e.target.value))}
                    className="w-20 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div>
                <label className="block font-semibold text-slate-700">Thành viên hiện có</label>
                <input
                  type="number"
                  min={0}
                  value={customGroupMemberCount}
                  onChange={(e) => setCustomGroupMemberCount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-semibold"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Mục tiêu Tuần 1</label>
                <input
                  type="number"
                  min={1}
                  value={customWeek1Target}
                  onChange={(e) => {
                    setCustomWeek1Target(Number(e.target.value));
                    setManualTargetsTouched(true);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Mục tiêu Tuần 2</label>
                <input
                  type="number"
                  min={1}
                  value={customWeek2Target}
                  onChange={(e) => {
                    setCustomWeek2Target(Number(e.target.value));
                    setManualTargetsTouched(true);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Mục tiêu Tuần 3</label>
                <input
                  type="number"
                  min={1}
                  value={customWeek3Target}
                  onChange={(e) => {
                    setCustomWeek3Target(Number(e.target.value));
                    setManualTargetsTouched(true);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700">Mục tiêu Tuần 4</label>
                <input
                  type="number"
                  min={1}
                  value={customWeek4Target}
                  onChange={(e) => {
                    setCustomWeek4Target(Number(e.target.value));
                    setManualTargetsTouched(true);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
              <label className="inline-flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={lockManualTargets}
                  onChange={(e) => {
                    setLockManualTargets(e.target.checked);
                    setManualTargetsTouched(true);
                  }}
                />
                <span>Khóa mục tiêu thủ công (không để Growth Lead tự động ghi đè)</span>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleSyncGrowthLeadTargets()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Growth Lead tự tính mục tiêu
                </button>
                <button
                  type="submit"
                  disabled={!canEdit || busyAction === "save_settings"}
                  className="rounded-lg bg-blue-700 px-3.5 py-1.5 font-semibold text-white hover:bg-blue-800"
                >
                  {busyAction === "save_settings" ? "Đang lưu..." : "Lưu cấu hình"}
                </button>
              </div>
            </div>
          </form>
        )}

        <div className="mt-3">
          <KnowledgeGapsPanel
            workspaceId={workspaceId}
            gaps={hub.knowledge_gaps}
            canEdit={canEdit}
            onChanged={() => void syncFromServer({ showErrorOnFailure: true })}
          />
        </div>
      </div>

      {/* THANH TABS ĐIỀU HƯỚNG CHUẨN TEMPLATE AGENT MAPS (KHÔNG ICON) */}
      <div
        role="tablist"
        aria-label="Các phân hệ điều hành Cộng đồng"
        className="px-5 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex flex-wrap gap-2 sm:gap-5">
          {hubTabs.map((tab, idx) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabButtonRefs.current[tab.id] = el;
                }}
                type="button"
                role="tab"
                id={`community-tab-${tab.id}`}
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => selectHubTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className={`py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                  isSelected
                    ? "border-blue-700 text-blue-700"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* NỘI DUNG TỪNG TAB */}
      <div
        role="tabpanel"
        aria-labelledby={`community-tab-${activeTab}`}
        className="p-6 space-y-6"
      >
        {/* ========================================================= */}
        {/* TAB 1: BÀI VIẾT & LỊCH XUẤT BẢN (LƯỚI 3 CỘT + PHÂN TRANG)  */}
        {/* ========================================================= */}
        {activeTab === "calendar" && (
          <div className="space-y-5">
            {/* Thanh công cụ lọc gọn trên 1 khung duy nhất */}
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-sm text-slate-900">
                    Danh sách bài viết Cộng đồng phân theo trạng thái Đã đăng &amp; Lịch hẹn tự động ({hub.calendar.daily.length} bài)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Hiển thị dạng lưới 3 cột gọn gàng kèm phân trang (6 / 9 / 12 bài mỗi trang), phân tách rõ Bài đã đăng và Bài chưa đăng.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Số bài mỗi trang"
                    value={dailyPageSize}
                    onChange={(e) => {
                      setDailyPageSize(Number(e.target.value));
                      setDailyPage(1);
                      setPubCalPage(1);
                      setPendingCalPage(1);
                      setArchivePage(1);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                  >
                    <option value={3}>3 bài / trang</option>
                    <option value={6}>6 bài / trang</option>
                    <option value={9}>9 bài / trang</option>
                    <option value={12}>12 bài / trang</option>
                  </select>
                  <button
                    type="button"
                    disabled={!canEdit || !!busyAction}
                    onClick={() => void handleScheduleAllPosts()}
                    className="px-3.5 py-2 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-50"
                  >
                    {busyAction === "schedule_all"
                      ? "Đang đồng bộ lịch..."
                      : "Đồng bộ lịch tự động (09:00 sáng)"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
                {/* Lọc trạng thái & tuần */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: "all" as const, label: `Tất cả (${hub.calendar.daily.length})` },
                    { id: "published" as const, label: `Đã đăng (${publishedCount})` },
                    { id: "scheduled" as const, label: `Chưa đăng / Hẹn giờ (${scheduledFilterCount})` },
                    ...(failedGroupCount > 0 && targetMode !== "fanpage"
                      ? [{ id: "failed" as const, label: `Lỗi (${failedGroupCount})` }]
                      : []),
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => {
                        setDailyFilter(st.id);
                        setDailyPage(1);
                        setPubCalPage(1);
                        setPendingCalPage(1);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        dailyFilter === st.id
                          ? "bg-blue-700 text-white"
                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}

                  <select
                    aria-label="Lọc theo tuần"
                    value={dailyFilter.startsWith("week") ? dailyFilter : "all_weeks"}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDailyFilter(val === "all_weeks" ? "all" : (val as WeekFilterId));
                      setDailyPage(1);
                      setPubCalPage(1);
                      setPendingCalPage(1);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                  >
                    <option value="all_weeks">Tất cả 4 tuần</option>
                    {weekSummaryStats.map((w) => (
                      <option key={w.id} value={w.id}>
                        Tuần {w.weekNum} ({w.dateRange}) — {w.pub} đã đăng / {w.sched} hẹn
                      </option>
                    ))}
                  </select>
                </div>

                {/* Lọc ngày cụ thể & Tìm kiếm */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    aria-label="Lọc theo ngày cụ thể"
                    value={selectedExactDate}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSelectedExactDate(val);
                      if (val) {
                        const [y, m, d] = val.split("-");
                        if (y && m && d) {
                          setSelectedYear(y);
                          setSelectedMonth(m);
                          setSelectedDay(d);
                        }
                      } else {
                        setSelectedDay("all");
                        setSelectedMonth("all");
                        setSelectedYear("all");
                      }
                      setDailyPage(1);
                      setPubCalPage(1);
                      setPendingCalPage(1);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800"
                  />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setDailyPage(1);
                      setPubCalPage(1);
                      setPendingCalPage(1);
                    }}
                    placeholder="Tìm theo tiêu đề, chủ đề..."
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 w-52"
                  />
                  {hasActiveCustomFilter && (
                    <button
                      type="button"
                      onClick={resetAllDateFilters}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Xóa lọc
                    </button>
                  )}
                </div>
              </div>
            </div>

            {filteredDailyItems.length === 0 ? (
              <div className="p-8 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-500 space-y-2">
                <p>Không có bài viết nào khớp với bộ lọc hiện tại.</p>
                <button
                  type="button"
                  onClick={resetAllDateFilters}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-700 text-white font-semibold"
                >
                  Xem toàn bộ {hub.calendar.daily.length} bài viết
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {/* PHẦN 1: CÁC BÀI ĐÃ ĐĂNG LÊN CỘNG ĐỒNG (LƯỚI 3 CỘT + PHÂN TRANG) */}
                {publishedInFilter.length > 0 && (
                  <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-bold">
                          Phần 1: Bài đã đăng lên Cộng đồng ({publishedInFilter.length} bài)
                        </span>
                        <span className="text-xs text-slate-600">
                          Đã hoàn tất xuất bản · Ẩn nút đăng lại
                        </span>
                      </div>
                      {renderPaginationBar(
                        currentPubCalPage,
                        totalPubCalPages,
                        publishedInFilter.length,
                        dailyPageSize,
                        setPubCalPage,
                        "header"
                      )}
                    </div>
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {pagedPublishedInCalendar.map((item) => renderCompactPostRow(item, "cal_pub"))}
                    </div>
                    {totalPubCalPages > 1 && (
                      <div className="px-5 py-3 bg-white border-t border-slate-200">
                        {renderPaginationBar(
                          currentPubCalPage,
                          totalPubCalPages,
                          publishedInFilter.length,
                          dailyPageSize,
                          setPubCalPage,
                          "footer"
                        )}
                      </div>
                    )}
                  </section>
                )}

                {/* PHẦN 2: CÁC BÀI CHƯA ĐĂNG — HÀNG ĐỢI TỰ ĐỘNG ĐĂNG (LƯỚI 3 CỘT + PHÂN TRANG) */}
                {pendingInFilter.length > 0 && (
                  <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 text-xs font-bold">
                          Phần 2: Bài chưa đăng — Hàng đợi tự động đăng ({pendingInFilter.length} bài)
                        </span>
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setDailyFilter("all");
                              setPendingCalPage(1);
                            }}
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              !dailyFilter.startsWith("week")
                                ? "bg-blue-700 text-white"
                                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                            }`}
                          >
                            Tất cả tuần
                          </button>
                          {weekSummaryStats.map((w) => (
                            <button
                              key={w.id}
                              type="button"
                              onClick={() => {
                                setDailyFilter(w.id);
                                setPendingCalPage(1);
                              }}
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                dailyFilter === w.id
                                  ? "bg-blue-700 text-white"
                                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              Tuần {w.weekNum} ({w.sched})
                            </button>
                          ))}
                        </div>
                      </div>
                      {renderPaginationBar(
                        currentPendingCalPage,
                        totalPendingCalPages,
                        pendingInFilter.length,
                        dailyPageSize,
                        setPendingCalPage,
                        "header"
                      )}
                    </div>
                    <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {pagedPendingInCalendar.map((item) => renderCompactPostRow(item, "cal_pending"))}
                    </div>
                    {totalPendingCalPages > 1 && (
                      <div className="px-5 py-3 bg-white border-t border-slate-200">
                        {renderPaginationBar(
                          currentPendingCalPage,
                          totalPendingCalPages,
                          pendingInFilter.length,
                          dailyPageSize,
                          setPendingCalPage,
                          "footer"
                        )}
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: KHO BÀI ĐÃ ĐĂNG & THỐNG KÊ TƯƠNG TÁC               */}
        {/* ========================================================= */}
        {activeTab === "published_archive" && (
          <div className="space-y-6">
            {renderPublishedArchivePanel(hub)}
            {renderPostEngagementStatsSection(hub)}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: HỘI THOẠI RAG, MỜI GROUP AN TOÀN & LỘ TRÌNH 4 TUẦN */}
        {/* ========================================================= */}
        {activeTab === "campaigns" && (
          <div className="space-y-6">
            {/* Lộ trình 4 tuần gọn gàng */}
            <div id="campaigns-roadmap-panel" className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Lộ trình Tăng trưởng Cộng đồng 4 Tuần ({hub.stats.week1_target} → {hub.stats.week2_target} → {w3Target} → {w4Target} thành viên)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {hub.group.target_rationale || "Mục tiêu tăng trưởng được Growth Lead tính toán từ số lượng thành viên và tương tác thực tế."}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canEdit || !!busyAction}
                  onClick={() => void handleSyncGrowthLeadTargets()}
                  className="rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {busyAction === "sync_growth_lead_targets" ? "Đang tính..." : "Growth Lead cập nhật mục tiêu"}
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {hub.weekly_campaigns.map((c) => {
                  const pct = Math.min(100, Math.round((c.current_members / Math.max(1, c.target_members)) * 100));
                  return (
                    <div key={c.week} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="rounded bg-blue-100 px-2 py-0.5 font-bold text-blue-800">
                          Tuần {c.week}
                        </span>
                        <span className="font-semibold text-slate-700">
                          {c.current_members}/{c.target_members} thành viên ({pct}%)
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-slate-900">{c.title}</h4>
                      <p className="text-[11px] text-slate-600 line-clamp-2">{c.theme}</p>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full bg-blue-700" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hộp thư Hội thoại Đa kênh & Tự động trả lời RAG */}
            <div id="comment-invite-automation-panel" className="space-y-6">
              {(() => {
                const allComments = hub.recent_comments ?? [];
                const groupCommentsCount = allComments.filter((c) => c.source_channel === "group_comment").length;
                const pageCommentsCount = allComments.filter((c) => c.source_channel === "page_comment").length;
                const telegramCount = allComments.filter((c) => c.source_channel === "telegram").length;
                const messengerCount = allComments.filter((c) => c.source_channel === "messenger").length;
                const filteredComments = allComments.filter((c) =>
                  commentChannelFilter === "all" ? true : c.source_channel === commentChannelFilter
                );
                const commentsPageSize = 6;
                const totalCommentsPages = Math.max(1, Math.ceil(filteredComments.length / commentsPageSize));
                const currentCommentsPage = Math.min(Math.max(1, commentsPage), totalCommentsPages);
                const pagedComments = filteredComments.slice(
                  (currentCommentsPage - 1) * commentsPageSize,
                  currentCommentsPage * commentsPageSize
                );
                return (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Hộp thư Hội thoại Đa kênh &amp; Tự động Trả lời RAG ({allComments.length})
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Bình luận đã trả lời: {hub.stats.comments_replied_count ?? 0}/{hub.stats.comments_received_count ?? 0} · Tin nhắn Telegram/Messenger: {hub.stats.messages_replied_count ?? 0}/{hub.stats.messages_received_count ?? 0}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={!canEdit || !!busyAction}
                          onClick={() => void handleScanComments()}
                          className="rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                        >
                          {busyAction === "scan_comments" ? "Đang quét..." : "Quét & Trả lời Comment tự động"}
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit || !!busyAction}
                          onClick={() => void handleDispatchCommentReplies()}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Gửi câu trả lời tồn đọng
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: "all" as const, label: `Tất cả (${allComments.length})` },
                        { id: "group_comment" as const, label: `Bình luận Group (${groupCommentsCount})` },
                        { id: "page_comment" as const, label: `Bình luận Fanpage (${pageCommentsCount})` },
                        { id: "telegram" as const, label: `Telegram Bot (${telegramCount})` },
                        { id: "messenger" as const, label: `Messenger (${messengerCount})` },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            setCommentChannelFilter(tab.id);
                            setCommentsPage(1);
                          }}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                            commentChannelFilter === tab.id
                              ? "bg-blue-700 text-white"
                              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {filteredComments.length === 0 ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                        Chưa có hội thoại hoặc bình luận mới trong kênh đang chọn.
                      </div>
                    ) : (
                      <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                          {renderPaginationBar(
                            currentCommentsPage,
                            totalCommentsPages,
                            filteredComments.length,
                            commentsPageSize,
                            setCommentsPage,
                            "header"
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[740px] text-left text-xs">
                            <thead className="bg-slate-50 uppercase text-slate-500 border-b border-slate-200">
                              <tr>
                                <th scope="col" className="px-3 py-2.5">Người gửi &amp; Kênh</th>
                                <th scope="col" className="px-3 py-2.5">Nội dung câu hỏi / bình luận</th>
                                <th scope="col" className="px-3 py-2.5">Phản hồi RAG tự động</th>
                                <th scope="col" className="px-3 py-2.5">Trạng thái</th>
                                <th scope="col" className="px-3 py-2.5">Nguồn</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {pagedComments.map((cmt) => {
                                const channelBadge =
                                  cmt.source_channel === "group_comment"
                                    ? "Facebook Group"
                                    : cmt.source_channel === "page_comment"
                                      ? "Facebook Fanpage"
                                      : cmt.source_channel === "telegram"
                                        ? "Telegram"
                                        : "Messenger";
                                const isReplied = cmt.status === "replied";
                                return (
                                  <tr key={cmt.id} className="align-top hover:bg-slate-50/60">
                                    <th scope="row" className="px-3 py-3 font-normal">
                                      <p className="font-semibold text-slate-900">{cmt.author_name}</p>
                                      <p className="text-[11px] text-slate-500">{channelBadge}</p>
                                      <p className="text-[10px] text-slate-400">
                                        {new Date(cmt.received_at).toLocaleString("vi-VN", { hour12: false })}
                                      </p>
                                    </th>
                                    <td className="max-w-xs px-3 py-3 text-slate-800">{cmt.content}</td>
                                    <td className="max-w-sm px-3 py-3 text-slate-700">
                                      {cmt.rag_reply_text ? (
                                        <p className="rounded bg-slate-50 border border-slate-200 p-2 text-slate-800">
                                          {cmt.rag_reply_text}
                                        </p>
                                      ) : (
                                        <span className="text-slate-400">Đang xử lý RAG...</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-3">
                                      <span
                                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                                          isReplied
                                            ? "bg-emerald-100 text-emerald-800"
                                            : "bg-amber-100 text-amber-800"
                                        }`}
                                      >
                                        {isReplied ? "Đã trả lời" : "Đang xử lý"}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3">
                                      {cmt.post_url ? (
                                        <a
                                          href={cmt.post_url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="font-semibold text-blue-700 hover:underline"
                                        >
                                          Xem bài
                                        </a>
                                      ) : (
                                        <span className="text-slate-400">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Nhật ký mời tham gia Group an toàn */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Nhật ký gửi lời mời tham gia Group an toàn ({invitesSentToday}/{effectiveInviteLimit} lượt hôm nay)
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Giới hạn an toàn {effectiveInviteLimit} lời mời/ngày qua nút Mời Facebook Group, Messenger hoặc Telegram Bot.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!canEdit || !!busyAction || !autoInviteEnabled}
                      onClick={() => void handleSendSafeInvites()}
                      className="rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      {busyAction === "send_safe_invites" ? "Đang gửi..." : "Gửi đợt mời an toàn ngay"}
                    </button>
                    <button
                      type="button"
                      disabled={!canEdit || busyAction === "scan"}
                      onClick={() => void handleScanMembers(false)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Quét khách tương tác Fanpage ({hub.stats.real_identified_people})
                    </button>
                  </div>
                </div>

                {(hub.recent_invite_logs ?? []).length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[680px] text-left text-xs">
                      <thead className="bg-slate-50 uppercase text-slate-500 border-b border-slate-200">
                        <tr>
                          <th scope="col" className="px-3 py-2.5">Người nhận</th>
                          <th scope="col" className="px-3 py-2.5">Kênh mời</th>
                          <th scope="col" className="px-3 py-2.5">Trạng thái</th>
                          <th scope="col" className="px-3 py-2.5">Chi tiết</th>
                          <th scope="col" className="px-3 py-2.5">Thời gian</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(hub.recent_invite_logs ?? []).slice(0, 10).map((log) => (
                          <tr key={log.id}>
                            <td className="px-3 py-2.5 font-semibold text-slate-900">{log.display_name}</td>
                            <td className="px-3 py-2.5 text-slate-600">{log.channel}</td>
                            <td className="px-3 py-2.5">
                              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                                {log.status === "invited" ? "Đã gửi lời mời" : log.status}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-slate-600 max-w-xs truncate">{log.detail || "Đã ghi nhận"}</td>
                            <td className="px-3 py-2.5 text-slate-500">
                              {new Date(log.invited_at).toLocaleString("vi-VN", { hour12: false })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: THẢO LUẬN CỘNG ĐỒNG (LƯỚI 2 CỘT + PHÂN TRANG)       */}
        {/* ========================================================= */}
        {activeTab === "discussions" && (() => {
          const discPageSize = 4;
          const totalDiscPages = Math.max(1, Math.ceil(hub.discussions.length / discPageSize));
          const currentDiscPage = Math.min(Math.max(1, discussionsPage), totalDiscPages);
          const pagedDiscussions = hub.discussions.slice(
            (currentDiscPage - 1) * discPageSize,
            currentDiscPage * discPageSize
          );

          return (
            <div className="grid gap-6 lg:grid-cols-12">
              <div className="lg:col-span-8 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <h3 className="text-sm font-bold text-slate-900">
                    Chủ đề thảo luận tương tác trong Cộng đồng ({hub.discussions.length})
                  </h3>
                  {renderPaginationBar(
                    currentDiscPage,
                    totalDiscPages,
                    hub.discussions.length,
                    discPageSize,
                    setDiscussionsPage,
                    "header"
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pagedDiscussions.map((d) => (
                    <article key={d.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
                      {d.image_url && (
                        <div className="relative h-36 bg-slate-100 border-b border-slate-100">
                          <img src={d.image_url} alt={d.title} className="w-full h-full object-cover" />
                          <span className="absolute top-2 left-2 rounded-md bg-white/95 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                            {d.category}
                          </span>
                        </div>
                      )}
                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            {!d.image_url && (
                              <span className="rounded-md bg-blue-100 px-2 py-0.5 font-semibold text-blue-800">
                                {d.category}
                              </span>
                            )}
                            <span className="text-slate-500">
                              {d.participants_count} thành viên · {(d.replies ?? []).length} phản hồi
                            </span>
                          </div>
                          <h4 className="text-sm font-semibold text-slate-900 line-clamp-2">{d.title}</h4>
                          <p className="text-xs text-slate-600 line-clamp-2">{d.body}</p>
                          <p className="text-xs font-medium text-blue-800 bg-blue-50/60 border border-blue-200 rounded-md px-2.5 py-1.5 line-clamp-2">
                            Câu hỏi mở: {d.discussion_prompt}
                          </p>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-100">
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              disabled={!canEdit || !!busyAction}
                              onClick={() => handlePostGroupViaBot(d.title, d.body, d.discussion_prompt, d.image_url || undefined)}
                              className="rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 text-center"
                            >
                              {busyAction === d.title ? "Đang đăng..." : "Đăng vào Group"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyAndOpenGroup(d.title, d.body, d.discussion_prompt)}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 text-center"
                            >
                              Copy &amp; Mở Group
                            </button>
                          </div>
                          {d.replies.length > 0 && (
                            <details className="w-full pt-1 text-xs">
                              <summary className="cursor-pointer font-semibold text-slate-600">
                                Xem {d.replies.length} bình luận của thành viên
                              </summary>
                              <div className="mt-2 space-y-1.5">
                                {d.replies.map((r, idx) => (
                                  <div key={idx} className="rounded-lg bg-slate-50 p-2 border border-slate-200">
                                    <span className="font-semibold text-slate-900">{r.author}</span>{" "}
                                    <span className="text-slate-500">({r.role})</span>: {r.text}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

            <div className="lg:col-span-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-900">Tạo chủ đề thảo luận mới</h3>
                <form onSubmit={handleCreateDiscussion} className="space-y-3 text-xs">
                  <div>
                    <label htmlFor="discussion-title" className="block font-semibold text-slate-700">
                      Tiêu đề thảo luận
                    </label>
                    <input
                      id="discussion-title"
                      type="text"
                      required
                      value={discussionTitle}
                      onChange={(e) => setDiscussionTitle(e.target.value)}
                      placeholder="VD: Kinh nghiệm chọn khu vực lưu trú tại Đà Nẵng?"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2"
                    />
                  </div>
                  <div>
                    <label htmlFor="discussion-body" className="block font-semibold text-slate-700">
                      Nội dung mở đầu
                    </label>
                    <textarea
                      id="discussion-body"
                      rows={3}
                      required
                      value={discussionBody}
                      onChange={(e) => setDiscussionBody(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2"
                    />
                  </div>
                  <div>
                    <label htmlFor="discussion-prompt" className="block font-semibold text-slate-700">
                      Câu hỏi mở mời tương tác
                    </label>
                    <input
                      id="discussion-prompt"
                      type="text"
                      value={discussionPrompt}
                      onChange={(e) => setDiscussionPrompt(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!canEdit || busyAction === "discussion"}
                    className="w-full rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
                  >
                    {busyAction === "discussion" ? "Đang tạo..." : "Thêm chủ đề thảo luận"}
                  </button>
                </form>
              </div>
            </div>
          </div>
          );
        })()}

        {/* ========================================================= */}
        {/* TAB 5: KIẾN TRÚC 4 AGENT & CƠ CHẾ RAG                     */}
        {/* ========================================================= */}
        {activeTab === "architecture" && hub.architecture_info && (
          <div className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Phối hợp tự động giữa 4 Agent chuyên biệt trong quy trình Cộng đồng
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Lập kế hoạch, viết bài chuẩn SEO, biên tập bài Facebook và phản hồi RAG được vận hành khép kín.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {hub.architecture_info.agent_roles.map((role) => (
                  <div key={role.agent_id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-4 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-bold text-slate-900">{role.agent_name}</h4>
                      <div className="flex flex-wrap gap-1">
                        {role.operations.map((op) => (
                          <code key={op} className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                            {op}
                          </code>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{role.responsibility}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Cơ chế tự động trả lời bằng Knowledge Context RAG
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Chế độ: {hub.architecture_info.rag_reply_mechanism.mode}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-emerald-800">
                    {hub.architecture_info.rag_reply_mechanism.approved_sources_count} tài liệu RAG đã duyệt
                  </span>
                  <span className="rounded-md bg-blue-100 px-2.5 py-1 text-blue-800">
                    {hub.architecture_info.rag_reply_mechanism.total_chunks_count} Chunks
                  </span>
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-slate-700">
                    {hub.architecture_info.rag_reply_mechanism.grounded_replies_count} phản hồi đã tạo
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {hub.architecture_info.rag_reply_mechanism.steps.map((step, i) => (
                  <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    {step}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
