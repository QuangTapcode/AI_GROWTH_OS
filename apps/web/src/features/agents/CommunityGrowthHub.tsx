"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const subscribeNoop = () => () => {};
const getSwitchFallbackSnapshot = () =>
  typeof HTMLInputElement !== "undefined" && !("switch" in HTMLInputElement.prototype);
const getSwitchFallbackServerSnapshot = () => false;
import Link from "next/link";
import { apiRequest } from "@/lib/api";

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
  const [commentChannelFilter, setCommentChannelFilter] = useState<"all" | "group_comment" | "page_comment">("all");
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
          : `⚠️ Không thể áp dụng tự động mục tiêu Growth Lead (${res.sync_result.reason || "locked_manual"}).`
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
      showBanner(
        res.scan_result.warnings.length > 0 ? "warning" : "success",
        `💬 Đã quét bình luận thật (Fanpage: +${res.scan_result.page_ingested}, Group: +${res.scan_result.group_ingested}) • Đã xếp hàng ${res.scan_result.queued_for_rag} bình luận chờ trả lời RAG${res.scan_result.auto_reply_comments ? " (Auto-Reply ĐANG BẬT)" : " (Auto-Reply đang tắt)"}.${warnSuffix}`
      );
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

  async function handleCopyAndOpenGroup(title: string, bodyText: string, promptText: string) {
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
    try {
      await navigator.clipboard.writeText(postContent);
      showBanner(
        "success",
        `Đã copy sẵn toàn bộ nội dung bài "${title}" vào bộ nhớ tạm! Cửa sổ Group "${hub.group.name}" đã mở — bạn chỉ cần bấm vào ô "Bạn viết gì đi..." và nhấn Ctrl + V để đăng vào Nhóm.`
      );
    } catch {
      showBanner(
        "warning",
        `Đã mở Group "${hub.group.name}". Bạn có thể sao chép nội dung bài "${title}" để dán trực tiếp vào Nhóm.`
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

  function renderPublishedArchivePanel(currentHub: HubResponse) {
    return (
      <section
        id="published-posts-by-date"
        className="space-y-4 rounded-2xl border-2 border-emerald-300 bg-gradient-to-b from-emerald-50/70 to-white p-4 sm:p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-[1_1_420px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-emerald-700 px-2.5 py-0.5 text-xs font-bold text-white">
                📚 LƯU TRỮ BÀI ĐÃ ĐĂNG (KHÔNG BAO GIỜ ẨN)
              </span>
              <span className="rounded-md border border-emerald-300 bg-white px-2.5 py-0.5 text-xs font-bold text-emerald-900">
                ✓ {primaryPublishedItems.length} bài đã đăng {targetMode === "fanpage" ? "Fanpage" : "Group Cộng đồng"}
              </span>
              <span className="rounded-md border border-slate-300 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                Tổng đa kênh (Group + Web + Fanpage cũ): {anyChannelPublishedItems.length} bài
              </span>
            </div>
            <h3 className="mt-2 text-lg font-bold text-slate-900">
              Các Bài Đã Đăng Theo Ngày • Tháng • Năm
            </h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Tất cả bài đã đăng đều được lưu trữ cố định tại đây theo đúng mốc <b>Ngày / Tháng / Năm & Giờ:Phút</b> thực tế (không bị ẩn đi khi lọc lịch hẹn), kèm ảnh thật, nội dung đã đăng, link xem trực tiếp và nút thu hồi nếu cần.
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
              }}
              className="max-w-full self-start rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100"
            >
              🔄 Xóa lọc ngày đã đăng
            </button>
          )}
        </div>

        {/* Bộ lọc kênh & Ngày / Tháng / Năm cho mục Các bài đã đăng */}
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-white p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700">Kênh đã đăng:</span>
            {[
              {
                id: "primary" as const,
                label: `✓ Đã đăng ${targetMode === "fanpage" ? "Fanpage" : "Group Cộng đồng"} (${primaryPublishedItems.length})`,
              },
              {
                id: "group" as const,
                label: `👥 Group Cộng đồng (${publishedGroupCount})`,
              },
              {
                id: "website" as const,
                label: `🌐 Website (${currentHub.calendar.daily.filter((i) => Boolean(i.published_slug)).length})`,
              },
              {
                id: "fanpage" as const,
                label: `📘 Fanpage (${publishedFanpageCount})`,
              },
              {
                id: "all_published" as const,
                label: `📚 Tất cả kênh đã đăng (${anyChannelPublishedItems.length})`,
              },
            ].map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setArchiveChannelFilter(ch.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  archiveChannelFilter === ch.id
                    ? "bg-emerald-700 text-white shadow-sm"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-emerald-50"
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label htmlFor="archive-day" className="block text-[11px] font-bold text-slate-700">
                Ngày đăng (01 – 31)
              </label>
              <select
                id="archive-day"
                value={archiveDay}
                onChange={(e) => {
                  const val = e.target.value;
                  setArchiveDay(val);
                  if (val === "all") {
                    setArchiveExactDate("");
                  } else if (archiveMonth !== "all" && archiveYear !== "all") {
                    setArchiveExactDate(`${archiveYear}-${archiveMonth}-${val}`);
                  }
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-900"
              >
                <option value="all">Tất cả các ngày</option>
                {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((dStr) => (
                  <option key={dStr} value={dStr}>
                    Ngày {dStr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="archive-month" className="block text-[11px] font-bold text-slate-700">
                Tháng đăng (01 – 12)
              </label>
              <select
                id="archive-month"
                value={archiveMonth}
                onChange={(e) => {
                  const val = e.target.value;
                  setArchiveMonth(val);
                  if (val === "all" || archiveDay === "all") {
                    setArchiveExactDate("");
                  } else if (archiveYear !== "all") {
                    setArchiveExactDate(`${archiveYear}-${val}-${archiveDay}`);
                  }
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-900"
              >
                <option value="all">Tất cả các tháng</option>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((mStr) => (
                  <option key={mStr} value={mStr}>
                    Tháng {mStr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="archive-year" className="block text-[11px] font-bold text-slate-700">
                Năm đăng
              </label>
              <select
                id="archive-year"
                value={archiveYear}
                onChange={(e) => {
                  const val = e.target.value;
                  setArchiveYear(val);
                  if (val === "all" || archiveMonth === "all" || archiveDay === "all") {
                    setArchiveExactDate("");
                  } else {
                    setArchiveExactDate(`${val}-${archiveMonth}-${archiveDay}`);
                  }
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-900"
              >
                <option value="all">Tất cả các năm</option>
                {availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    Năm {yr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="archive-exact-date" className="block text-[11px] font-bold text-slate-700">
                Chọn Lịch Ngày/Tháng/Năm
              </label>
              <input
                id="archive-exact-date"
                type="date"
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
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="archive-search" className="block text-[11px] font-bold text-slate-700">
                Tìm bài đã đăng
              </label>
              <input
                id="archive-search"
                type="search"
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                placeholder="Tiêu đề, nội dung..."
                className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900"
              />
            </div>
          </div>
        </div>

        {archiveGroupsByDate.length === 0 ? (
          <div className="rounded-xl border border-dashed border-emerald-300 bg-white p-6 text-center text-xs text-slate-600">
            Không có bài đã đăng nào khớp với ngày/tháng/năm đang chọn. Hãy bấm &ldquo;Xóa lọc ngày đã đăng&rdquo; hoặc chuyển sang kênh &ldquo;Tất cả kênh đã đăng&rdquo;.
          </div>
        ) : (
          <div className="space-y-4">
            {archiveGroupsByDate.map(([dateDisplay, itemsOnDate]) => (
              <div key={dateDisplay} className="space-y-2.5 rounded-xl border border-emerald-200 bg-white p-3.5 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1 text-xs font-bold text-white">
                    📅 Ngày {dateDisplay}
                  </span>
                  <span className="text-xs font-bold text-emerald-900">
                    {itemsOnDate.length} bài đã xuất bản trong ngày này
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                  {itemsOnDate.map((item) => {
                    const pubParts = extractPublishedDateParts(item);
                    const isGroupPub = Boolean(item.is_published_group || item.group_status === "published");
                    const isFanpagePub = Boolean(item.is_published_fanpage || item.fanpage_post_url);
                    const groupHref =
                      (isGroupPub ? item.group_post_url || item.facebook_post_url : null) || currentHub.group.group_url;
                    const fanpageHref = item.fanpage_post_url || currentHub.group.page_url;

                    return (
                      <article
                        key={`archive_${item.source_id}`}
                        className="flex flex-col justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/25 p-3.5"
                      >
                        <div className="flex gap-3">
                          <img
                            src={item.image_url}
                            alt={item.topic_title}
                            className="block aspect-[6/5] w-24 shrink-0 rounded-lg border border-slate-200 object-cover"
                            loading="lazy"
                          />
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                Bài #{item.day_index}
                              </span>
                              <span className="rounded bg-emerald-700 px-2 py-0.5 text-[10px] font-bold text-white">
                                ✓ Đã đăng {pubParts.dateDisplay} • {pubParts.timeHm}
                              </span>
                            </div>
                            <h4 className="line-clamp-2 text-xs font-bold text-slate-900">{item.topic_title}</h4>
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {isGroupPub && (
                                <span className="rounded border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                                  👥 Group Cộng đồng
                                </span>
                              )}
                              {item.published_slug && (
                                <span className="rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-900">
                                  🌐 Website
                                </span>
                              )}
                              {isFanpagePub && (
                                <span className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                  📘 Fanpage
                                </span>
                              )}
                              {item.engagement && (item.engagement.total_engagement > 0 || isGroupPub || isFanpagePub) && (
                                <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-900">
                                  ❤️ {item.engagement.likes} · 💬 {item.engagement.comments} · ↗️ {item.engagement.shares}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {item.post_body_preview && (
                          <details className="rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-700">
                            <summary className="cursor-pointer font-bold text-slate-800">
                              📄 Xem nội dung & ảnh đã đăng
                            </summary>
                            <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{item.post_body_preview}</p>
                          </details>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-100 pt-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isGroupPub && (
                              <a
                                href={groupHref}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg bg-blue-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-800"
                              >
                                👥 Xem trong Group ↗
                              </a>
                            )}
                            {item.published_slug && (
                              <a
                                href={`http://localhost:3001/posts/${item.published_slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg border border-emerald-600 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50"
                              >
                                🌐 Xem Web ↗
                              </a>
                            )}
                            {isFanpagePub && (
                              <a
                                href={fanpageHref}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                              >
                                📘 Fanpage ↗
                              </a>
                            )}
                          </div>

                          {isGroupPub && canEdit && (
                            <button
                              type="button"
                              disabled={!!busyAction}
                              onClick={() => void handleRetractGroupPost(item)}
                              className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                            >
                              {busyAction === `retract_${item.source_id}`
                                ? "Đang thu hồi…"
                                : "🗑️ Thu hồi bài Group"}
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ))}
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
    const memberDelta = currentHub.stats.member_growth_delta ?? 0;
    const engagementDelta = currentHub.stats.engagement_growth_delta ?? 0;

    return (
      <div id="post-engagement-stats-panel" className="min-w-0 space-y-5">
        {/* Bảng 1: Thống kê Like / Comment / Share từng bài đã đăng */}
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-[1_1_420px]">
              <div className="community-pill-row gap-2">
                <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">
                  📊 THỐNG KÊ TƯƠNG TÁC BÀI ĐÃ ĐĂNG
                </span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                  ❤️ {currentHub.stats.total_post_likes ?? 0} Likes · 💬 {currentHub.stats.total_post_comments ?? 0} Comments · ↗️ {currentHub.stats.total_post_shares ?? 0} Chia sẻ
                </span>
                {currentHub.group.last_post_stats_sync_at && (
                  <span className="text-[11px] text-slate-500">
                    Cập nhật: {new Date(currentHub.group.last_post_stats_sync_at).toLocaleString("vi-VN", { hour12: false })}
                  </span>
                )}
              </div>
              <h3 className="mt-1.5 text-base font-bold text-slate-900">
                Tổng hợp Thống kê Bài viết đã đăng (Group &amp; Fanpage)
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">
                Theo dõi trực tiếp lượt Thích (Likes/Reactions), Bình luận (Comments) và Chia sẻ (Shares) của từng bài từ Meta Graph API (Fanpage) và Playwright Group Bot (Group).
              </p>
            </div>
            <div className="community-pill-row gap-2">
              <button
                type="button"
                disabled={!canEdit || !!busyAction}
                onClick={() => void handleSyncPostStats()}
                className="rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {busyAction === "sync_post_stats"
                  ? "Đang đồng bộ Like, Comment, Share…"
                  : "📊 Đồng bộ Like, Comment, Share"}
              </button>
            </div>
          </div>

          <div className="community-pill-row mt-3 gap-2">
            {[
              { id: "all" as const, label: `Tất cả kênh (${allPostMetrics.length})` },
              {
                id: "group" as const,
                label: `👥 Group Cộng đồng (${allPostMetrics.filter((m) => m.channel === "group").length})`,
              },
              {
                id: "fanpage" as const,
                label: `📘 Fanpage (${allPostMetrics.filter((m) => m.channel === "fanpage").length})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPostMetricsChannelFilter(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  postMetricsChannelFilter === tab.id
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {filteredPostMetrics.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-600">
              Chưa có số liệu tương tác nào được đồng bộ trong kênh đã chọn. Hãy bấm &ldquo;📊 Đồng bộ Like, Comment, Share&rdquo; để hệ thống kéo dữ liệu thật từ Facebook.
            </div>
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="post-metrics-table-caption"
              className="community-table-wrapper mt-4 rounded-lg border border-slate-200"
            >
              <table className="community-table min-w-[780px] text-left text-xs">
                <caption id="post-metrics-table-caption" className="visually-hidden">
                  Thống kê lượt thích, bình luận và chia sẻ theo từng bài viết đã đăng trên Facebook Group và Fanpage
                </caption>
                <thead className="bg-slate-50 uppercase text-slate-500">
                  <tr>
                    <th scope="col" className="px-3 py-2.5">
                      Bài viết &amp; Kênh đăng
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      ❤️ Likes
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      💬 Comments
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      ↗️ Chia sẻ
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Tổng tương tác
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Đồng bộ &amp; Liên kết
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPostMetrics.map((pm) => (
                    <tr key={pm.id} className="border-t border-slate-100 align-top">
                      <th scope="row" className="max-w-xs px-3 py-3 font-normal">
                        <p className="line-clamp-2 font-bold text-slate-900">{pm.post_title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              pm.channel === "group"
                                ? "bg-emerald-100 text-emerald-900"
                                : "bg-blue-100 text-blue-900"
                            }`}
                          >
                            {pm.channel === "group" ? "👥 Facebook Group" : "📘 Fanpage"}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {pm.published_at
                              ? new Date(pm.published_at).toLocaleDateString("vi-VN")
                              : "Đã xuất bản"}
                          </span>
                        </div>
                      </th>
                      <td data-label="Likes" className="px-3 py-3 font-bold text-rose-700">
                        {pm.likes_count}
                      </td>
                      <td data-label="Comments" className="px-3 py-3 font-bold text-blue-800">
                        {pm.comments_count}
                      </td>
                      <td data-label="Chia sẻ" className="px-3 py-3 font-bold text-emerald-800">
                        {pm.shares_count}
                      </td>
                      <td data-label="Tổng tương tác" className="px-3 py-3">
                        <span className="rounded-full bg-slate-900 px-2.5 py-0.5 font-bold text-white">
                          {pm.total_engagement}
                        </span>
                      </td>
                      <td data-label="Đồng bộ & Link" className="px-3 py-3 text-slate-600">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500">
                            {new Date(pm.last_synced_at).toLocaleString("vi-VN", { hour12: false })}
                          </span>
                          {pm.post_url && (
                            <a
                              href={pm.post_url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-bold text-blue-700 hover:underline"
                            >
                              Mở bài viết ↗
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Bảng 2: Lịch sử Số liệu Phát triển (Thành viên Group & Tổng Tương tác) */}
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-[1_1_420px]">
              <div className="community-pill-row gap-2">
                <span className="rounded-md bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white">
                  📈 SỐ LIỆU PHÁT TRIỂN CỘNG ĐỒNG
                </span>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                  Biến động thành viên: {memberDelta >= 0 ? `+${memberDelta}` : memberDelta} người • Biến động tương tác: {engagementDelta >= 0 ? `+${engagementDelta}` : engagementDelta}
                </span>
              </div>
              <h3 className="mt-1.5 text-base font-bold text-slate-900">
                Chuỗi Tăng trưởng Thành viên &amp; Tương tác Theo Thời gian Thực
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">
                Mỗi lần đồng bộ thống kê bài viết hoặc quét Group, hệ thống lưu lại 1 điểm mốc lịch sử để theo dõi tốc độ phát triển cộng đồng.
              </p>
            </div>
          </div>

          {engSnapshots.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-600">
              Chưa có mốc lịch sử tương tác. Bấm &ldquo;📊 Đồng bộ Like, Comment, Share&rdquo; để ghi nhận điểm mốc đầu tiên.
            </div>
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="growth-snapshots-table-caption"
              className="community-table-wrapper mt-4 rounded-lg border border-slate-200"
            >
              <table className="community-table min-w-[740px] text-left text-xs">
                <caption id="growth-snapshots-table-caption" className="visually-hidden">
                  Lịch sử tăng trưởng thành viên cộng đồng và tổng tương tác qua từng lần đồng bộ
                </caption>
                <thead className="bg-slate-50 uppercase text-slate-500">
                  <tr>
                    <th scope="col" className="px-3 py-2.5">
                      Thời điểm ghi nhận
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Thành viên Group
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Tổng ❤️ Likes
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Tổng 💬 Comments
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Tổng ↗️ Shares
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Bài đang theo dõi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...engSnapshots].reverse().map((snap) => (
                    <tr key={snap.id} className="border-t border-slate-100">
                      <th scope="row" className="px-3 py-2.5 font-semibold text-slate-900">
                        {new Date(snap.captured_at).toLocaleString("vi-VN", { hour12: false })}
                      </th>
                      <td data-label="Thành viên Group" className="px-3 py-2.5 font-bold text-emerald-800">
                        {snap.group_members} người
                      </td>
                      <td data-label="Tổng Likes" className="px-3 py-2.5 font-bold text-rose-700">
                        {snap.total_likes} (G: {snap.group_likes} • P: {snap.page_likes})
                      </td>
                      <td data-label="Tổng Comments" className="px-3 py-2.5 font-bold text-blue-800">
                        {snap.total_comments} (G: {snap.group_comments} • P: {snap.page_comments})
                      </td>
                      <td data-label="Tổng Shares" className="px-3 py-2.5 font-bold text-indigo-800">
                        {snap.total_shares} (G: {snap.group_shares} • P: {snap.page_shares})
                      </td>
                      <td data-label="Số bài theo dõi" className="px-3 py-2.5 text-slate-700">
                        {snap.total_posts_tracked} bài
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  const weekEntries =
    hub.calendar.weekly.length > 0
      ? hub.calendar.weekly
      : [1, 2, 3, 4].map((wNum) => ({
          week_number: wNum,
          week_label: `Tuần ${wNum}`,
          date_range:
            wNum === 1
              ? "02/11/2026 00:00 – 08/11/2026 23:59"
              : wNum === 2
                ? "09/11/2026 00:00 – 15/11/2026 23:59"
                : wNum === 3
                  ? "16/11/2026 00:00 – 22/11/2026 23:59"
                  : "23/11/2026 00:00 – 30/11/2026 23:59",
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
    { id: "calendar", label: `1. Lịch Đăng bài (${hub.calendar.daily.length})` },
    { id: "published_archive", label: `2. Bài Đã Đăng & Thống Kê (${primaryPublishedItems.length})` },
    { id: "campaigns", label: "3. Chiến dịch, Auto-Reply & Mời" },
    { id: "discussions", label: `4. Thảo luận Cộng đồng (${hub.discussions.length})` },
    { id: "architecture", label: "5. 4 Agent & Cơ chế RAG" },
  ];

  return (
    <section className="min-w-0 max-w-full space-y-5 rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-blue-50/40 to-white p-5 sm:p-6 shadow-sm">
      {/* KHU VỰC 1: ĐỊNH DANH CỘNG ĐỒNG, ĐÍCH ĐĂNG & PHIÊN GROUP BOT */}
      <div className="min-w-0 space-y-4 rounded-xl border border-blue-100 bg-white p-4 sm:p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="community-pill-row min-w-0 flex-1 gap-2">
            <span className="inline-flex items-center rounded-full bg-blue-700 px-3 py-1 text-xs font-bold tracking-wide text-white">
              {targetMode === "fanpage"
                ? "📘 Đích đăng: Chỉ Fanpage cũ"
                : targetMode === "both"
                  ? "👥+📘 Đích đăng: Group Cộng đồng & Fanpage"
                  : "👥 Đích đăng chính: Facebook Group Cộng đồng"}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                isEdgeLoginOpen
                  ? "border-amber-400 bg-amber-50 text-amber-950"
                  : groupBotSession?.isLoggedIn
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-amber-300 bg-amber-50 text-amber-950"
              }`}
            >
              <span aria-hidden="true">
                {isEdgeLoginOpen ? "🟡" : groupBotSession?.isLoggedIn ? "🟢" : "🔴"}
              </span>
              {isEdgeLoginOpen
                ? "Group Bot: Đang mở Edge chờ đăng nhập / lưu phiên…"
                : groupBotSession?.isLoggedIn
                  ? `Group Bot: Đã sẵn sàng (${
                      groupBotSession.usingPageProfile
                        ? "Page Profile"
                        : groupBotSession.sessionSource === "cookie"
                          ? "Cookie"
                          : "Phiên Edge"
                    }${groupBotSession.accountIdMask ? ` • ${groupBotSession.accountIdMask}` : ""})`
                  : "Group Bot: Chưa đăng nhập phiên Edge"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-bold text-emerald-800">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
              {syncingRealtime
                ? "Đang tự động đồng bộ Facebook…"
                : `Cập nhật Realtime (15s) • Lúc ${lastSyncedDisplay || "vừa xong"}`}
            </span>
          </div>

          <div className="community-pill-row gap-2">
            <button
              type="button"
              onClick={() => void fetchHub({ silent: false })}
              className="inline-flex max-w-full items-center rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
            >
              🔄 Đồng bộ Ngay
            </button>
            <button
              type="button"
              aria-expanded={editingSettings}
              aria-controls="community-settings-panel"
              onClick={() => setEditingSettings((v) => !v)}
              className="inline-flex max-w-full items-center rounded-lg border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100"
            >
              🎯 Cấu hình Group &amp; Mục tiêu
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-[1_1_340px] space-y-1.5">
            <h2 className="break-words text-2xl font-bold tracking-tight text-slate-900">{hub.group.name}</h2>
            <p className="max-w-4xl break-words [overflow-wrap:anywhere] text-sm leading-relaxed text-slate-600">
              {hub.group.positioning}
            </p>
          </div>

          <div className="community-pill-row gap-2">
            <a
              href={hub.group.group_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center rounded-lg bg-blue-700 px-3.5 py-2 text-center text-xs font-bold text-white shadow-sm hover:bg-blue-800"
            >
              👥 Mở Group Cộng đồng ↗
            </a>
            <a
              href={hub.group.page_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center rounded-lg border border-blue-300 bg-white px-3.5 py-2 text-center text-xs font-bold text-blue-800 hover:bg-blue-50"
            >
              📘 Mở Fanpage (Messenger/RAG): {hub.group.page_name} ↗
            </a>
          </div>
        </div>

        {/* Điều phối Phiên & Tài khoản Group Bot */}
        <div className="min-w-0 space-y-2.5 border-t border-slate-100 pt-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="min-w-0 flex-[1_1_420px] space-y-1 leading-relaxed text-slate-600">
              <p>
                <b className="text-slate-900">Phiên đăng tự động Group Bot:</b>{" "}
                {groupBotSession?.isLoggedIn
                  ? "Đã lưu phiên Quản trị viên — Worker 24/7 và nút Đăng Group dùng trực tiếp phiên này (độc lập với token Fanpage)."
                  : "Chưa có phiên Quản trị viên Facebook Group Bot (.fb-session.json). Mở Edge 1 lần để đăng nhập tài khoản quản trị viên Group."}
              </p>
              {(hub.group.fb_admin_name || groupBotSession?.accountIdMask || groupBotSession?.usingPageProfile) && (
                <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-indigo-900">
                  <span>👤 Tài khoản đang lưu:</span>
                  {hub.group.fb_admin_name ? (
                    <span className="rounded bg-indigo-50 px-2 py-0.5 font-bold text-indigo-950 ring-1 ring-indigo-200">
                      {hub.group.fb_admin_name}
                    </span>
                  ) : !groupBotSession?.usingPageProfile && groupBotSession?.accountIdMask ? (
                    <span className="rounded bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-950 ring-1 ring-indigo-200">
                      Phiên Facebook đã xác thực
                    </span>
                  ) : null}
                  {groupBotSession?.usingPageProfile && (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 font-bold text-emerald-900 ring-1 ring-emerald-200">
                      Page Profile
                    </span>
                  )}
                  {groupBotSession?.accountIdMask && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-700">
                      ID: {groupBotSession.accountIdMask}
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="community-pill-row gap-2">
              <button
                type="button"
                disabled={!canEdit || !!busyAction}
                onClick={() => void handleLaunchGroupBotLogin()}
                className="max-w-full rounded-lg border border-indigo-600 bg-indigo-50 px-3 py-1.5 text-left text-xs font-bold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
              >
                {busyAction === "login_group_bot"
                  ? "Đang mở Microsoft Edge…"
                  : "🌐 Mở Edge Đăng nhập Group Bot (1 lần)"}
              </button>
              <button
                type="button"
                disabled={!canEdit || !!busyAction}
                onClick={() => void handleSwitchGroupBotAccount()}
                className="max-w-full rounded-lg border border-amber-600 bg-amber-50 px-3 py-1.5 text-left text-xs font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
              >
                {busyAction === "switch_group_bot_account"
                  ? "Đang mở Edge sạch để đổi tài khoản…"
                  : "🔄 Đổi tài khoản Group Bot"}
              </button>
              <button
                type="button"
                disabled={!!busyAction}
                onClick={() => void handleVerifyGroupBotSession()}
                className="max-w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-left text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {busyAction === "verify_group_bot"
                  ? "Đang kiểm tra phiên…"
                  : "🔍 Kiểm tra phiên Group Bot"}
              </button>
            </div>
          </div>

          {isEdgeLoginOpen && (
            <div className="space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50/95 p-3.5 text-xs text-amber-950">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-[1_1_360px] space-y-1">
                  <p className="font-bold">
                    ⏳ Cửa sổ Microsoft Edge đang giữ mở để bạn thao tác đăng nhập / chuyển Trang Quản trị viên Group:
                  </p>
                  <p className="leading-relaxed text-amber-900">
                    Trên cửa sổ Edge vừa mở, hãy đăng nhập đúng tài khoản Facebook (hoặc bấm ảnh đại diện góc phải →{" "}
                    <b>Chuyển trang cá nhân</b> sang Page Quản trị viên), sau đó bấm nút bên cạnh để lưu{" "}
                    <code>.fb-session.json</code> và tự động đóng Edge. (Phiên cũ vẫn được giữ an toàn cho đến khi bạn lưu mới.)
                  </p>
                </div>
                <div className="community-pill-row gap-2">
                  <button
                    type="button"
                    disabled={!canEdit || !!busyAction}
                    onClick={() => void handleCompleteGroupBotLogin()}
                    className="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {busyAction === "complete_group_bot_login"
                      ? "Đang lưu phiên & đóng Edge…"
                      : "✅ Đã đổi xong trên Edge — Lưu & Đóng Edge"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopLoginPolling();
                      setLoginWaitingOnEdge(false);
                    }}
                    className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                  >
                    Đóng bảng chờ
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white/90 px-3 py-2">
                <div className="min-w-0 flex-[1_1_320px] space-y-1">
                  <p className="font-bold text-amber-950">
                    💡 Không thấy cửa sổ Edge hiện lên màn hình?
                  </p>
                  <p className="text-[11px] leading-relaxed text-slate-700">
                    Nếu máy chủ Staging đang chạy từ phiên nền tách biệt, cửa sổ Edge có thể bị Windows giữ ở desktop nền. Hãy mở <b>PowerShell</b> tại thư mục <code>AI_GROWTH_OS</code> và chạy đúng 1 lệnh sau — Edge sẽ mở trực tiếp trên màn hình của bạn và tự đồng bộ về đây:
                  </p>
                  <code className="block overflow-x-auto rounded bg-slate-900 px-2.5 py-1.5 font-mono text-[11px] font-semibold text-emerald-300">
                    {cliFallbackCommand}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyCliFallback()}
                  className="shrink-0 rounded-lg border border-indigo-600 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100"
                >
                  {copiedCliFallback ? "✓ Đã copy lệnh" : "📋 Copy lệnh"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

        {bannerMessage && (
          <div
            ref={bannerRef}
            role={bannerTone === "error" ? "alert" : "status"}
            aria-live={bannerTone === "error" ? "assertive" : "polite"}
            aria-atomic="true"
            className={`space-y-3 rounded-xl border p-4 text-sm font-medium shadow-sm ${
              bannerTone === "error"
                ? "border-rose-300 bg-rose-50 text-rose-950"
                : bannerTone === "warning"
                  ? "border-amber-300 bg-amber-50 text-amber-950"
                  : "border-emerald-300 bg-emerald-50 text-emerald-900"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="leading-relaxed">{bannerMessage}</p>
              <button
                type="button"
                onClick={() => {
                  stopLoginPolling();
                  setBannerMessage("");
                  setBannerRecovery(null);
                }}
                className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Đóng
              </button>
            </div>
            {bannerRecovery && (
              <div className="community-pill-row gap-2 pt-1">
                <button
                  type="button"
                  disabled={!canEdit || !!busyAction}
                  onClick={() => void handleLaunchGroupBotLogin()}
                  className="rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-800 disabled:opacity-50"
                >
                  🌐 Mở Edge Đăng nhập Group Bot (1 lần)
                </button>
                <button
                  type="button"
                  disabled={!canEdit || !!busyAction}
                  onClick={() => void handleSwitchGroupBotAccount()}
                  className="rounded-lg border border-amber-600 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                >
                  🔄 Đổi tài khoản Group Bot
                </button>
                {isEdgeLoginOpen && (
                  <button
                    type="button"
                    disabled={!canEdit || !!busyAction}
                    onClick={() => void handleCompleteGroupBotLogin()}
                    className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    ✅ Đã đổi xong trên Edge — Lưu &amp; Đóng Edge
                  </button>
                )}
                <button
                  type="button"
                  disabled={!!busyAction}
                  onClick={() => void handleVerifyGroupBotSession()}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  🔍 Kiểm tra phiên Group Bot
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void handleCopyAndOpenGroup(
                      bannerRecovery.title,
                      bannerRecovery.body,
                      bannerRecovery.prompt
                    )
                  }
                  className="rounded-lg border border-blue-600 bg-white px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-50"
                >
                  📋 Copy &amp; Mở Group để dán tay ↗
                </button>
              </div>
            )}
          </div>
        )}

        {editingSettings && (
          <form
            id="community-settings-panel"
            onSubmit={handleSaveSettings}
            className="community-form space-y-4 rounded-xl border-2 border-blue-300 bg-white p-4 shadow-sm"
          >
            <div>
              <p className="text-xs font-bold text-slate-900">
                1. Cấu hình Tên Cộng đồng & Link Group Facebook của Riêng Bạn
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="community-name" className="block text-xs font-semibold text-slate-700">
                    Tên Cộng đồng của bạn
                  </label>
                  <input
                    id="community-name"
                    name="community_name"
                    type="text"
                    required
                    value={customCommunityName}
                    onChange={(e) => setCustomCommunityName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="community-group-url" className="block text-xs font-semibold text-slate-700">
                    Link Group / Cộng đồng Facebook của bạn
                  </label>
                  <input
                    id="community-group-url"
                    name="group_url"
                    type="url"
                    required
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={customGroupUrl}
                    onChange={(e) => setCustomGroupUrl(e.target.value)}
                    placeholder="https://www.facebook.com/groups/ten-group-cua-ban"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
              </div>
            </div>

            <fieldset className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <legend className="px-1 text-xs font-bold text-slate-900">
                2. Đích Đăng Bài Tự Động Mặc Định (Group Cộng đồng vs Fanpage)
              </legend>
              <p id="publish-target-help" className="mt-1 text-[11px] text-slate-600">
                Chọn nơi nhận các bài hẹn giờ 09:00 sáng và nút &ldquo;Đăng ngay&rdquo;. Fanpage luôn giữ vai trò trả lời Messenger &amp; RAG khi có kết nối.
              </p>
              <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
                {[
                  {
                    value: "group" as const,
                    id: "publish-target-group",
                    label: "Chỉ Group Cộng đồng (Mặc định)",
                    desc: "Tất cả bài viết đăng thẳng vào Group Facebook của bạn, không đẩy lên Fanpage.",
                  },
                  {
                    value: "both" as const,
                    id: "publish-target-both",
                    label: "Cả Group & Fanpage",
                    desc: "Đăng lên Group Cộng đồng đồng thời đăng thêm lên Fanpage (khi Fanpage có quyền).",
                  },
                  {
                    value: "fanpage" as const,
                    id: "publish-target-fanpage",
                    label: "Chỉ Fanpage cũ",
                    desc: "Chỉ đăng lên Fanpage Dịch vụ hỗ trợ du lịch, tạm tắt Group Bot.",
                  },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    htmlFor={opt.id}
                    className={`block cursor-pointer rounded-lg border p-2.5 text-xs transition ${
                      customPublishTarget === opt.value
                        ? "border-blue-600 bg-blue-50/80 text-slate-900"
                        : "border-slate-200 bg-white text-slate-700 hover:border-blue-300"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        id={opt.id}
                        name="publish_target"
                        value={opt.value}
                        checked={customPublishTarget === opt.value}
                        aria-describedby="publish-target-help"
                        onChange={() => setCustomPublishTarget(opt.value)}
                        className="community-radio shrink-0"
                      />
                      <span className="community-radio-text font-bold text-slate-900">{opt.label}</span>
                    </span>
                    <span className="mt-1 block pl-7 text-[11px] font-normal text-slate-600">
                      {opt.desc}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3 sm:grid-cols-2">
              <div>
                <label htmlFor="daily-invite-limit" className="block text-xs font-bold text-slate-900">
                  3. Giới hạn Lời mời Group An toàn / ngày (10 – 15 lượt)
                </label>
                <p className="mt-0.5 text-[11px] text-slate-600">
                  Giữ ngưỡng tự nhiên 10–15 lời mời/ngày (nút Mời Facebook &amp; Messenger) để tránh bị Facebook checkpoint.
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    id="daily-invite-limit"
                    name="daily_invite_limit"
                    type="number"
                    min={10}
                    max={15}
                    required
                    value={dailyInviteLimit}
                    onChange={(e) => setDailyInviteLimit(Number(e.target.value))}
                    className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold"
                  />
                  <span className="text-xs font-semibold text-slate-700">lời mời thật tối đa / ngày</span>
                </div>
              </div>
              <div className="flex flex-col justify-center gap-1.5 text-xs text-slate-700">
                <p className="font-bold text-slate-900">Trạng thái Sở hữu Mục tiêu:</p>
                <p className="text-[11px]">
                  {hub.group.target_source === "locked_manual"
                    ? "🔒 Đang khóa theo giá trị chỉnh tay. Bỏ khóa bên dưới hoặc bấm 'Growth Lead Đề xuất & Áp dụng Ngay' để bàn giao lại cho Growth Lead."
                    : "🤖 Growth Lead Agent đang tự động tính toán và áp dụng mục tiêu tuần từ chỉ số thực tế."}
                </p>
              </div>
            </div>

            <details className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <summary className="cursor-pointer text-xs font-bold text-slate-900">
                ⚙️ Tùy chỉnh &amp; Khóa Mục tiêu Thủ công (Chỉ dùng khi muốn ghi đè đề xuất của Growth Lead)
              </summary>
              <p className="mt-2 text-[11px] text-slate-600">
                Mục tiêu các tuần được <b>Growth Lead Agent</b> tự động đề xuất &amp; áp dụng. Chỉ chỉnh hoặc khóa khi bạn muốn cố định con số riêng.
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs">
                <input
                  id="lock-manual-targets"
                  name="lock_manual"
                  type="checkbox"
                  checked={lockManualTargets}
                  onChange={(e) => {
                    setLockManualTargets(e.target.checked);
                    setManualTargetsTouched(true);
                  }}
                  className="h-4 w-4 cursor-pointer"
                />
                <label htmlFor="lock-manual-targets" className="cursor-pointer font-bold text-amber-950">
                  🔒 Khóa mục tiêu thủ công (không cho Growth Lead tự ghi đè khi chạy chiến lược mới)
                </label>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div>
                  <label htmlFor="group-member-count" className="block text-xs font-semibold text-emerald-800">
                    Hiện có trong Group
                  </label>
                  <input
                    id="group-member-count"
                    name="group_member_count"
                    type="number"
                    min={0}
                    required
                    value={customGroupMemberCount}
                    onChange={(e) => setCustomGroupMemberCount(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-emerald-400 bg-emerald-50/40 px-3 py-1.5 text-xs font-bold text-emerald-950"
                  />
                </div>
                <div>
                  <label htmlFor="week1-target" className="block text-xs font-semibold text-slate-700">
                    Mục tiêu Tuần 1 (02/11–08/11)
                  </label>
                  <input
                    id="week1-target"
                    name="week1_target"
                    type="number"
                    min={1}
                    required
                    value={customWeek1Target}
                    onChange={(e) => {
                      setCustomWeek1Target(Number(e.target.value));
                      setManualTargetsTouched(true);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="week2-target" className="block text-xs font-semibold text-slate-700">
                    Mục tiêu Tuần 2 (09/11–15/11)
                  </label>
                  <input
                    id="week2-target"
                    name="week2_target"
                    type="number"
                    min={1}
                    required
                    value={customWeek2Target}
                    onChange={(e) => {
                      setCustomWeek2Target(Number(e.target.value));
                      setManualTargetsTouched(true);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="week3-target" className="block text-xs font-semibold text-slate-700">
                    Mục tiêu Tuần 3 (16/11–22/11)
                  </label>
                  <input
                    id="week3-target"
                    name="week3_target"
                    type="number"
                    min={1}
                    required
                    value={customWeek3Target}
                    onChange={(e) => {
                      setCustomWeek3Target(Number(e.target.value));
                      setManualTargetsTouched(true);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="week4-target" className="block text-xs font-semibold text-slate-700">
                    Mục tiêu Tuần 4 (23/11–30/11)
                  </label>
                  <input
                    id="week4-target"
                    name="week4_target"
                    type="number"
                    min={1}
                    required
                    value={customWeek4Target}
                    onChange={(e) => {
                      setCustomWeek4Target(Number(e.target.value));
                      setManualTargetsTouched(true);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold"
                  />
                </div>
              </div>
            </details>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!canEdit || busyAction === "save_settings"}
                className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {busyAction === "save_settings" ? "Đang lưu…" : "Lưu Mục tiêu & Cấu hình Cộng đồng"}
              </button>
              <button
                type="button"
                onClick={() => setEditingSettings(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600"
              >
                Đóng
              </button>
            </div>
          </form>
        )}

        {/* TRUNG TÂM CHỈ SỐ & ĐIỀU KHIỂN CỘNG ĐỒNG (GOM NHÓM THEO CHỨC NĂNG LIÊN QUAN) */}
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2
              id="community-command-center-heading"
              className="text-sm font-bold uppercase tracking-wider text-slate-800"
            >
              Trung tâm Chỉ số &amp; Điều khiển Cộng đồng
            </h2>
            <span className="text-xs font-semibold text-slate-600">
              Tuần hiện tại: <b>Tuần {currentCampaignWeek}</b> • Lộ trình 4 Tuần:{" "}
              <b>
                {hub.stats.week1_target} → {hub.stats.week2_target} → {w3Target} → {w4Target}
              </b>{" "}
              thành viên
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* KHỐI 1: TĂNG TRƯỞNG THÀNH VIÊN & LỘ TRÌNH GROWTH LEAD */}
            <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-emerald-200 bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 text-sm font-bold text-slate-900">
                  👥 Tăng trưởng Thành viên &amp; Lộ trình
                </h3>
                <span
                  className={`max-w-full rounded-md px-2 py-0.5 text-[11px] font-bold ${
                    hub.group.target_source === "locked_manual"
                      ? "bg-amber-100 text-amber-950"
                      : "bg-indigo-100 text-indigo-900"
                  }`}
                >
                  {hub.group.target_source === "locked_manual" ? "🔒 Thủ công" : "🤖 Growth Lead"}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
                  <div>
                    <p className="text-xl font-bold text-emerald-950">
                      {currentMembersCount} thành viên Group{" "}
                      <span className="text-sm font-bold text-emerald-700">
                        ({memberDelta >= 0 ? `+${memberDelta}` : memberDelta})
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-emerald-900">
                      Fanpage: <b>{hub.stats.real_page_followers ?? 0}</b> theo dõi
                    </p>
                  </div>
                  <span className="rounded bg-white px-2 py-0.5 text-[11px] font-bold text-emerald-900 ring-1 ring-emerald-200">
                    Tuần 1: {hub.stats.week1_achieved}/{hub.stats.week1_target}{" "}
                    {hub.stats.week1_achieved >= hub.stats.week1_target ? "✓ Đạt" : "Đang tăng"}
                  </span>
                </div>

                <div className="space-y-1 rounded-lg border border-blue-200 bg-blue-50/60 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold text-blue-950">
                    <span>Tiến độ Tuần {currentCampaignWeek} (Đang chạy)</span>
                    <span>
                      {currentWeekProgressCount}/{currentWeekTargetCount} thành viên ({currentWeekProgressPct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all"
                      style={{ width: `${currentWeekProgressPct}%` }}
                    />
                  </div>
                  <p className="pt-0.5 text-[11px] font-medium text-blue-900">
                    Mục tiêu 4 Tuần: <b>{hub.stats.week1_target}</b> → <b>{hub.stats.week2_target}</b> →{" "}
                    <b>{w3Target}</b> → <b>{w4Target}</b> thành viên
                  </p>
                </div>

                {hub.group.target_rationale && (
                  <p className="break-words rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5 text-[11px] leading-relaxed text-slate-700">
                    <b className="text-indigo-950">🤖 Cơ sở Growth Lead:</b> {hub.group.target_rationale}
                  </p>
                )}
              </div>

              <div className="community-pill-row mt-auto gap-2 border-t border-slate-100 pt-3 text-xs">
                <button
                  type="button"
                  disabled={!canEdit || !!busyAction}
                  onClick={() => void handleSyncGrowthLeadTargets()}
                  className="max-w-full rounded-lg bg-indigo-700 px-3 py-1.5 text-left text-xs font-bold text-white shadow-xs hover:bg-indigo-800 disabled:opacity-50"
                >
                  {busyAction === "sync_growth_lead_targets"
                    ? "Growth Lead đang tính…"
                    : "🤖 Growth Lead Đề xuất & Áp dụng Ngay"}
                </button>
                <button
                  type="button"
                  onClick={() => selectHubTab("campaigns", "campaigns-roadmap-panel")}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
                >
                  📈 Lộ trình 4 Tuần ↓
                </button>
                <Link
                  href="/agents/growth_lead"
                  className="font-bold text-indigo-800 underline underline-offset-2 hover:text-indigo-950"
                >
                  Growth Lead ↗
                </Link>
              </div>
            </article>

            {/* KHỐI 2: BÀI VIẾT, XUẤT BẢN & THỐNG KÊ TƯƠNG TÁC */}
            <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-rose-200 bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 text-sm font-bold text-slate-900">
                  📊 Bài viết, Xuất bản &amp; Tương tác
                </h3>
                <span className="max-w-full rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-900">
                  {hub.stats.tracked_posts_count ?? 0} bài đang theo dõi
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-purple-200 bg-purple-50/60 p-2.5">
                  <p className="text-base font-bold text-purple-950">
                    {targetMode === "fanpage"
                      ? `${publishedCount} Đã đăng Page • ${scheduledFilterCount} Hẹn giờ`
                      : `${publishedGroupCount} Đã đăng Group • ${scheduledGroupCount} Hẹn Group`}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-purple-900">
                    {failedGroupCount > 0 && targetMode !== "fanpage" ? (
                      <span className="font-bold text-rose-700">⚠ {failedGroupCount} bài lỗi Group • </span>
                    ) : null}
                    {targetMode === "fanpage"
                      ? `Tổng ${hub.calendar.daily.length} bài lịch ngày/giờ`
                      : `Fanpage cũ: ${publishedFanpageCount}/${hub.calendar.daily.length}`}
                    {" • "}
                    {hub.stats.total_approved_playbook_topics} chủ đề · {hub.stats.approved_unique_images} ảnh độc nhất (
                    {hub.stats.duplication_rate_pct}% trùng)
                  </p>
                </div>

                <div className="space-y-1.5 rounded-lg border border-rose-200/90 bg-gradient-to-r from-rose-50/60 via-white to-emerald-50/50 p-2.5">
                  <div className="community-pill-row gap-1.5 font-bold">
                    <span className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-800">
                      ❤️ {hub.stats.total_post_likes ?? 0} Likes
                    </span>
                    <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-900">
                      💬 {hub.stats.total_post_comments ?? 0} Comments
                    </span>
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-900">
                      ↗️ {hub.stats.total_post_shares ?? 0} Chia sẻ
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-700">
                    <span>
                      TB <b>{hub.stats.avg_engagement_per_post ?? 0}</b> tương tác/bài
                    </span>
                    <span className="font-bold text-slate-800">
                      Biến động: {engagementDelta >= 0 ? `+${engagementDelta}` : engagementDelta}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    <b>Group:</b> {hub.stats.group_post_likes ?? 0}❤️ / {hub.stats.group_post_comments ?? 0}💬 /{" "}
                    {hub.stats.group_post_shares ?? 0}↗️ <span className="mx-1 text-slate-300">|</span>{" "}
                    <b>Fanpage:</b> {hub.stats.fanpage_post_likes ?? 0}❤️ / {hub.stats.fanpage_post_comments ?? 0}💬 /{" "}
                    {hub.stats.fanpage_post_shares ?? 0}↗️
                  </p>
                </div>
              </div>

              <div className="community-pill-row mt-auto gap-2 border-t border-slate-100 pt-3 text-xs">
                <button
                  type="button"
                  disabled={!canEdit || !!busyAction}
                  onClick={() => void handlePublishFreshPost()}
                  className="max-w-full rounded-lg bg-emerald-600 px-3 py-1.5 text-left text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {busyAction === "publish_fresh"
                    ? "Đang đăng bài mới…"
                    : targetMode === "fanpage"
                      ? "⚡ Đăng ngay 1 bài mới (Fanpage)"
                      : targetMode === "both"
                        ? "⚡ Đăng ngay 1 bài mới (Group + Page)"
                        : "⚡ Đăng ngay 1 bài mới lên Group"}
                </button>
                <button
                  type="button"
                  disabled={!canEdit || !!busyAction}
                  onClick={() => {
                    const latestDisc = hub.discussions[0];
                    if (latestDisc) {
                      void handlePostGroupViaBot(
                        latestDisc.title,
                        latestDisc.body,
                        latestDisc.discussion_prompt,
                        latestDisc.image_url || undefined
                      );
                    } else {
                      void handlePostGroupViaBot(
                        "Cẩm nang du lịch và ẩm thực Đà Nẵng",
                        "Khám phá các món ăn đặc sản địa phương và chia sẻ kinh nghiệm cùng cộng đồng.",
                        "Bạn thích nhất món ăn nào tại Đà Nẵng?"
                      );
                    }
                  }}
                  className="max-w-full rounded-lg border border-purple-600 bg-purple-50 px-2.5 py-1.5 text-left text-xs font-bold text-purple-900 hover:bg-purple-100 disabled:opacity-50"
                >
                  🤖 Thảo luận qua Bot
                </button>
                <button
                  type="button"
                  disabled={!canEdit || !!busyAction}
                  onClick={() => void handleSyncPostStats()}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-rose-700 disabled:opacity-50"
                >
                  {busyAction === "sync_post_stats"
                    ? "Đang đồng bộ…"
                    : "📊 Đồng bộ Like, Comment, Share"}
                </button>
                <button
                  type="button"
                  onClick={() => selectHubTab("published_archive", "post-engagement-stats-panel")}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
                >
                  📈 Bảng Thống kê Chi tiết ↓
                </button>
              </div>
            </article>

            {/* KHỐI 3: TỰ ĐỘNG HÓA 24/7 — AUTO-REPLY RAG & MỜI GROUP AN TOÀN */}
            <article className="community-form flex min-w-0 flex-col gap-3 rounded-xl border border-indigo-200 bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="min-w-0 text-sm font-bold text-slate-900">
                  🤖 Tự động hóa 24/7 (RAG &amp; Mời Group)
                </h3>
                <span className="max-w-full rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-950">
                  {invitesSentToday}/{effectiveInviteLimit} mời hôm nay
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5">
                  <p className="text-base font-bold text-amber-950">
                    {hub.stats.comments_replied_count ?? 0} cmt RAG · {hub.stats.invites_sent_7d ?? 0} mời 7 ngày
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium text-amber-900">
                    Đã nhận <b>{hub.stats.comments_received_count ?? 0}</b> bình luận •{" "}
                    <b>{hub.stats.real_identified_people}</b> người tương tác Fanpage • Còn{" "}
                    <b>{invitesRemainingToday}</b>/{effectiveInviteLimit} lượt mời an toàn hôm nay
                  </p>
                </div>

                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2.5">
                  <label
                    htmlFor="toggle-auto-reply-comments"
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-semibold text-slate-800"
                  >
                    <input
                      id="toggle-auto-reply-comments"
                      type="checkbox"
                      disabled={!canEdit || !!busyAction}
                      checked={autoReplyComments}
                      onChange={(e) => void handleToggleCommunityAutomation("auto_reply_comments", e.target.checked)}
                      {...({ switch: "" } as Record<string, string>)}
                      {...(switchFallbackNeeded
                        ? {
                            "data-switch-fallback": "true",
                            role: "switch",
                            "aria-checked": autoReplyComments,
                          }
                        : {})}
                    />
                    <span className="min-w-0 flex-1 break-words">💬 Auto-Reply Comment (RAG)</span>
                  </label>

                  <label
                    htmlFor="toggle-auto-invite-enabled"
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-semibold text-slate-800"
                  >
                    <input
                      id="toggle-auto-invite-enabled"
                      type="checkbox"
                      disabled={!canEdit || !!busyAction}
                      checked={autoInviteEnabled}
                      onChange={(e) => void handleToggleCommunityAutomation("auto_invite_enabled", e.target.checked)}
                      {...({ switch: "" } as Record<string, string>)}
                      {...(switchFallbackNeeded
                        ? {
                            "data-switch-fallback": "true",
                            role: "switch",
                            "aria-checked": autoInviteEnabled,
                          }
                        : {})}
                    />
                    <span className="min-w-0 flex-1 break-words">✉️ Tự động Mời Group (10–15/ngày)</span>
                  </label>
                </div>
              </div>

              <div className="community-pill-row mt-auto gap-2 border-t border-slate-100 pt-3 text-xs">
                <button
                  type="button"
                  disabled={!canEdit || !!busyAction}
                  onClick={() => void handleScanComments()}
                  className="max-w-full rounded-lg border border-blue-600 bg-white px-3 py-1.5 text-left text-xs font-bold text-blue-800 hover:bg-blue-50 disabled:opacity-50"
                >
                  {busyAction === "scan_comments" ? "Đang quét Comment…" : "💬 Quét & Trả lời Comment"}
                </button>
                <button
                  type="button"
                  disabled={!canEdit || !!busyAction || !autoInviteEnabled}
                  onClick={() => void handleSendSafeInvites()}
                  className="max-w-full rounded-lg border border-emerald-700 bg-emerald-50 px-3 py-1.5 text-left text-xs font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {busyAction === "send_safe_invites" ? "Đang gửi lời mời…" : "✉️ Mời vào Group An toàn"}
                </button>
                <button
                  type="button"
                  onClick={() => selectHubTab("campaigns", "comment-invite-automation-panel")}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
                >
                  💬 Hộp thư &amp; Nhật ký Mời ↓
                </button>
              </div>
            </article>
          </div>
        </div>

      {/* Navigation Tabs (Accessible Single-Row Scrollable Tablist) */}
      <div
        role="tablist"
        aria-label="Các phân hệ điều hành Cộng đồng"
        className="community-tablist"
      >
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
              className="community-tab"
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        aria-labelledby={`community-tab-${activeTab}`}
        className="min-w-0 max-w-full space-y-6"
      >

      {/* TAB 1: CONCRETE DAILY / WEEKLY / MONTHLY EDITORIAL CALENDAR */}
      {activeTab === "calendar" && (
        <div className="min-w-0 max-w-full space-y-5">
          <div className="space-y-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Lịch Xuất Bản &amp; Quản Lý Trạng Thái Bài Viết Theo Ngày • Tháng • Năm • Tuần Cụ Thể
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Toàn bộ <b>{hub.calendar.daily.length} bài viết</b> đều có mốc <b>ngày/tháng/năm &amp; giờ:phút cụ thể</b>:{" "}
                <span className="font-bold text-emerald-700">
                  ✓ {publishedCount} bài đã đăng {targetMode === "fanpage" ? "Fanpage" : "vào Group"}
                </span>{" "}
                ·{" "}
                <span className="font-bold text-indigo-700">
                  ⏰ {scheduledFilterCount} bài đang hẹn giờ tự động
                </span>
                {failedGroupCount > 0 && targetMode !== "fanpage" ? (
                  <>
                    {" · "}
                    <span className="font-bold text-rose-700">⚠️ {failedGroupCount} bài lỗi Group Bot</span>
                  </>
                ) : null}
                {publishedFanpageCount > 0 && targetMode !== "fanpage" ? (
                  <>
                    {" · "}
                    <span className="font-semibold text-slate-600">
                      (📘 {publishedFanpageCount} bài đã đăng Fanpage cũ trước đó)
                    </span>
                  </>
                ) : null}
              </p>
            </div>
            <div className="community-pill-row gap-2">
              <button
                type="button"
                onClick={() => setCalendarView("daily")}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${calendarView === "daily" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
              >
                📅 Xem &amp; Lọc Theo Ngày / Tháng / Năm ({hub.calendar.daily.length} Bài)
              </button>
              <button
                type="button"
                onClick={() => setCalendarView("weekly")}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${calendarView === "weekly" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
              >
                🗓️ Xem Theo {weekSummaryStats.length} Tuần Cụ Thể (Lịch Chi Tiết)
              </button>
              <button
                type="button"
                onClick={() => setCalendarView("monthly")}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${calendarView === "monthly" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
              >
                📈 Lộ trình 3 Tháng (11/2026 – 01/2027)
              </button>
            </div>
          </div>

          {calendarView === "daily" && (
            <div className="space-y-5">
              {/* Banner Cơ chế Tự động */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4">
                <div className="min-w-0 flex-[1_1_420px] space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-indigo-700 px-2.5 py-0.5 text-xs font-bold text-white">
                      Autopilot Worker 24/7
                    </span>
                    <span className="rounded-md bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-900">
                      ✓ Đã đăng {targetMode === "fanpage" ? "Fanpage" : "Group"}: {publishedCount} bài
                    </span>
                    <span className="rounded-md bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-900">
                      ⏰ Đã hẹn giờ tự động: {scheduledFilterCount} bài
                    </span>
                    {failedGroupCount > 0 && targetMode !== "fanpage" && (
                      <span className="rounded-md bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-900">
                        ⚠️ Lỗi đăng Group: {failedGroupCount} bài
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-700">
                    Các bài hẹn giờ được lưu trong{" "}
                    <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px] font-bold text-indigo-800">
                      publishing_jobs
                    </code>{" "}
                    (kênh đích:{" "}
                    <b>
                      {targetMode === "fanpage"
                        ? `Fanpage "${hub.group.page_name}"`
                        : targetMode === "both"
                          ? `Group "${hub.group.name}" + Fanpage`
                          : `Group "${hub.group.name}"`}
                    </b>
                    ). Khi đến đúng <b>ngày, tháng, năm & giờ hẹn</b>, Worker tự động đăng lên{" "}
                    <b>
                      {targetMode === "fanpage"
                        ? "Fanpage + Website"
                        : targetMode === "both"
                          ? "Group Cộng đồng + Fanpage + Website"
                          : "Group Cộng đồng + Website"}
                    </b>{" "}
                    (nếu chưa có phiên Group Bot sẽ báo lỗi minh bạch, tuyệt đối không đẩy nhầm sang Fanpage).
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!canEdit || !!busyAction}
                  onClick={() => void handleScheduleAllPosts()}
                  className="max-w-full rounded-lg bg-indigo-700 px-3.5 py-2 text-left text-xs font-bold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-50"
                >
                  {busyAction === "schedule_all"
                    ? "Đang đồng bộ lịch…"
                    : targetMode === "fanpage"
                      ? "🗓️ Đồng bộ & Lên lịch Fanpage (09:00 sáng)"
                      : "🗓️ Đồng bộ & Lên lịch Group Cộng đồng (09:00 sáng)"}
                </button>
              </div>

              {/* BẢNG ĐIỀU KHIỂN PHÂN LỌC KHOA HỌC: CHỌN NGÀY / THÁNG / NĂM / TUẦN & TRẠNG THÁI */}
              <search aria-label="Bộ lọc lịch xuất bản cộng đồng" className="community-form block space-y-4 rounded-xl border-2 border-slate-200 bg-white p-4 shadow-sm">
                {/* Hàng Lọc 1: Chọn Ngày, Tháng, Năm & Lịch Ngày Cụ Thể */}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      🔍 1. Chọn Ngày • Tháng • Năm Cụ Thể Để Xem Bài Viết:
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setDailyFilter("all");
                          setSelectedYear(todayVn.yearStr);
                          setSelectedMonth(todayVn.monthStr);
                          setSelectedDay(todayVn.dayStr);
                          setSelectedExactDate(todayVn.dateIso);
                          setDailyPage(1);
                        }}
                        className="rounded-lg border border-emerald-500 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
                      >
                        📍 Xem Hôm nay ({todayVn.dateDisplay})
                      </button>
                      {nextUpcomingParts && (
                        <button
                          type="button"
                          onClick={() => {
                            setDailyFilter("scheduled");
                            setSelectedYear(nextUpcomingParts.yearStr);
                            setSelectedMonth(nextUpcomingParts.monthStr);
                            setSelectedDay(nextUpcomingParts.dayStr);
                            setSelectedExactDate(nextUpcomingParts.dateIso);
                            setDailyPage(1);
                          }}
                          className="rounded-lg border border-indigo-300 bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-800 hover:bg-indigo-100"
                        >
                          ⏰ Lịch hẹn kế tiếp ({nextUpcomingParts.dateDisplay})
                        </button>
                      )}
                      {fanpageOnlyCount > 0 && targetMode !== "fanpage" && (
                        <button
                          type="button"
                          onClick={() => {
                            setDailyFilter("fanpage_only");
                            setSelectedYear("all");
                            setSelectedMonth("all");
                            setSelectedDay("all");
                            setSelectedExactDate("");
                            setDailyPage(1);
                          }}
                          className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 hover:bg-blue-100"
                        >
                          📘 Chưa đăng Group ({fanpageOnlyCount} bài Page cũ)
                        </button>
                      )}
                      {hasActiveCustomFilter && (
                        <button
                          type="button"
                          onClick={resetAllDateFilters}
                          className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-800 hover:bg-rose-100"
                        >
                          🔄 Xóa bộ lọc (Xem tất cả {hub.calendar.daily.length} bài)
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {/* Chọn Ngày */}
                    <div>
                      <label htmlFor="filter-day" className="block text-xs font-semibold text-slate-700">
                        Chọn Ngày (01 – 31)
                      </label>
                      <select
                        id="filter-day"
                        name="filter_day"
                        value={selectedDay}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedDay(val);
                          setDailyFilter((prev) => (prev.startsWith("week") ? "all" : prev));
                          if (val === "all") {
                            setSelectedExactDate("");
                          } else {
                            const y = selectedYear === "all" ? todayVn.yearStr : selectedYear;
                            const m = selectedMonth === "all" ? todayVn.monthStr : selectedMonth;
                            setSelectedYear(y);
                            setSelectedMonth(m);
                            setSelectedExactDate(`${y}-${m}-${val}`);
                          }
                          setDailyPage(1);
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-900 focus:border-blue-600 focus:bg-white"
                      >
                        <option value="all">Tất cả các ngày ({hub.calendar.daily.length} bài)</option>
                        {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0")).map((dStr) => {
                          const info = dayCountsMap.get(dStr);
                          return (
                            <option key={dStr} value={dStr}>
                              Ngày {dStr}
                              {info
                                ? ` (${info.total} bài: ${info.published > 0 ? `${info.published} Đã đăng` : ""}${info.published > 0 && info.scheduled > 0 ? ", " : ""
                                }${info.scheduled > 0 ? `${info.scheduled} Chưa đăng/Hẹn` : ""})`
                                : " (0 bài)"}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Chọn Tháng */}
                    <div>
                      <label htmlFor="filter-month" className="block text-xs font-semibold text-slate-700">
                        Chọn Tháng (01 – 12)
                      </label>
                      <select
                        id="filter-month"
                        name="filter_month"
                        value={selectedMonth}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedMonth(val);
                          setDailyFilter((prev) => (prev.startsWith("week") ? "all" : prev));
                          if (val === "all" || selectedDay === "all") {
                            setSelectedExactDate("");
                          } else {
                            const y = selectedYear === "all" ? todayVn.yearStr : selectedYear;
                            if (selectedYear === "all") setSelectedYear(y);
                            setSelectedExactDate(`${y}-${val}-${selectedDay}`);
                          }
                          setDailyPage(1);
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-900 focus:border-blue-600 focus:bg-white"
                      >
                        <option value="all">Tất cả các tháng</option>
                        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((mStr) => {
                          const cnt = monthCountsMap.get(mStr) ?? 0;
                          return (
                            <option key={mStr} value={mStr}>
                              Tháng {mStr} {cnt > 0 ? `(${cnt} bài)` : "(0 bài)"}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* Chọn Năm */}
                    <div>
                      <label htmlFor="filter-year" className="block text-xs font-semibold text-slate-700">
                        Chọn Năm
                      </label>
                      <select
                        id="filter-year"
                        name="filter_year"
                        value={selectedYear}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedYear(val);
                          setDailyFilter((prev) => (prev.startsWith("week") ? "all" : prev));
                          if (val === "all" || selectedMonth === "all" || selectedDay === "all") {
                            setSelectedExactDate("");
                          } else {
                            setSelectedExactDate(`${val}-${selectedMonth}-${selectedDay}`);
                          }
                          setDailyPage(1);
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-900 focus:border-blue-600 focus:bg-white"
                      >
                        <option value="all">Tất cả các năm</option>
                        {availableYears.map((yr) => (
                          <option key={yr} value={yr}>
                            Năm {yr} ({yearCountsMap.get(yr) ?? 0} bài)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Ô Chọn Lịch Ngày/Tháng/Năm Trực Tiếp */}
                    <div>
                      <label htmlFor="filter-exact-date" className="block text-xs font-semibold text-slate-700">
                        Chọn Lịch Ngày/Tháng/Năm Cụ Thể
                      </label>
                      <input
                        id="filter-exact-date"
                        name="filter_exact_date"
                        type="date"
                        value={selectedExactDate}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedExactDate(val);
                          setDailyFilter((prev) => (prev.startsWith("week") ? "all" : prev));
                          if (val) {
                            const [y, m, d] = val.split("-");
                            if (y && m && d) {
                              setSelectedYear(y);
                              setSelectedMonth(m);
                              setSelectedDay(d);
                            }
                          } else {
                            setSelectedDay("all");
                          }
                          setDailyPage(1);
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:border-blue-600 focus:bg-white"
                      />
                    </div>

                    {/* Tìm kiếm theo Tiêu đề / Tag */}
                    <div>
                      <label htmlFor="filter-search-query" className="block text-xs font-semibold text-slate-700">
                        Tìm theo Tiêu đề / Tag / Giờ
                      </label>
                      <input
                        id="filter-search-query"
                        name="filter_search_query"
                        type="search"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setDailyPage(1);
                        }}
                        placeholder="VD: visa, thuê nhà, 09:00..."
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-blue-600 focus:bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Hàng Lọc 2: Phân lọc theo Trạng thái Bài viết & Các Tuần (Kèm Ngày Giờ Cụ Thể) */}
                <div className="space-y-2.5 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-700">
                      📌 2. Lọc theo Trạng thái xuất bản:
                    </span>
                    {[
                      {
                        id: "all" as const,
                        label: `Tất cả (${hub.calendar.daily.length} bài)`,
                        activeClass: "bg-slate-900 text-white shadow-sm",
                        inactiveClass: "bg-slate-100 text-slate-700 hover:bg-slate-200",
                      },
                      {
                        id: "published" as const,
                        label: `✓ Đã đăng ${targetMode === "fanpage" ? "Fanpage" : "Group"} (${publishedCount})`,
                        activeClass: "bg-emerald-700 text-white shadow-sm",
                        inactiveClass: "border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100",
                      },
                      {
                        id: "scheduled" as const,
                        label: `⏰ Đã hẹn giờ (${scheduledFilterCount})`,
                        activeClass: "bg-indigo-700 text-white shadow-sm",
                        inactiveClass: "border border-indigo-300 bg-indigo-50 text-indigo-900 hover:bg-indigo-100",
                      },
                      ...(targetMode !== "fanpage"
                        ? [
                            {
                              id: "failed" as const,
                              label: `⚠️ Lỗi Group Bot (${failedGroupCount})`,
                              activeClass: "bg-rose-700 text-white shadow-sm",
                              inactiveClass: "border border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100",
                            },
                            {
                              id: "fanpage_only" as const,
                              label: `📘 Mới đăng Fanpage cũ (${fanpageOnlyCount})`,
                              activeClass: "bg-blue-700 text-white shadow-sm",
                              inactiveClass: "border border-blue-300 bg-blue-50 text-blue-900 hover:bg-blue-100",
                            },
                          ]
                        : []),
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setDailyFilter(st.id);
                          setDailyPage(1);
                        }}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${dailyFilter === st.id ? st.activeClass : st.inactiveClass
                          }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  <div>
                    <span className="block text-xs font-bold text-slate-700">
                      🗓️ 3. Lọc theo Tuần (Kèm Mốc Ngày Tháng Năm & Giờ Cụ Thể, Trạng Thái Bài Trong Tuần):
                    </span>
                    <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {weekSummaryStats.map((w) => {
                        const isSelected = dailyFilter === w.id;
                        const statusParts = [
                          w.pub > 0 ? `✓ ${w.pub} Đã đăng` : "",
                          w.fail > 0 ? `⚠ ${w.fail} Lỗi` : "",
                          w.sched > 0 ? `⏰ ${w.sched} Hẹn giờ` : "",
                        ].filter(Boolean);
                        const statusText = w.total === 0 ? "0 bài trong tuần" : statusParts.join(" • ");
                        return (
                          <button
                            key={w.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => {
                              setDailyFilter(isSelected ? "all" : w.id);
                              setSelectedDay("all");
                              setSelectedMonth("all");
                              setSelectedYear("all");
                              setSelectedExactDate("");
                              setDailyPage(1);
                            }}
                            className={`flex flex-col items-start justify-between rounded-xl border p-2.5 text-left transition ${isSelected
                                ? "border-blue-700 bg-blue-700 text-white shadow-sm"
                                : "border-slate-200 bg-slate-50/80 text-slate-800 hover:border-blue-300 hover:bg-blue-50/50"
                              }`}
                          >
                            <div className="flex w-full flex-wrap items-center justify-between gap-1">
                              <span className="text-xs font-bold">Tuần {w.weekNum} ({w.total} bài)</span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${isSelected
                                    ? "bg-white/20 text-white"
                                    : w.total === 0
                                      ? "bg-slate-200 text-slate-700"
                                      : w.fail > 0
                                        ? "bg-rose-100 text-rose-900"
                                        : w.pub === w.total
                                          ? "bg-emerald-100 text-emerald-800"
                                          : "bg-indigo-100 text-indigo-800"
                                  }`}
                              >
                                {statusText}
                              </span>
                            </div>
                            <span
                              className={`mt-1 text-[11px] font-medium ${isSelected ? "text-blue-100" : "text-slate-600"
                                }`}
                            >
                              📅 {w.dateRange}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Hàng Lọc 3: Thanh Tóm Tắt Kết Quả Lọc & Phân Trang */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">
                      Kết quả lọc:{" "}
                      <span className="text-blue-700">{filteredDailyItems.length} bài viết</span>
                    </span>
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-900">
                      ✓ {filteredPublishedCount} đã đăng
                    </span>
                    <span className="rounded-md bg-indigo-100 px-2 py-0.5 font-bold text-indigo-900">
                      ⏰ {filteredScheduledCount} hẹn giờ
                    </span>
                    {filteredFailedCount > 0 && (
                      <span className="rounded-md bg-rose-100 px-2 py-0.5 font-bold text-rose-900">
                        ⚠️ {filteredFailedCount} lỗi Group
                      </span>
                    )}
                    {(selectedDay !== "all" || selectedMonth !== "all" || selectedYear !== "all") && (
                      <span className="rounded-md border border-blue-300 bg-blue-50 px-2 py-0.5 font-bold text-blue-900">
                        📅 Đang lọc thời gian:{" "}
                        {selectedDay !== "all" ? `Ngày ${selectedDay}` : "Mọi ngày"} /{" "}
                        {selectedMonth !== "all" ? `Tháng ${selectedMonth}` : "Mọi tháng"} /{" "}
                        {selectedYear !== "all" ? `Năm ${selectedYear}` : "Mọi năm"}
                      </span>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5">
                      <label htmlFor="filter-page-size" className="font-semibold text-slate-600">
                        Hiển thị:
                      </label>
                      <select
                        id="filter-page-size"
                        name="filter_page_size"
                        value={dailyPageSize}
                        onChange={(e) => {
                          setDailyPageSize(Number(e.target.value));
                          setDailyPage(1);
                        }}
                        className="max-w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-800"
                      >
                        <option value={6}>6 bài / trang</option>
                        <option value={9}>9 bài / trang</option>
                        <option value={12}>12 bài / trang</option>
                        <option value={Math.max(24, hub.calendar.daily.length)}>
                          Tất cả {hub.calendar.daily.length} bài
                        </option>
                      </select>
                    </div>
                    <span className="font-semibold text-slate-600">
                      Bài{" "}
                      <b>
                        {filteredDailyItems.length === 0 ? 0 : dailyStartIndex + 1}–
                        {Math.min(dailyStartIndex + dailyPageSize, filteredDailyItems.length)}
                      </b>{" "}
                      / {filteredDailyItems.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={currentDailyPage <= 1}
                        onClick={() => setDailyPage((p) => Math.max(1, p - 1))}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                      >
                        ‹ Trước
                      </button>
                      {Array.from({ length: totalDailyPages }, (_, i) => i + 1).map((pageNum) => (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setDailyPage(pageNum)}
                          className={`min-w-[28px] rounded-lg px-2 py-1 font-bold transition ${currentDailyPage === pageNum
                              ? "bg-slate-900 text-white"
                              : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-200"
                            }`}
                        >
                          {pageNum}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={currentDailyPage >= totalDailyPages}
                        onClick={() => setDailyPage((p) => Math.min(totalDailyPages, p + 1))}
                        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                      >
                        Sau ›
                      </button>
                    </div>
                  </div>
                </div>
              </search>

              {/* DANH SÁCH THẺ BÀI VIẾT KHOA HỌC — TÁCH BẠCH 5 VÙNG, KHÔNG ĐÈ LAYOUT & TAG */}
              {paginatedDailyItems.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
                  <p className="text-base font-bold text-slate-800">
                    Không tìm thấy bài viết nào khớp với bộ lọc ngày/tháng/năm hoặc trạng thái hiện tại.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Hãy chọn ngày/tháng khác hoặc bấm &ldquo;Xem toàn bộ&rdquo; để kiểm tra toàn bộ {hub.calendar.daily.length} bài theo lịch.
                  </p>
                  <button
                    type="button"
                    onClick={resetAllDateFilters}
                    className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800"
                  >
                    🔄 Xem toàn bộ {hub.calendar.daily.length} bài viết
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {paginatedDailyItems.map((item) => {
                    const isPublished = item.status === "published";
                    const isGroupPublished = Boolean(item.is_published_group || item.group_status === "published");
                    const isFanpagePublished = Boolean(item.is_published_fanpage || item.fanpage_post_url);
                    const isGroupFailed =
                      targetMode !== "fanpage" && !isGroupPublished && item.group_status === "failed";
                    const isGroupScheduled =
                      targetMode !== "fanpage" && !isGroupPublished && item.group_status === "scheduled";
                    const isFanpageOnlyPending = targetMode !== "fanpage" && !isPublished && isFanpagePublished;
                    const dateParts = extractItemDateParts(item);

                    const cardBorderClass = isPublished
                      ? "border-emerald-300"
                      : isGroupFailed
                        ? "border-rose-300"
                        : "border-indigo-200";
                    const headerToneClass = isPublished
                      ? "border-emerald-200 bg-emerald-50/90"
                      : isGroupFailed
                        ? "border-rose-200 bg-rose-50/90"
                        : "border-indigo-200 bg-indigo-50/90";
                    const statusPillClass = isPublished
                      ? "bg-emerald-700 text-white"
                      : isGroupFailed
                        ? "bg-rose-700 text-white"
                        : isFanpageOnlyPending
                          ? "bg-amber-700 text-white"
                          : "bg-indigo-700 text-white";
                    const statusPillText = isPublished
                      ? targetMode === "fanpage"
                        ? "✓ ĐÃ ĐĂNG FANPAGE"
                        : "✓ ĐÃ ĐĂNG GROUP"
                      : isGroupFailed
                        ? "⚠ LỖI ĐĂNG GROUP"
                        : isGroupScheduled
                          ? "⏰ HẸN ĐĂNG GROUP"
                          : isFanpageOnlyPending
                            ? "⚠ MỚI ĐĂNG FANPAGE CŨ"
                            : "⏳ SẴN SÀNG ĐĂNG GROUP";
                    const timeBoxClass = isPublished
                      ? "border-emerald-100 bg-emerald-50/40"
                      : isGroupFailed
                        ? "border-rose-100 bg-rose-50/40"
                        : "border-indigo-100 bg-indigo-50/40";
                    const timeTitleClass = isPublished
                      ? "text-emerald-950"
                      : isGroupFailed
                        ? "text-rose-950"
                        : "text-indigo-950";

                    const primaryGroupHref =
                      (isGroupPublished ? item.group_post_url || item.facebook_post_url : null) || hub.group.group_url;
                    const fanpageHref =
                      item.fanpage_post_url || (targetMode === "fanpage" ? item.facebook_post_url : null) || hub.group.page_url;

                    return (
                      <article
                        key={item.source_id}
                        className={`flex min-w-0 flex-col justify-between overflow-hidden rounded-xl border-2 bg-white shadow-sm transition hover:shadow-md ${cardBorderClass}`}
                      >
                        <div className="min-w-0">
                          {/* VÙNG 1: THANH HEADER TRẠNG THÁI & THỨ TỰ BÀI (Tách rời khỏi ảnh, không bao giờ đè lên ảnh/tiêu đề) */}
                          <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-2.5 ${headerToneClass}`}>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-md bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white">
                                Bài #{item.day_index}/{hub.calendar.daily.length}
                              </span>
                              <span className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-800">
                                Tuần {item.week_number}
                              </span>
                            </div>

                            <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold shadow-xs ${statusPillClass}`}>
                              {statusPillText}
                            </span>
                          </div>

                          {/* VÙNG 2: HÌNH ẢNH ĐỘC NHẤT (Không gắn chữ đè lên ảnh) */}
                          <div className="aspect-[16/9] w-full overflow-hidden border-b border-slate-100 bg-slate-100">
                            <img
                              src={item.image_url}
                              alt={item.image_attribution}
                              className="block h-full w-full object-cover"
                            />
                          </div>

                          {/* VÙNG 3: KHUNG THỜI GIAN CỤ THỂ (NGÀY/THÁNG/NĂM/GIỜ) & TRẠNG THÁI MINH BẠCH TỪNG KÊNH */}
                          <div className={`border-b px-4 py-3 ${timeBoxClass}`}>
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <span className={`text-xs font-bold ${timeTitleClass}`}>
                                {isPublished ? "🕒 Đã đăng lúc:" : "📅 Lịch hẹn đăng:"}{" "}
                                <span className="underline decoration-dotted underline-offset-2">
                                  {item.scheduled_date_vn || `${dateParts.dateDisplay} • ${dateParts.timeHm}`}
                                </span>
                              </span>
                            </div>
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-600">
                              🗓️ {item.week_range_label || `Tuần ${item.week_number}`} • Ngày{" "}
                              <b>{dateParts.dayStr}</b> Tháng <b>{dateParts.monthStr}</b> Năm{" "}
                              <b>{dateParts.yearStr}</b> (Giờ: <b>{dateParts.timeHm}</b>)
                            </p>

                            {/* Trạng thái tách bạch Group vs Website vs Fanpage cũ */}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                  targetMode === "fanpage"
                                    ? "border border-slate-300 bg-slate-100 text-slate-700"
                                    : isGroupPublished
                                      ? "border border-emerald-300 bg-emerald-100 text-emerald-900"
                                      : isGroupFailed
                                        ? "border border-rose-300 bg-rose-100 text-rose-900"
                                        : isGroupScheduled
                                          ? "border border-indigo-300 bg-indigo-100 text-indigo-900"
                                          : "border border-amber-300 bg-amber-100 text-amber-950"
                                }`}
                              >
                                👥 Group:{" "}
                                {targetMode === "fanpage"
                                  ? "Tắt (Chỉ Fanpage)"
                                  : isGroupPublished
                                    ? `✓ Đã đăng (${dateParts.timeHm})`
                                    : isGroupFailed
                                      ? "⚠ Lỗi Bot"
                                      : isGroupScheduled
                                        ? `⏰ Hẹn ${dateParts.dateDisplay} ${dateParts.timeHm}`
                                        : "⏳ Chưa đăng"}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                  item.published_slug
                                    ? "border border-emerald-300 bg-emerald-100 text-emerald-900"
                                    : "border border-slate-300 bg-slate-100 text-slate-700"
                                }`}
                              >
                                🌐 Website: {item.published_slug ? "✓ Đã xuất bản" : "⏰ Chờ đăng"}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${
                                  isFanpagePublished
                                    ? targetMode === "group"
                                      ? "border border-slate-300 bg-slate-100 text-slate-700"
                                      : "border border-blue-300 bg-blue-100 text-blue-900"
                                    : "border border-slate-200 bg-slate-50 text-slate-600"
                                }`}
                              >
                                {isFanpagePublished
                                  ? targetMode === "group"
                                    ? "📘 Fanpage cũ: ✓ Đã đăng trước"
                                    : "📘 Fanpage: ✓ Đã đăng"
                                  : targetMode === "group"
                                    ? "📘 Fanpage: Tắt (Chỉ Group)"
                                    : "📘 Fanpage: ⏰ Chờ đăng"}
                              </span>
                            </div>
                          </div>

                          {/* VÙNG 4: NỘI DUNG BÀI VIẾT & HỆ THỐNG TAG TÁCH BIỆT RÕ RÀNG */}
                          <div className="min-w-0 space-y-2.5 p-4">
                            <h4 className="break-words text-sm font-bold leading-snug text-slate-900">
                              {item.topic_title}
                            </h4>

                            <p className="break-words text-xs font-semibold text-blue-800">
                              🔥 Xu hướng thu hút: {item.target_trend}
                            </p>

                            {isGroupFailed && item.group_error && (
                              <div className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-[11px] leading-relaxed text-rose-950">
                                <b>⚠️ Lỗi Group Bot gần nhất:</b> {item.group_error}
                              </div>
                            )}

                            {/* Vùng Tag chủ đề & Nhãn kiểm chứng (flex-wrap + gap chuẩn, không bao giờ đè nhau) */}
                            <div className="space-y-1.5 pt-0.5">
                              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                Phân loại & Tag chủ đề:
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {(item.interest_tags || []).map((tag) => (
                                  <span
                                    key={tag}
                                    className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold leading-normal text-blue-900"
                                  >
                                    🏷️ {tag}
                                  </span>
                                ))}
                                <span className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold leading-normal text-emerald-800">
                                  ✓ Không trùng chủ đề
                                </span>
                                <span
                                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold leading-normal ${
                                    item.unique_image_verified
                                      ? "border-purple-200 bg-purple-50 text-purple-800"
                                      : "border-amber-300 bg-amber-50 text-amber-900"
                                  }`}
                                >
                                  {item.unique_image_verified
                                    ? `✓ Ảnh độc nhất #${item.day_index}`
                                    : `⚠ Ảnh trùng lặp #${item.day_index}`}
                                </span>
                              </div>
                            </div>

                            {item.concrete_action && (
                              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-700">
                                🎯 <b>Chi tiết trạng thái & hành động:</b> {item.concrete_action}
                              </div>
                            )}

                            {item.post_body_preview && (
                              <details className="rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] text-slate-700">
                                <summary className="cursor-pointer font-bold text-slate-800">
                                  📄 Nội dung bài đăng thực tế (khớp với Group & Distribution)
                                </summary>
                                <p className="mt-2 whitespace-pre-wrap leading-relaxed text-slate-700">
                                  {item.post_body_preview}
                                </p>
                              </details>
                            )}

                            <p className="text-xs leading-relaxed text-slate-600">
                              💬 {item.community_discussion_hook}
                            </p>

                            {item.engagement &&
                              (item.engagement.total_engagement > 0 || isPublished || isFanpagePublished) && (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200/80 bg-rose-50/50 px-2.5 py-1.5 text-[11px] font-bold text-slate-800">
                                  <span>
                                    ❤️ {item.engagement.likes} · 💬 {item.engagement.comments} · ↗️{" "}
                                    {item.engagement.shares}
                                  </span>
                                  {(item.engagement.group_likes +
                                    item.engagement.group_comments +
                                    item.engagement.group_shares >
                                    0 ||
                                    item.engagement.page_likes +
                                      item.engagement.page_comments +
                                      item.engagement.page_shares >
                                      0) && (
                                    <span className="text-[10px] font-semibold text-slate-600">
                                      Group: {item.engagement.group_likes}❤️/{item.engagement.group_comments}💬/
                                      {item.engagement.group_shares}↗️ • Page: {item.engagement.page_likes}❤️/
                                      {item.engagement.page_comments}💬/{item.engagement.page_shares}↗️
                                    </span>
                                  )}
                                </div>
                              )}
                          </div>
                        </div>

                        {/* VÙNG 5: CHÂN THẺ (LINK BÀI ĐÃ ĐĂNG GROUP/WEB HOẶC BỘ ĐỔI NGÀY GIỜ & NÚT ĐĂNG GROUP) */}
                        <div className="space-y-2.5 border-t border-slate-200 bg-slate-50 px-4 py-3">
                          {isPublished ? (
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-950">
                                <span>
                                  Trạng thái: ✓{" "}
                                  {targetMode === "fanpage"
                                    ? "Đã đăng Fanpage thành công"
                                    : "Đã đăng vào Group thành công"}
                                </span>
                                <span className="whitespace-nowrap">{dateParts.dateDisplay} • {dateParts.timeHm}</span>
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  {targetMode !== "fanpage" && (
                                    <a
                                      href={primaryGroupHref}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center rounded-lg bg-blue-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-blue-800"
                                    >
                                      👥 Xem bài trong Group ↗
                                    </a>
                                  )}
                                  {item.published_slug && (
                                    <a
                                      href={`http://localhost:3001/posts/${item.published_slug}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center rounded-lg border border-emerald-600 bg-white px-2.5 py-1.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50"
                                    >
                                      🌐 Xem bài Web ↗
                                    </a>
                                  )}
                                  {isFanpagePublished && (
                                    <a
                                      href={fanpageHref}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`inline-flex items-center rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${
                                        targetMode === "fanpage"
                                          ? "bg-blue-700 text-white hover:bg-blue-800"
                                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                                      }`}
                                    >
                                      {targetMode === "fanpage" ? "📘 Xem bài Fanpage ↗" : "📘 Fanpage cũ ↗"}
                                    </a>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {isGroupPublished && canEdit && (
                                    <button
                                      type="button"
                                      disabled={!!busyAction}
                                      onClick={() => void handleRetractGroupPost(item)}
                                      className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-1.5 text-[11px] font-bold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                                    >
                                      {busyAction === `retract_${item.source_id}`
                                        ? "Đang thu hồi…"
                                        : "🗑️ Thu hồi bài Group"}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleCopyAndOpenGroup(
                                        item.topic_title,
                                        buildShareableCardBody(item),
                                        item.community_discussion_hook
                                      )
                                    }
                                    className="rounded-lg border border-blue-600 bg-white px-2.5 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                                  >
                                    📋 Copy & Mở Group ↗
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              <div className="community-form rounded-lg border border-indigo-200 bg-white p-2.5">
                                <label
                                  htmlFor={`reschedule-${item.source_id}`}
                                  className="block text-[11px] font-bold text-indigo-950"
                                >
                                  ⏰ Chọn lại Ngày/Tháng/Năm & Giờ hẹn đăng tự động:
                                </label>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <input
                                    id={`reschedule-${item.source_id}`}
                                    name={`reschedule_${item.source_id}`}
                                    type="datetime-local"
                                    disabled={!canEdit || !!busyAction}
                                    value={
                                      customScheduleMap[item.source_id] ??
                                      toDatetimeLocalValue(item.scheduled_iso)
                                    }
                                    onChange={(e) =>
                                      setCustomScheduleMap((prev) => ({
                                        ...prev,
                                        [item.source_id]: e.target.value,
                                      }))
                                    }
                                    className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-800"
                                  />
                                  <button
                                    type="button"
                                    disabled={!canEdit || !!busyAction}
                                    onClick={() => void handleReschedulePost(item.source_id, item.scheduled_iso)}
                                    className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                                  >
                                    {busyAction === `reschedule_${item.source_id}` ? "Đang lưu…" : "💾 Lưu lịch hẹn"}
                                  </button>
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  {item.published_slug ? (
                                    <a
                                      href={`http://localhost:3001/posts/${item.published_slug}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-bold text-emerald-700 hover:underline"
                                    >
                                      🌐 Xem bài Web đã tạo ↗
                                    </a>
                                  ) : (
                                    <span className="text-[11px] font-semibold text-indigo-900">
                                      Đích: {targetMode === "fanpage" ? "Fanpage" : "Group"} • {dateParts.dateDisplay}{" "}
                                      {dateParts.timeHm}
                                    </span>
                                  )}
                                  {isFanpagePublished && targetMode !== "fanpage" && (
                                    <a
                                      href={fanpageHref}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="font-semibold text-slate-600 hover:underline"
                                    >
                                      📘 Bài Fanpage cũ ↗
                                    </a>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
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
                                    className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                                  >
                                    {busyAction === item.source_id
                                      ? "Đang đăng…"
                                      : targetMode === "fanpage"
                                        ? "⚡ Đăng lên Fanpage"
                                        : "🤖 Đăng bài này vào Group"}
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
                                    className="rounded-lg border border-blue-600 bg-white px-2.5 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                                  >
                                    📋 Copy & Mở Group
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {/* Bottom Pagination Footer */}
              {totalDailyPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm">
                  <span className="font-semibold text-slate-600">
                    Đang xem trang <b>{currentDailyPage}</b> / <b>{totalDailyPages}</b> (Bài{" "}
                    {dailyStartIndex + 1}–{Math.min(dailyStartIndex + dailyPageSize, filteredDailyItems.length)} trong tổng số{" "}
                    {filteredDailyItems.length} bài)
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      disabled={currentDailyPage <= 1}
                      onClick={() => setDailyPage(1)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    >
                      « Đầu
                    </button>
                    <button
                      type="button"
                      disabled={currentDailyPage <= 1}
                      onClick={() => setDailyPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    >
                      ‹ Trang trước
                    </button>
                    {Array.from({ length: totalDailyPages }, (_, i) => i + 1).map((pageNum) => (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setDailyPage(pageNum)}
                        className={`min-w-[32px] rounded-lg px-2.5 py-1.5 font-bold transition ${currentDailyPage === pageNum
                            ? "bg-blue-700 text-white shadow-sm"
                            : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-200"
                          }`}
                      >
                        {pageNum}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={currentDailyPage >= totalDailyPages}
                      onClick={() => setDailyPage((p) => Math.min(totalDailyPages, p + 1))}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    >
                      Trang sau ›
                    </button>
                    <button
                      type="button"
                      disabled={currentDailyPage >= totalDailyPages}
                      onClick={() => setDailyPage(totalDailyPages)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40"
                    >
                      Cuối »
                    </button>
                  </div>
                </div>
              )}

              {/* MỤC CÁC BÀI ĐÃ ĐĂNG THEO NGÀY / THÁNG / NĂM — LUÔN HIỂN THỊ, KHÔNG BAO GIỜ BỊ ẨN */}
              {renderPublishedArchivePanel(hub)}
            </div>
          )}

          {calendarView === "weekly" && (
            <div className="grid gap-5 md:grid-cols-2">
              {hub.calendar.weekly.map((w) => {
                const weekPosts = hub.calendar.daily.filter((item) => item.week_number === w.week_number);
                const weekPubCount = weekPosts.filter((item) => item.status === "published").length;
                const weekFailCount =
                  targetMode === "fanpage"
                    ? 0
                    : weekPosts.filter((item) => item.status !== "published" && item.group_status === "failed").length;
                const weekSchedCount = weekPosts.length - weekPubCount - weekFailCount;
                const weekFilterId = `week${w.week_number}` as WeekFilterId;

                return (
                  <div key={w.week_number} className="flex min-w-0 flex-col justify-between rounded-xl border-2 border-slate-200 bg-white p-5 shadow-sm">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <span className="rounded-lg bg-blue-700 px-3 py-1 text-xs font-bold text-white">
                          {w.week_label}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-900">
                            ✓ {weekPubCount} Đã đăng
                          </span>
                          {weekFailCount > 0 && (
                            <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-900">
                              ⚠️ {weekFailCount} Lỗi Group
                            </span>
                          )}
                          <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-900">
                            ⏰ {weekSchedCount} Hẹn giờ
                          </span>
                        </div>
                      </div>

                      <p className="mt-2.5 text-xs font-bold text-emerald-800">🎯 {w.member_target}</p>
                      <h4 className="mt-1.5 text-base font-bold text-slate-900">{w.pillar_theme}</h4>
                      {w.responsible_agents && (
                        <p className="mt-1 text-xs font-semibold text-purple-800">
                          🤖 Phân công Agent: {w.responsible_agents}
                        </p>
                      )}
                      <p className="mt-1 text-xs font-semibold text-blue-800">
                        💬 Hoạt động tương tác: {w.interactive_format}
                      </p>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
                          Danh sách {weekPosts.length} bài viết kèm Ngày Giờ & Trạng thái cụ thể:
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setDailyFilter(weekFilterId);
                            setSelectedDay("all");
                            setSelectedMonth("all");
                            setSelectedYear("all");
                            setSelectedExactDate("");
                            setDailyPage(1);
                            setCalendarView("daily");
                          }}
                          className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-800 hover:bg-blue-100"
                        >
                          🔍 Lọc chi tiết Tuần {w.week_number} →
                        </button>
                      </div>

                      <ul className="mt-2.5 space-y-2 text-xs">
                        {weekPosts.length === 0 ? (
                          <li className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-center text-slate-600">
                            Không có bài viết nào được xếp trong khoảng thời gian {w.date_range || w.week_label}.
                          </li>
                        ) : (
                          weekPosts.map((post) => {
                          const isPub = post.status === "published";
                          const isGroupPub = Boolean(post.is_published_group || post.group_status === "published");
                          const isFanpagePub = Boolean(post.is_published_fanpage || post.fanpage_post_url);
                          const isFail = targetMode !== "fanpage" && !isGroupPub && post.group_status === "failed";
                          const parts = extractItemDateParts(post);
                          return (
                            <li
                              key={post.source_id}
                              className={`rounded-lg border p-2.5 ${
                                isPub
                                  ? "border-emerald-200 bg-emerald-50/50"
                                  : isFail
                                    ? "border-rose-200 bg-rose-50/50"
                                    : "border-indigo-100 bg-slate-50"
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-1.5">
                                <span className="font-bold text-slate-900">
                                  Bài #{post.day_index} • 📅 {post.scheduled_date_vn || `${parts.dateDisplay} • ${parts.timeHm}`}
                                </span>
                                <span
                                  className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                    isPub
                                      ? "bg-emerald-700 text-white"
                                      : isFail
                                        ? "bg-rose-700 text-white"
                                        : isFanpagePub && targetMode !== "fanpage"
                                          ? "bg-amber-700 text-white"
                                          : "bg-indigo-700 text-white"
                                  }`}
                                >
                                  {isPub
                                    ? `✓ ĐÃ ĐĂNG ${targetMode === "fanpage" ? "PAGE" : "GROUP"} (${parts.dateDisplay} ${parts.timeHm})`
                                    : isFail
                                      ? `⚠️ LỖI GROUP (${parts.dateDisplay})`
                                      : isFanpagePub && targetMode !== "fanpage"
                                        ? `⚠ MỚI ĐĂNG PAGE CŨ (${parts.dateDisplay})`
                                        : `⏰ HẸN ${targetMode === "fanpage" ? "PAGE" : "GROUP"} (${parts.dateDisplay} ${parts.timeHm})`}
                                </span>
                              </div>
                              <p className="mt-1 font-bold text-slate-800">{post.topic_title}</p>
                              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap gap-1">
                                  {(post.interest_tags || []).map((t) => (
                                    <span
                                      key={t}
                                      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
                                    >
                                      🏷️ {t}
                                    </span>
                                  ))}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                                  {isGroupPub && (post.group_post_url || post.facebook_post_url) && (
                                    <a
                                      href={post.group_post_url || post.facebook_post_url || hub.group.group_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-blue-700 hover:underline"
                                    >
                                      👥 Group ↗
                                    </a>
                                  )}
                                  {isFanpagePub && (post.fanpage_post_url || post.facebook_post_url) && (
                                    <a
                                      href={post.fanpage_post_url || post.facebook_post_url || hub.group.page_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={targetMode === "fanpage" ? "text-blue-700 hover:underline" : "text-slate-600 hover:underline"}
                                    >
                                      {targetMode === "fanpage" ? "📘 Fanpage ↗" : "📘 Fanpage cũ ↗"}
                                    </a>
                                  )}
                                  {post.published_slug && (
                                    <a
                                      href={`http://localhost:3001/posts/${post.published_slug}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-emerald-700 hover:underline"
                                    >
                                      🌐 Web ↗
                                    </a>
                                  )}
                                </div>
                              </div>
                            </li>
                          );
                        })
                        )}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {calendarView === "monthly" && (
            <div className="grid gap-4 md:grid-cols-3">
              {hub.calendar.monthly.map((m) => (
                <div key={m.month_number} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">
                      {m.date_range || `Tháng ${m.month_number}`}
                    </span>
                  </div>
                  <h4 className="mt-3 text-base font-bold text-slate-900">{m.month_label}</h4>
                  <p className="mt-2 rounded-lg bg-emerald-50 p-2.5 text-xs font-bold text-emerald-900">
                    🎯 Mục tiêu thành viên: {m.member_goal}
                  </p>
                  <p className="mt-2 text-xs font-medium text-slate-700">{m.content_commitment}</p>
                  <ul className="mt-3 space-y-2 text-xs text-slate-700">
                    {m.key_pillars.map((p) => (
                      <li key={p} className="flex gap-2 rounded bg-slate-50 p-2">
                        <span className="font-bold text-blue-700">→</span>
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PUBLISHED POSTS ARCHIVE BY DAY / MONTH / YEAR & POST ENGAGEMENT STATS */}
      {activeTab === "published_archive" && (
        <div className="min-w-0 max-w-full space-y-6">
          {renderPublishedArchivePanel(hub)}
          {renderPostEngagementStatsSection(hub)}
        </div>
      )}

      {/* TAB 3: WEEKLY MEMBER ACQUISITION CAMPAIGNS, GROWTH LEAD TARGETS, COMMENT RAG & SAFE INVITES */}
      {activeTab === "campaigns" && (
        <div className="min-w-0 max-w-full space-y-6">
          <div
            id="campaigns-roadmap-panel"
            className="min-w-0 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 sm:p-5"
          >
            <div className="space-y-2.5">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md px-2.5 py-0.5 text-xs font-bold ${
                      hub.group.target_source === "locked_manual"
                        ? "bg-amber-200 text-amber-950"
                        : "bg-indigo-700 text-white"
                    }`}
                  >
                    {hub.group.target_source === "locked_manual"
                      ? "🔒 Mục tiêu Khóa Thủ Công"
                      : "🤖 Mục tiêu từ Growth Lead Agent (Tự động Áp dụng)"}
                  </span>
                  <span className="rounded-md border border-indigo-200 bg-white px-2.5 py-0.5 text-xs font-bold text-indigo-900">
                    Mục tiêu: {hub.stats.week1_target} → {hub.stats.week2_target} → {hub.stats.week3_target ?? 18} →{" "}
                    {hub.stats.week4_target ?? 30} thành viên
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Lộ trình Tăng trưởng Cộng đồng 4 Tuần (Growth Lead Đề xuất &amp; Tự Áp dụng)
                </h3>
                <p className="text-xs leading-relaxed text-slate-700">
                  {hub.group.target_rationale ||
                    `Growth Lead tính mục tiêu tăng dần theo nền ${hub.stats.real_group_members ?? hub.stats.week1_achieved} thành viên hiện có, tỷ lệ tương tác thực tế và ngưỡng mời an toàn ${hub.stats.daily_invite_limit ?? 12} lượt/ngày.`}
                </p>
              </div>
              <div className="community-pill-row gap-2">
                <button
                  type="button"
                  disabled={!canEdit || !!busyAction}
                  onClick={() => void handleSyncGrowthLeadTargets()}
                  className="rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-800 disabled:opacity-50"
                >
                  {busyAction === "sync_growth_lead_targets"
                    ? "Growth Lead đang tính…"
                    : "🤖 Growth Lead Đề xuất & Áp dụng Ngay"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSettings(true)}
                  className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-50"
                >
                  ⚙️ Mở Cấu hình &amp; Ghi đè Thủ công
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {hub.weekly_campaigns.map((c) => {
                const pct = Math.min(100, Math.round((c.current_members / Math.max(1, c.target_members)) * 100));
                return (
                  <div
                    key={c.week}
                    className={`rounded-xl border bg-white p-4 ${
                      c.status === "completed_target"
                        ? "border-emerald-300 bg-emerald-50/40"
                        : c.status === "active_campaign"
                          ? "border-blue-300 bg-blue-50/40 ring-2 ring-blue-200"
                          : "border-slate-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                        {c.date_range ? `Tuần ${c.week}: ${c.date_range}` : `Tuần ${c.week}`}
                      </span>
                      <span className="whitespace-nowrap text-xs font-bold text-blue-800">
                        Mục tiêu: {c.target_members} người
                      </span>
                    </div>
                    <h4 className="mt-2 text-sm font-bold text-slate-900">{c.title}</h4>
                    <p className="mt-1 text-xs font-medium text-slate-600">Chủ đề trọng tâm: {c.theme}</p>
                    {c.responsible_agents && (
                      <p className="mt-1 text-[11px] font-semibold text-purple-800">🤖 {c.responsible_agents}</p>
                    )}
                    <div className="mt-3">
                      <div className="flex justify-between text-xs font-semibold">
                        <span>Tiến độ thực tế</span>
                        <span>
                          {c.current_members}/{c.target_members} thành viên ({pct}%)
                        </span>
                      </div>
                      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full ${c.status === "completed_target" ? "bg-emerald-600" : "bg-blue-600"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {c.target_trends.map((t) => (
                        <span
                          key={t}
                          className="rounded bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                    <ul className="mt-3 space-y-1.5 text-xs text-slate-700">
                      {c.tactics.map((tactic) => (
                        <li key={tactic} className="flex gap-1.5">
                          <span className="font-bold text-blue-700">•</span>
                          <span>{tactic}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {/* COMMENT INBOX, SAFE GROUP INVITES & REAL PROSPECTS */}
          <div id="comment-invite-automation-panel" className="min-w-0 space-y-6">
          {/* COMMENT INBOX & RAG AUTO-REPLY */}
          {(() => {
            const allComments = hub.recent_comments ?? [];
            const groupCommentsCount = allComments.filter((c) => c.source_channel === "group_comment").length;
            const pageCommentsCount = allComments.filter((c) => c.source_channel === "page_comment").length;
            const filteredComments = allComments.filter((c) =>
              commentChannelFilter === "all" ? true : c.source_channel === commentChannelFilter
            );
            return (
              <div className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-[1_1_480px]">
                    <div className="community-pill-row gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                          autoReplyComments ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-800"
                        }`}
                      >
                        {autoReplyComments ? "🤖 Auto-Reply RAG: ĐANG BẬT" : "⏸️ Auto-Reply: ĐANG TẮT"}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">
                        Đã nhận {hub.stats.comments_received_count ?? 0} bình luận • Đã trả lời bằng RAG:{" "}
                        {hub.stats.comments_replied_count ?? 0}
                      </span>
                      {hub.group.last_group_comment_sync_at && (
                        <span className="text-[11px] text-slate-500">
                          Quét Group lúc:{" "}
                          {new Date(hub.group.last_group_comment_sync_at).toLocaleString("vi-VN", {
                            hour12: false,
                          })}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1.5 text-base font-bold text-slate-900">
                      Hộp thư Bình luận (Fanpage &amp; Group) &amp; Tự động Trả lời bằng RAG
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Hệ thống tự động quét bình luận thật từ <b>Facebook Group</b> (Playwright Group Bot) và{" "}
                      <b>Fanpage</b> (Meta Graph API), sinh câu trả lời chuẩn từ <b>Knowledge Context RAG</b> và tự
                      động đăng phản hồi công khai + gửi lời mời vào Group khi có nhu cầu phù hợp.
                    </p>
                  </div>
                  <div className="community-pill-row gap-2">
                    <button
                      type="button"
                      disabled={!canEdit || !!busyAction}
                      onClick={() => void handleScanComments()}
                      className="rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                    >
                      {busyAction === "scan_comments" ? "Đang quét bình luận…" : "💬 Quét & Trả lời Comment RAG"}
                    </button>
                  </div>
                </div>

                <div className="community-pill-row mt-3 gap-2">
                  {[
                    { id: "all" as const, label: `Tất cả (${allComments.length})` },
                    { id: "group_comment" as const, label: `👥 Bình luận Group (${groupCommentsCount})` },
                    { id: "page_comment" as const, label: `📘 Bình luận Fanpage (${pageCommentsCount})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setCommentChannelFilter(tab.id)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        commentChannelFilter === tab.id
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {filteredComments.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-600">
                    Chưa có bình luận mới từ kênh đang chọn. Bấm &ldquo;💬 Quét &amp; Trả lời Comment RAG&rdquo; để
                    đồng bộ bình luận mới nhất từ Group &amp; Fanpage.
                  </div>
                ) : (
                  <div
                    tabIndex={0}
                    role="region"
                    aria-labelledby="comments-table-caption"
                    className="community-table-wrapper mt-4 rounded-lg border border-slate-200"
                  >
                    <table className="community-table min-w-[780px] text-left text-xs">
                      <caption id="comments-table-caption" className="visually-hidden">
                        Danh sách bình luận gần đây trên Fanpage và Group cùng phản hồi RAG tự động
                      </caption>
                      <thead className="bg-slate-50 uppercase text-slate-500">
                        <tr>
                          <th scope="col" className="px-3 py-2.5">
                            Người bình luận &amp; Kênh
                          </th>
                          <th scope="col" className="px-3 py-2.5">
                            Nội dung bình luận thật
                          </th>
                          <th scope="col" className="px-3 py-2.5">
                            Phản hồi RAG tự động
                          </th>
                          <th scope="col" className="px-3 py-2.5">
                            Trạng thái &amp; Mời Group
                          </th>
                          <th scope="col" className="px-3 py-2.5">
                            Nguồn
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredComments.map((cmt) => {
                          const channelBadge =
                            cmt.source_channel === "group_comment"
                              ? "👥 Facebook Group"
                              : cmt.source_channel === "page_comment"
                                ? "📘 Facebook Fanpage"
                                : cmt.source_channel === "telegram"
                                  ? "✈️ Telegram"
                                  : "💌 Messenger";
                          const isReplied = cmt.status === "replied";
                          const isProcessing = cmt.status === "processing";
                          const isFailed = cmt.status === "failed";
                          return (
                            <tr key={cmt.id} className="border-t border-slate-100 align-top">
                              <th scope="row" className="px-3 py-3 font-normal">
                                <p className="font-bold text-slate-900">{cmt.author_name}</p>
                                <p className="mt-0.5 text-[11px] font-semibold text-slate-600">{channelBadge}</p>
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                  {new Date(cmt.received_at).toLocaleString("vi-VN", { hour12: false })}
                                </p>
                              </th>
                              <td data-label="Bình luận" className="max-w-xs px-3 py-3 text-slate-800">
                                <p className="leading-relaxed">{cmt.content}</p>
                              </td>
                              <td data-label="Phản hồi RAG" className="max-w-sm px-3 py-3 text-slate-700">
                                {cmt.rag_reply_text ? (
                                  <p className="rounded-md bg-emerald-50/70 p-2 leading-relaxed text-emerald-950">
                                    {cmt.rag_reply_text}
                                  </p>
                                ) : (
                                  <span className="text-slate-400">Đang chờ xử lý RAG…</span>
                                )}
                              </td>
                              <td data-label="Trạng thái" className="px-3 py-3">
                                <div className="flex flex-col items-start gap-1">
                                  <span
                                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                                      isReplied
                                        ? "bg-emerald-600 text-white"
                                        : isProcessing
                                          ? "bg-blue-100 text-blue-900"
                                          : isFailed
                                            ? "bg-rose-100 text-rose-900"
                                            : "bg-amber-100 text-amber-900"
                                    }`}
                                  >
                                    {isReplied
                                      ? "✓ Đã trả lời công khai"
                                      : isProcessing
                                        ? "⏳ Đang gửi phản hồi…"
                                        : isFailed
                                          ? "⚠ Lỗi gửi phản hồi"
                                          : "⏰ Đang xếp hàng RAG"}
                                  </span>
                                  {cmt.invite_sent && (
                                    <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-900">
                                      ✉️ Đã gửi lời mời vào Group
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td data-label="Nguồn" className="px-3 py-3">
                                {cmt.post_url ? (
                                  <a
                                    href={cmt.post_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-bold text-blue-700 hover:underline"
                                  >
                                    Xem bài ↗
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
                )}
              </div>
            );
          })()}

          {/* SAFE FACEBOOK GROUP INVITE LOGS */}
          <div className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-[1_1_480px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                      autoInviteEnabled ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-800"
                    }`}
                  >
                    {autoInviteEnabled ? "✉️ Tự động Mời Group: ĐANG BẬT" : "⏸️ Tự động Mời: ĐANG TẮT"}
                  </span>
                  <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-900">
                    Quota hôm nay: {hub.stats.invites_sent_today ?? 0} /{" "}
                    {hub.stats.daily_invite_limit ?? dailyInviteLimit} lời mời an toàn (Tổng:{" "}
                    {hub.stats.invites_sent_total ?? 0})
                  </span>
                </div>
                <h3 className="mt-1.5 text-base font-bold text-slate-900">
                  Nhật ký Gửi Lời mời Tham gia Group Chính thức (Không Tự ý Thêm Member)
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Mỗi lời mời đều là <b>lời mời hợp lệ trên Facebook</b> (nút Mời / Invite trong Group hoặc tin nhắn mời qua Messenger / Private Reply) để người dùng chủ động bấm Đồng ý tham gia, giới hạn an toàn{" "}
                  <b>{hub.stats.daily_invite_limit ?? dailyInviteLimit} lượt/ngày</b>.
                </p>
              </div>
              <button
                type="button"
                disabled={!canEdit || !!busyAction || !autoInviteEnabled}
                onClick={() => void handleSendSafeInvites()}
                className="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {busyAction === "send_safe_invites" ? "Đang gửi lời mời…" : "✉️ Gửi đợt Mời An toàn Ngay"}
              </button>
            </div>

            {(hub.recent_invite_logs ?? []).length === 0 ? (
              <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-600">
                Chưa có nhật ký lời mời nào được ghi nhận hôm nay. Bấm &ldquo;Gửi đợt Mời An toàn Ngay&rdquo; hoặc bật Auto-Invite để worker tự gửi theo quota ngày.
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="invites-table-caption"
                className="community-table-wrapper mt-4 rounded-lg border border-slate-200"
              >
                <table className="community-table min-w-[760px] text-left text-xs">
                  <caption id="invites-table-caption" className="visually-hidden">
                    Nhật ký lời mời tham gia Group Facebook an toàn theo ngày
                  </caption>
                  <thead className="bg-slate-50 uppercase text-slate-500">
                    <tr>
                      <th scope="col" className="px-3 py-2.5">
                        Người nhận lời mời
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Hình thức Lời mời
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Trạng thái
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Chi tiết thực thi
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        Thời gian
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(hub.recent_invite_logs ?? []).map((log) => (
                      <tr key={log.id} className="border-t border-slate-100 align-top">
                        <th scope="row" className="px-3 py-3 font-bold text-slate-900">
                          {log.display_name}
                        </th>
                        <td data-label="Hình thức" className="px-3 py-3">
                          <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-900">
                            {log.channel === "group_native_invite"
                              ? "👥 Nút Mời (Invite) Facebook Group"
                              : log.channel === "page_private_reply_invite"
                                ? "💬 Private Reply kèm Link Group"
                                : "💌 Messenger Link Mời Group"}
                          </span>
                        </td>
                        <td data-label="Trạng thái" className="px-3 py-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                              log.status === "invited"
                                ? "bg-emerald-600 text-white"
                                : log.status === "failed"
                                  ? "bg-rose-100 text-rose-900"
                                  : "bg-slate-200 text-slate-800"
                            }`}
                          >
                            {log.status === "invited" ? "✓ Đã gửi lời mời" : log.status}
                          </span>
                        </td>
                        <td data-label="Chi tiết" className="max-w-xs px-3 py-3 text-slate-700">
                          {log.detail || "Đã ghi nhận chống gửi trùng"}
                        </td>
                        <td data-label="Thời gian" className="px-3 py-3 text-slate-500">
                          {new Date(log.invited_at).toLocaleString("vi-VN", { hour12: false })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SEARXNG OUTSIDE DEMAND RADAR */}
          <div className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-[1_1_480px]">
                <h3 className="text-base font-bold text-slate-900">
                  Radar Tìm Người &amp; Chủ đề Có Nhu Cầu Ngoài Facebook (SearXNG)
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Quét các câu hỏi du lịch / thuê căn hộ / e-visa Đà Nẵng đang được hỏi công khai để Growth Lead và Community tạo bài giải đáp &amp; thu hút thành viên thật vào Group.
                </p>
              </div>
              <button
                type="button"
                disabled={!!busyAction}
                onClick={() => void handleDiscoverOpportunities()}
                className="rounded-lg border border-indigo-600 bg-indigo-50 px-3.5 py-2 text-xs font-bold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
              >
                {busyAction === "discover_opportunities"
                  ? "Đang tìm trên SearXNG…"
                  : "🔍 Quét Nhu cầu Cộng đồng (SearXNG)"}
              </button>
            </div>
            {searxngOpportunities.length > 0 && (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {searxngOpportunities.map((opp, idx) => (
                  <article key={`${opp.url}_${idx}`} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 ring-1 ring-slate-200">
                        {opp.domain || "web"}
                      </span>
                      <a
                        href={opp.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-bold text-blue-700 hover:underline"
                      >
                        Mở nguồn ↗
                      </a>
                    </div>
                    <h4 className="mt-1.5 font-bold text-slate-900">{opp.title}</h4>
                    {opp.snippet && <p className="mt-1 line-clamp-2 text-slate-600">{opp.snippet}</p>}
                  </article>
                ))}
              </div>
            )}
          </div>

          {/* AUTO-MATCH ENGINE RADAR */}
          <div className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-[1_1_480px]">
                <h3 className="text-base font-bold text-slate-900">
                  Người thật đã tương tác với Fanpage ({hub.stats.real_identified_people} người)
                </h3>
                <p className="mt-1 text-xs text-slate-600">
                  Danh sách tài khoản Facebook thật đã nhắn tin / bình luận trên Fanpage &ldquo;{hub.group.page_name}&rdquo;. Khi khách nhắn tin, <b>Community Agent</b> tự động trả lời dựa trên <b>bộ RAG có sẵn</b> và gợi ý bài viết + gửi link mời tham gia Group.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!canEdit || busyAction === "invite_all"}
                  onClick={() => handleSendMessengerInvite()}
                  className="rounded-lg bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {busyAction === "invite_all"
                    ? "Đang gửi Messenger…"
                    : "💌 Gửi link mời vào Group qua Messenger thật"}
                </button>
                <button
                  type="button"
                  disabled={!canEdit || busyAction === "scan"}
                  onClick={() => void handleScanMembers(false)}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {busyAction === "scan" ? "Đang quét…" : "🔍 Quét lại tin nhắn & bình luận thật trên Fanpage"}
                </button>
              </div>
            </div>

            {/* Quick Add / Simulate Trend Prospect */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!prospectName.trim() || !prospectSignal.trim()) return;
                void handleScanMembers(true);
              }}
              className="community-form mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1.6fr_auto] sm:items-end"
            >
              <div>
                <label htmlFor="prospect-name" className="block text-xs font-semibold text-slate-700">
                  Tên thành viên / khách tiềm năng
                </label>
                <input
                  id="prospect-name"
                  name="prospect_name"
                  type="text"
                  required
                  placeholder="VD: Nguyễn Minh Tuấn"
                  value={prospectName}
                  onChange={(e) => setProspectName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label htmlFor="prospect-signal" className="block text-xs font-semibold text-slate-700">
                  Tín hiệu / Nhu cầu quan tâm
                </label>
                <input
                  id="prospect-signal"
                  name="prospect_signal"
                  type="text"
                  required
                  placeholder="VD: Muốn tìm chỗ ở và lịch trình du lịch Đà Nẵng 2 tuần"
                  value={prospectSignal}
                  onChange={(e) => setProspectSignal(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={!canEdit || busyAction === "scan"}
                className="rounded-lg border border-blue-600 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                {busyAction === "scan" ? "Đang lưu…" : "+ Ghi chú khách tiềm năng (nhập tay)"}
              </button>
            </form>

            <div
              tabIndex={0}
              role="region"
              aria-labelledby="matched-members-caption"
              className="community-table-wrapper mt-4 rounded-lg border border-slate-200"
            >
              <table className="community-table min-w-[850px] text-left text-xs">
                <caption id="matched-members-caption" className="visually-hidden">
                  Danh sách người dùng thật đã tương tác và trạng thái mời tham gia Group
                </caption>
                <thead className="bg-slate-50 uppercase text-slate-500">
                  <tr>
                    <th scope="col" className="px-3 py-2.5">
                      Thành viên &amp; Kênh phát hiện
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Tín hiệu Nhu cầu / Câu hỏi thực tế
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Xu hướng &amp; Nhãn sở thích (Auto-Matched)
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Độ khớp
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Chiến dịch
                    </th>
                    <th scope="col" className="px-3 py-2.5">
                      Trạng thái thật
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {hub.matched_members.map((m) => (
                    <tr key={m.id} className="border-t border-slate-100 align-top">
                      <th scope="row" className="px-3 py-3 font-normal">
                        <p className="font-bold text-slate-900">{m.display_name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{m.channel}</p>
                      </th>
                      <td data-label="Tín hiệu nhu cầu" className="max-w-xs px-3 py-3 text-slate-700">
                        <p className="line-clamp-2">{m.matched_signal}</p>
                        {m.recommended_topic && (
                          <p className="mt-1 text-[11px] font-medium text-blue-700">
                            Gợi ý từ RAG: {m.recommended_topic}
                          </p>
                        )}
                      </td>
                      <td data-label="Xu hướng khớp" className="px-3 py-3">
                        <p className="font-semibold text-slate-800">{m.matched_trend}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(m.interest_tags ?? []).map((tag) => (
                            <span
                              key={tag}
                              className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td data-label="Độ khớp" className="px-3 py-3">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                          {m.affinity_score}%
                        </span>
                      </td>
                      <td data-label="Chiến dịch" className="px-3 py-3 font-semibold text-slate-700">
                        Tuần {m.campaign_week}
                      </td>
                      <td data-label="Trạng thái" className="px-3 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          <span
                            className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                              m.status === "invited_via_messenger"
                                ? "bg-emerald-600 text-white"
                                : m.status === "outside_24h_window"
                                  ? "bg-slate-200 text-slate-700"
                                  : m.status === "manual_prospect"
                                    ? "bg-slate-200 text-slate-700"
                                    : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {m.status === "invited_via_messenger"
                              ? "✓ Đã gửi link Group qua Messenger"
                              : m.status === "outside_24h_window"
                                ? "Quá 24h (Chờ khách nhắn mới)"
                                : m.status === "manual_prospect"
                                  ? "Nhập tay — chưa xác minh"
                                  : "Đã tương tác — sẵn sàng mời vào Group"}
                          </span>
                          {m.external_ref.startsWith("fb:") && (
                            <button
                              type="button"
                              disabled={!canEdit || busyAction === m.external_ref}
                              onClick={() => handleSendMessengerInvite(m.external_ref)}
                              className="rounded border border-emerald-700 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              {busyAction === m.external_ref ? "Đang gửi…" : "💌 Gửi link Group qua Messenger"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* TAB 4: COMMUNITY DISCUSSIONS (WITH DEDICATED NON-OVERLAPPING IMAGES) */}
      {activeTab === "discussions" && (
        <div className="min-w-0 max-w-full space-y-6">
          <div className="min-w-0 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
            <div className="min-w-0 space-y-4">
              <h3 className="text-lg font-bold text-slate-900">
                Bảng Thảo luận Cộng đồng (Sử dụng bộ 5 ảnh thảo luận riêng biệt — 0% trùng ảnh bài đăng)
              </h3>
              {hub.discussions.map((d) => (
                <article key={d.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-5 py-2.5">
                    <span className="rounded-full bg-blue-700 px-2.5 py-0.5 text-xs font-bold text-white">
                      {d.category}
                    </span>
                    <span className="text-xs font-semibold text-slate-600">
                      👥 {d.participants_count} thành viên tham gia thảo luận · {(d.replies ?? []).length} phản hồi
                    </span>
                  </div>
                  {d.image_url && (
                    <div className="aspect-[16/9] max-h-48 w-full overflow-hidden border-b border-slate-100 bg-slate-100">
                      <img src={d.image_url} alt={d.title} className="block h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="p-5">
                    <h4 className="text-base font-bold text-slate-900">{d.title}</h4>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Đăng bởi: {d.author_name} ({d.author_role})
                    </p>
                    <p className="mt-3 text-sm text-slate-700">{d.body}</p>
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs font-semibold text-amber-900">
                      💬 Câu hỏi thảo luận mở: {d.discussion_prompt}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopyAndOpenGroup(d.title, d.body, d.discussion_prompt)}
                        className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800"
                      >
                        📋 Copy nội dung & Mở Group Facebook để dán đăng ngay ↗
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit || !!busyAction}
                        onClick={() => handlePostGroupViaBot(d.title, d.body, d.discussion_prompt, d.image_url || undefined)}
                        className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                      >
                        {busyAction === d.title
                          ? "🤖 Bot đang tự động đăng..."
                          : "🤖 Đăng tự động vào Group qua Bot Quản trị viên"}
                      </button>
                    </div>
                    <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Bình luận tương tác giữa các thành viên ({d.replies.length})
                      </p>
                      {d.replies.map((r, idx) => (
                        <div key={idx} className="rounded-lg bg-slate-50 p-3 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{r.author}</span>
                            <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                              {r.role}
                            </span>
                          </div>
                          <p className="mt-1 text-slate-700">{r.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Create New Interactive Thread */}
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-base font-bold text-slate-900">
                Tạo Chủ đề Thảo luận mới cho Cộng đồng của Bạn
              </h3>
              <p id="discussion-form-help" className="mt-1 text-xs text-slate-600">
                Mỗi bài đăng trong &ldquo;{hub.group.name}&rdquo; đều có tình huống thực tế và câu hỏi mở để các thành viên bình luận chia sẻ kinh nghiệm cho nhau.
              </p>
              <form onSubmit={handleCreateDiscussion} className="community-form mt-4 space-y-3">
                <div>
                  <label htmlFor="discussion-title" className="block text-xs font-bold text-slate-800">
                    Tiêu đề thảo luận
                  </label>
                  <input
                    id="discussion-title"
                    name="discussion_title"
                    type="text"
                    required
                    value={discussionTitle}
                    onChange={(e) => setDiscussionTitle(e.target.value)}
                    placeholder="VD: Kinh nghiệm chọn khu vực thuê nhà yên tĩnh tại Đà Nẵng (Mỹ An vs Sơn Trà)?"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="discussion-body" className="block text-xs font-bold text-slate-800">
                    Nội dung chia sẻ mở đầu
                  </label>
                  <textarea
                    id="discussion-body"
                    name="discussion_body"
                    rows={3}
                    required
                    aria-describedby="discussion-form-help"
                    value={discussionBody}
                    onChange={(e) => setDiscussionBody(e.target.value)}
                    placeholder="Mô tả tình huống thực tế hoặc kinh nghiệm để mở đầu cuộc trò chuyện trong cộng đồng của bạn..."
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="discussion-prompt" className="block text-xs font-bold text-slate-800">
                    Câu hỏi mở mời các thành viên tương tác với nhau
                  </label>
                  <input
                    id="discussion-prompt"
                    name="discussion_prompt"
                    type="text"
                    value={discussionPrompt}
                    onChange={(e) => setDiscussionPrompt(e.target.value)}
                    placeholder="VD: Bạn đang ở khu vực nào và kinh nghiệm thực tế của bạn là gì?"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!canEdit || busyAction === "discussion"}
                  className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {busyAction === "discussion"
                    ? "Đang tạo chủ đề thảo luận…"
                    : "💬 Tạo Chủ đề Thảo luận vào Bảng Cộng đồng"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: MULTI-AGENT ARCHITECTURE & RAG AUTO-REPLY MECHANISM */}
      {activeTab === "architecture" && hub.architecture_info && (
        <div className="min-w-0 max-w-full space-y-6">
          <div className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">
              1. Việc phát triển & lên kế hoạch đăng bài thuộc về Agent nào? (Phối hợp 4 Agent chuyên biệt)
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Trong hệ thống <b>AI Growth OS</b>, việc lập kế hoạch và đăng bài <b>không phải do một mình Community Agent làm</b>, mà là sự phối hợp dây chuyền giữa <b>4 Agent</b>. Giao diện Community Hub này đóng vai trò là <b>Trung tâm Điều phối Cộng đồng</b> hiển thị toàn bộ kết quả liên kết của cả 4 Agent:
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {hub.architecture_info.agent_roles.map((role) => (
                <div key={role.agent_id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-bold text-blue-900">{role.agent_name}</h4>
                    <div className="flex flex-wrap gap-1">
                      {role.operations.map((op) => (
                        <code
                          key={op}
                          className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-900"
                        >
                          {op}
                        </code>
                      ))}
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-700">{role.responsibility}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-[1_1_480px]">
                <h3 className="text-lg font-bold text-slate-900">
                  2. Cơ chế Trả lời Tin nhắn của User: Tự động hóa dựa trên Bộ RAG có sẵn đã tích hợp
                </h3>
                <p className="mt-1 text-sm font-semibold text-emerald-800">
                  Chế độ vận hành: {hub.architecture_info.rag_reply_mechanism.mode}
                </p>
              </div>
              <div className="community-pill-row gap-2 text-xs font-bold">
                <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-emerald-900">
                  📚 {hub.architecture_info.rag_reply_mechanism.approved_sources_count} Tài liệu RAG đã duyệt
                </span>
                <span className="rounded-lg bg-blue-100 px-3 py-1.5 text-blue-900">
                  🧩 {hub.architecture_info.rag_reply_mechanism.total_chunks_count} Chunks ({hub.architecture_info.rag_reply_mechanism.embedded_chunks_count} Vector Embeddings)
                </span>
                <span className="rounded-lg bg-purple-100 px-3 py-1.5 text-purple-900">
                  💬 {hub.architecture_info.rag_reply_mechanism.grounded_replies_count} Phản hồi RAG đã tạo
                </span>
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              {hub.architecture_info.rag_reply_mechanism.steps.map((step, i) => (
                <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-800">
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
