"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";

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
  unique_topic_verified: boolean;
  unique_image_verified: boolean;
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
  };
  stats: {
    total_matched_members: number;
    real_group_members?: number | null;
    real_page_followers: number | null;
    real_page_likes: number | null;
    real_identified_people: number;
    manual_prospects: number;
    week1_target: number;
    week1_achieved: number;
    week2_target: number;
    week2_progress: number;
    week3_target?: number;
    week4_target?: number;
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
  };
  architecture_info?: {
    agent_roles: AgentRoleInfo[];
    rag_reply_mechanism: RagReplyMechanism;
  };
  weekly_campaigns: WeeklyCampaign[];
  matched_members: MatchedMember[];
  discussions: DiscussionThread[];
  calendar: {
    daily: DailyCalendarItem[];
    weekly: WeeklyCalendarItem[];
    monthly: MonthlyCalendarItem[];
  };
};

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
  const [activeTab, setActiveTab] = useState<"calendar" | "campaigns" | "discussions" | "architecture">("calendar");
  const [calendarView, setCalendarView] = useState<"daily" | "weekly" | "monthly">("daily");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string>("");
  const [bannerTone, setBannerTone] = useState<"success" | "warning" | "error">("success");
  const [bannerRecovery, setBannerRecovery] = useState<{
    title: string;
    body: string;
    prompt: string;
  } | null>(null);
  const [editingSettings, setEditingSettings] = useState(false);
  const editingSettingsRef = useRef(editingSettings);
  useEffect(() => {
    editingSettingsRef.current = editingSettings;
  }, [editingSettings]);

  // Settings & Custom Target form state
  const [customCommunityName, setCustomCommunityName] = useState("");
  const [customGroupUrl, setCustomGroupUrl] = useState("");
  const [customPublishTarget, setCustomPublishTarget] = useState<PublishTarget>("group");
  const [customGroupMemberCount, setCustomGroupMemberCount] = useState<number>(5);
  const [customWeek1Target, setCustomWeek1Target] = useState<number>(5);
  const [customWeek2Target, setCustomWeek2Target] = useState<number>(50);
  const [customWeek3Target, setCustomWeek3Target] = useState<number>(150);
  const [customWeek4Target, setCustomWeek4Target] = useState<number>(300);

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
    "all" | "published" | "scheduled" | "failed" | "fanpage_only" | "week1" | "week2" | "week3" | "week4"
  >("all");
  const [selectedDay, setSelectedDay] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedExactDate, setSelectedExactDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

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
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  const showBanner = useCallback(
    (
      tone: "success" | "warning" | "error",
      message: string,
      recovery: { title: string; body: string; prompt: string } | null = null
    ) => {
      setBannerTone(tone);
      setBannerMessage(message);
      setBannerRecovery(recovery);
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
    setCustomWeek2Target(res.stats.week2_target || 50);
    setCustomWeek3Target(res.stats.week3_target || res.weekly_campaigns?.[2]?.target_members || 150);
    setCustomWeek4Target(res.stats.week4_target || res.weekly_campaigns?.[3]?.target_members || 300);
  }, []);

  const syncFromServer = useCallback(
    async (options: { showErrorOnFailure?: boolean } = {}) => {
      try {
        const res = await apiRequest<HubResponse>(`/workspaces/${workspaceId}/community/hub`);
        setHub(res);
        syncFormFromHub(res, editingSettingsRef.current);
        const now = res.synced_at ? new Date(res.synced_at) : new Date();
        setLastSyncedDisplay(now.toLocaleTimeString("vi-VN", { hour12: false }));
      } catch (err) {
        if (options.showErrorOnFailure) {
          showBanner("error", (err as Error).message);
        }
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
    setBusyAction("save_settings");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{ data: HubResponse }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "update_settings",
          community_name: customCommunityName.trim(),
          group_url: customGroupUrl.trim(),
          publish_target: customPublishTarget,
          group_member_count: Number(customGroupMemberCount),
          week1_target: Number(customWeek1Target),
          week2_target: Number(customWeek2Target),
          week3_target: Number(customWeek3Target),
          week4_target: Number(customWeek4Target),
        },
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
        `Đã lưu cấu hình Cộng đồng ("${res.data.group.name}") — Đích đăng mặc định: ${targetLabel} • Mục tiêu 4 tuần: ${res.data.stats.week1_target} → ${res.data.stats.week2_target} → ${res.data.stats.week3_target ?? customWeek3Target} → ${res.data.stats.week4_target ?? customWeek4Target} • Thành viên Group: ${res.data.stats.real_group_members}.`
      );
      onUpdated?.();
    } catch (err) {
      showBanner("error", (err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleLaunchGroupBotLogin() {
    setBusyAction("login_group_bot");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{
        status: string;
        started: boolean;
        alreadyRunning?: boolean;
        message: string;
      }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: { action: "login_group_bot" },
      });
      showBanner(res.started ? "warning" : "error", res.message);
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
      if (res.isLoggedIn) {
        showBanner(
          "success",
          `✅ ${res.detail || "Phiên Quản trị viên Facebook Group Bot đang hoạt động và sẵn sàng tự động đăng bài vào Group!"}`
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

  async function handleScanMembers() {
    setBusyAction("scan");
    setBannerMessage("");
    setBannerRecovery(null);
    try {
      const res = await apiRequest<{ data: HubResponse }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "scan_members",
          ...(prospectName.trim() && prospectSignal.trim()
            ? { display_name: prospectName.trim(), signal: prospectSignal.trim(), campaign_week: 2 }
            : {}),
        },
      });
      setHub(res.data);
      setProspectName("");
      setProspectSignal("");
      setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      showBanner(
        "success",
        `Đã đồng bộ trực tiếp số thành viên Group (${res.data.stats.real_group_members} thành viên) & hộp thư Messenger thật trên Fanpage "${res.data.group.page_name}".`
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
    if (!chosenLocal) return;
    const scheduledIso = new Date(chosenLocal).toISOString();
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
      setLastSyncedDisplay(new Date().toLocaleTimeString("vi-VN", { hour12: false }));
      const formatted = new Date(res.result.scheduled_for).toLocaleString("vi-VN", { hour12: false });
      showBanner(
        "success",
        `⏰ Đã cập nhật giờ hẹn tự động đăng bài vào Cộng đồng: ${formatted}! Worker chạy ngầm sẽ tự động xử lý khi đến giờ này.`
      );
      onUpdated?.();
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
    if (dailyFilter === "week1" && item.week_number !== 1) return false;
    if (dailyFilter === "week2" && item.week_number !== 2) return false;
    if (dailyFilter === "week3" && item.week_number !== 3) return false;
    if (dailyFilter === "week4" && item.week_number !== 4) return false;

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

  const weekSummaryStats = [1, 2, 3, 4].map((wNum) => {
    const items = hub.calendar.daily.filter((i) => i.week_number === wNum);
    const pub = items.filter((i) => i.status === "published").length;
    const fail =
      targetMode === "fanpage"
        ? 0
        : items.filter((i) => i.status !== "published" && i.group_status === "failed").length;
    const sched = items.length - pub - fail;
    const dateRange =
      wNum === 1
        ? "02/11/2026 (00:00) – 08/11/2026 (23:59)"
        : wNum === 2
          ? "09/11/2026 (00:00) – 15/11/2026 (23:59)"
          : wNum === 3
            ? "16/11/2026 (00:00) – 22/11/2026 (23:59)"
            : "23/11/2026 (00:00) – 30/11/2026 (23:59)";
    return {
      weekNum: wNum,
      id: `week${wNum}` as "week1" | "week2" | "week3" | "week4",
      total: items.length,
      pub,
      fail,
      sched,
      dateRange,
    };
  });

  return (
    <section className="space-y-6 rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-blue-50/40 to-white p-5 sm:p-6 shadow-sm">
      {/* KHU VỰC 1: HEADER KHOA HỌC — TÁCH BẠCH ĐỊNH DANH, GROUP BOT, THANH CÔNG CỤ & CHỈ SỐ KPI */}
      <div className="space-y-4 border-b border-blue-100 pb-5">
        {/* Hàng 1.1: Định danh Cộng đồng, Đích đăng & Trạng thái Group Bot */}
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-blue-700 px-3 py-1 text-xs font-bold tracking-wide text-white">
                {targetMode === "fanpage"
                  ? "📘 Đích đăng: Chỉ Fanpage cũ"
                  : targetMode === "both"
                    ? "👥+📘 Đích đăng: Group Cộng đồng & Fanpage"
                    : "👥 Đích đăng chính: Facebook Group Cộng đồng"}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
                  groupBotSession?.isLoggedIn
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-amber-300 bg-amber-50 text-amber-950"
                }`}
              >
                <span aria-hidden="true">{groupBotSession?.isLoggedIn ? "🟢" : "🟡"}</span>
                {groupBotSession?.isLoggedIn
                  ? `Group Bot: Đã sẵn sàng (${groupBotSession.sessionSource === "cookie" ? "Cookie" : "Phiên Edge"})`
                  : "Group Bot: Chưa đăng nhập phiên Edge"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-bold text-emerald-800">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
                {syncingRealtime
                  ? "Đang tự động đồng bộ Facebook…"
                  : `Cập nhật Realtime (15s) • Lúc ${lastSyncedDisplay || "vừa xong"}`}
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{hub.group.name}</h2>
            <p className="max-w-4xl text-sm leading-relaxed text-slate-600">{hub.group.positioning}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={hub.group.group_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-800"
            >
              👥 Mở Group Cộng đồng ↗
            </a>
            <a
              href={hub.group.page_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg border border-blue-300 bg-white px-3.5 py-2 text-xs font-bold text-blue-800 hover:bg-blue-50"
            >
              📘 Mở Fanpage (Messenger/RAG): {hub.group.page_name} ↗
            </a>
            <button
              type="button"
              onClick={() => void fetchHub({ silent: false })}
              className="inline-flex items-center rounded-lg border border-emerald-600 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100"
            >
              🔄 Đồng bộ Ngay
            </button>
          </div>
        </div>

        {/* Hàng 1.2: Thanh Công Cụ Thao Tác Nhanh & Điều phối Group Bot */}
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Thao tác điều hành:
              </span>
              <button
                type="button"
                aria-expanded={editingSettings}
                aria-controls="community-settings-panel"
                onClick={() => setEditingSettings((v) => !v)}
                className="rounded-lg border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-100"
              >
                🎯 Cấu hình Group, Đích đăng & Mục tiêu Tuần
              </button>
              <button
                type="button"
                disabled={!canEdit || !!busyAction}
                onClick={() => void handlePublishFreshPost()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busyAction === "publish_fresh"
                  ? "Đang tạo & đăng bài mới…"
                  : targetMode === "fanpage"
                    ? "⚡ Đăng ngay 1 bài mới lên Fanpage & Web"
                    : targetMode === "both"
                      ? "⚡ Đăng ngay 1 bài mới lên Group & Fanpage"
                      : "⚡ Đăng ngay 1 bài mới lên Group Cộng đồng"}
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
                className="rounded-lg border border-purple-600 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-800 hover:bg-purple-100 disabled:opacity-50"
              >
                🤖 Đăng thảo luận vào Group qua Bot
              </button>
            </div>

            <button
              type="button"
              onClick={() => setEditingSettings(true)}
              className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
            >
              ✏️ Mục tiêu 4 Tuần: {hub.stats.week1_target} → {hub.stats.week2_target} → {hub.stats.week3_target ?? 150} → {hub.stats.week4_target ?? 300}
            </button>
          </div>

          {/* Hàng Group Bot 1-Click Login & Session Verification */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
            <p className="text-slate-600">
              <b className="text-slate-900">Phiên đăng tự động Group Bot:</b>{" "}
              {groupBotSession?.isLoggedIn
                ? "Đã lưu phiên Quản trị viên — Worker 24/7 và nút Đăng Group dùng trực tiếp phiên này (không phụ thuộc key Fanpage)."
                : "Chưa đăng nhập phiên Quản trị viên trên Edge. Đăng bài vào Group Cộng đồng hoạt động ĐỘC LẬP với token Fanpage."}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!canEdit || !!busyAction}
                onClick={() => void handleLaunchGroupBotLogin()}
                className="rounded-lg border border-indigo-600 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
              >
                {busyAction === "login_group_bot"
                  ? "Đang mở Microsoft Edge…"
                  : "🌐 Mở Edge Đăng nhập Group Bot (1 lần)"}
              </button>
              <button
                type="button"
                disabled={!!busyAction}
                onClick={() => void handleVerifyGroupBotSession()}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {busyAction === "verify_group_bot"
                  ? "Đang kiểm tra phiên…"
                  : "🔍 Kiểm tra phiên Group Bot"}
              </button>
            </div>
          </div>
        </div>

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

            <div className="border-t border-slate-200 pt-3">
              <p className="text-xs font-bold text-slate-900">
                3. Tùy chỉnh Mục tiêu Thành viên các Tuần & Số Thành viên hiện tại trong Group (Không fix cứng)
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Bạn có thể tự đặt mục tiêu KPI thành viên cho từng tuần và cập nhật số lượng thành viên hiện tại của Group Facebook.
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
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
                    onChange={(e) => setCustomWeek1Target(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
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
                    onChange={(e) => setCustomWeek2Target(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
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
                    onChange={(e) => setCustomWeek3Target(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
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
                    onChange={(e) => setCustomWeek4Target(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
                  />
                </div>
              </div>
            </div>

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

        {/* Hàng 1.3: 4 Thẻ Chỉ số KPI Thực tế (Grid 4 cột chuẩn khoa học) */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-emerald-800">Tuần 1 (02/11 – 08/11/2026)</p>
              <span className="rounded bg-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-950">
                ✓ Hoàn thành
              </span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-emerald-900">
              {hub.stats.week1_achieved}/{hub.stats.week1_target} thành viên
            </p>
            <p className="mt-1 text-[11px] font-medium text-emerald-800">
              Group: {hub.stats.real_group_members ?? hub.stats.week1_achieved} TV • Page: {hub.stats.real_page_followers ?? 0} theo dõi
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-blue-800">Tuần 2 (09/11 – 15/11/2026)</p>
              <span className="rounded bg-blue-200/80 px-2 py-0.5 text-[10px] font-bold text-blue-950">
                Đang chạy
              </span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-blue-900">
              {hub.stats.week2_progress}/{hub.stats.week2_target} thành viên
            </p>
            <p className="mt-1 text-[11px] font-medium text-blue-800">
              {hub.stats.real_identified_people} khách hàng thật đã nhắn tin qua Messenger
            </p>
          </div>

          <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-purple-800">
                {targetMode === "fanpage" ? "Trạng thái Xuất bản Fanpage" : "Trạng thái Đăng Group Cộng đồng"}
              </p>
              <span className="rounded bg-purple-200/80 px-2 py-0.5 text-[10px] font-bold text-purple-950">
                {targetMode === "fanpage" ? "Fanpage" : "Group Bot 24/7"}
              </span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-purple-900">
              {targetMode === "fanpage"
                ? `${publishedCount} Đã đăng Page • ${scheduledFilterCount} Hẹn giờ`
                : `${publishedGroupCount} Đã đăng Group • ${scheduledGroupCount} Hẹn Group`}
            </p>
            <p className="mt-1 text-[11px] font-medium text-purple-800">
              {targetMode === "fanpage"
                ? `Tổng cộng ${hub.calendar.daily.length} bài có ngày tháng năm & giờ cụ thể`
                : `${failedGroupCount > 0 ? `⚠ ${failedGroupCount} bài lỗi Group • ` : ""}Fanpage cũ đã đăng trước: ${publishedFanpageCount}/${hub.calendar.daily.length}`}
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-amber-900">Kho Chủ đề & Ảnh Chuẩn</p>
              <span className="rounded bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                0% Trùng lặp
              </span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-amber-900">
              {hub.stats.total_approved_playbook_topics} chủ đề · {hub.stats.approved_unique_images} ảnh
            </p>
            <p className="mt-1 text-[11px] font-medium text-amber-800">
              Mỗi bài viết gắn 1 ảnh độc nhất & bộ câu hỏi mở
            </p>
          </div>
        </div>

        {/* Hàng 1.4: Sơ đồ Phối hợp 4 Agent (Trình bày dạng quy trình 4 bước rõ ràng) */}
        <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-slate-200 bg-slate-50/90 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <span className="font-bold text-blue-800">1. Growth Lead Agent</span>
            <p className="mt-0.5 text-[11px] text-slate-600">
              Phân lịch cụ thể ngày/tháng/năm & khung giờ đăng cho 4 tuần.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <span className="font-bold text-emerald-800">2. SEO Worker Agent</span>
            <p className="mt-0.5 text-[11px] text-slate-600">
              Soạn bài chuẩn RAG từ nguồn tri thức đã duyệt và xuất bản lên Web.
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <span className="font-bold text-purple-800">3. Content Agent</span>
            <p className="mt-0.5 text-[11px] text-slate-600">
              Chọn 1 ảnh độc nhất & đẩy lịch tự động sang Group Cộng đồng (hoặc Fanpage nếu bật).
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-2.5">
            <span className="font-bold text-amber-800">4. Community Agent</span>
            <p className="mt-0.5 text-[11px] text-slate-600">
              Đăng Group Bot, trả lời tin nhắn Messenger bằng RAG & gửi link mời vào Nhóm.
            </p>
          </div>
        </div>
      </div>

      {bannerMessage && (
        <div
          role={bannerTone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`space-y-3 rounded-xl border p-4 text-sm font-medium ${
            bannerTone === "error"
              ? "border-rose-300 bg-rose-50 text-rose-950"
              : bannerTone === "warning"
                ? "border-amber-300 bg-amber-50 text-amber-950"
                : "border-emerald-300 bg-emerald-50 text-emerald-900"
          }`}
        >
          <p>{bannerMessage}</p>
          {bannerRecovery && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
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
                📋 Copy & Mở Group để dán tay ↗
              </button>
              <button
                type="button"
                onClick={() => {
                  setBannerMessage("");
                  setBannerRecovery(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Đóng
              </button>
            </div>
          )}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${activeTab === "calendar"
              ? "bg-blue-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
        >
          1. Lịch Đăng bài Cụ thể theo Ngày / Tháng / Năm & Tuần ({hub.calendar.daily.length} bài)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("campaigns")}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${activeTab === "campaigns"
              ? "bg-blue-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
        >
          2. Chiến dịch Thu hút Thành viên ({hub.stats.week1_target} → {hub.stats.week2_target} → {hub.stats.week3_target ?? 150} → {hub.stats.week4_target ?? 300})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("discussions")}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${activeTab === "discussions"
              ? "bg-blue-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
        >
          3. Thảo luận Cộng đồng ({hub.discussions.length} Chủ đề)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("architecture")}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${activeTab === "architecture"
              ? "bg-blue-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
        >
          4. Phân vai 4 Agent & Cơ chế Trả lời Tin nhắn bằng RAG
        </button>
      </div>

      {/* TAB 1: CONCRETE DAILY / WEEKLY / MONTHLY EDITORIAL CALENDAR */}
      {activeTab === "calendar" && (
        <div className="space-y-5">
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Lịch Xuất Bản & Quản Lý Trạng Thái Bài Viết Theo Ngày • Tháng • Năm • Tuần Cụ Thể
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Toàn bộ <b>{hub.calendar.daily.length} bài viết</b> đều có mốc <b>ngày/tháng/năm & giờ:phút cụ thể</b>:{" "}
                <span className="font-bold text-emerald-700">
                  ✓ {publishedCount} bài đã đăng {targetMode === "fanpage" ? "Fanpage" : "vào Group"}
                </span>{" "}
                ·{" "}
                <span className="font-bold text-indigo-700">
                  ⏰ {scheduledFilterCount} bài đang hẹn giờ (09:00 sáng)
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCalendarView("daily")}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${calendarView === "daily" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
              >
                📅 Xem & Lọc Theo Ngày / Tháng / Năm ({hub.calendar.daily.length} Bài)
              </button>
              <button
                type="button"
                onClick={() => setCalendarView("weekly")}
                className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${calendarView === "weekly" ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
              >
                🗓️ Xem Theo 4 Tuần Cụ Thể (02/11 – 30/11/2026)
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
              <div className="flex flex-col justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/70 p-4 lg:flex-row lg:items-center">
                <div className="space-y-1">
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
                  className="shrink-0 rounded-lg bg-indigo-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-50"
                >
                  {busyAction === "schedule_all"
                    ? "Đang đồng bộ lịch…"
                    : targetMode === "fanpage"
                      ? "🗓️ Đồng bộ & Lên lịch Fanpage (09:00 sáng)"
                      : "🗓️ Đồng bộ & Lên lịch Group Cộng đồng (09:00 sáng)"}
                </button>
              </div>

              {/* BẢNG ĐIỀU KHIỂN PHÂN LỌC KHOA HỌC: CHỌN NGÀY / THÁNG / NĂM / TUẦN & TRẠNG THÁI */}
              <div className="community-form space-y-4 rounded-xl border-2 border-slate-200 bg-white p-4 shadow-sm">
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
                      <button
                        type="button"
                        onClick={() => {
                          setDailyFilter("all");
                          setSelectedYear("2026");
                          setSelectedMonth("11");
                          setSelectedDay("06");
                          setSelectedExactDate("2026-11-06");
                          setDailyPage(1);
                        }}
                        className="rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 hover:bg-blue-100"
                      >
                        📅 Ngày 06/11/2026 (Bài Fanpage cũ)
                      </button>
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
                        <option value="2026">Năm 2026 ({yearCountsMap.get("2026") ?? hub.calendar.daily.length} bài)</option>
                        <option value="2027">Năm 2027 ({yearCountsMap.get("2027") ?? 0} bài)</option>
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
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {weekSummaryStats.map((w) => {
                        const isSelected = dailyFilter === w.id;
                        return (
                          <button
                            key={w.id}
                            type="button"
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
                                    : w.fail > 0
                                      ? "bg-rose-100 text-rose-900"
                                      : w.pub === w.total
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-indigo-100 text-indigo-800"
                                  }`}
                              >
                                {w.pub > 0 ? `✓ ${w.pub} Đã đăng` : ""}
                                {w.pub > 0 && (w.fail > 0 || w.sched > 0) ? " • " : ""}
                                {w.fail > 0 ? `⚠ ${w.fail} Lỗi` : ""}
                                {w.fail > 0 && w.sched > 0 ? " • " : ""}
                                {w.sched > 0 ? `⏰ ${w.sched} Hẹn giờ` : ""}
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

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
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
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-800"
                      >
                        <option value={6}>6 bài / trang</option>
                        <option value={9}>9 bài / trang</option>
                        <option value={12}>12 bài / trang</option>
                        <option value={27}>Tất cả {hub.calendar.daily.length} bài</option>
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
              </div>

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
                          <div className="h-44 w-full overflow-hidden border-b border-slate-100 bg-slate-100">
                            <img
                              src={item.image_url}
                              alt={item.image_attribution}
                              className="h-full w-full object-cover"
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
                                <span className="inline-flex items-center rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-bold leading-normal text-purple-800">
                                  ✓ Ảnh độc nhất #{item.day_index}
                                </span>
                              </div>
                            </div>

                            {item.concrete_action && (
                              <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-700">
                                🎯 <b>Chi tiết trạng thái & hành động:</b> {item.concrete_action}
                              </div>
                            )}

                            <p className="text-xs leading-relaxed text-slate-600">
                              💬 {item.community_discussion_hook}
                            </p>
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
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleCopyAndOpenGroup(
                                      item.topic_title,
                                      item.concrete_action || item.target_trend,
                                      item.community_discussion_hook
                                    )
                                  }
                                  className="rounded-lg border border-blue-600 bg-white px-2.5 py-1.5 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                                >
                                  📋 Copy & Mở Group ↗
                                </button>
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
                                        body: item.concrete_action || item.target_trend,
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
                                        item.concrete_action || item.target_trend,
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
                const weekFilterId = `week${w.week_number}` as "week1" | "week2" | "week3" | "week4";

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
                        {weekPosts.map((post) => {
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
                        })}
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

      {/* TAB 2: WEEKLY MEMBER ACQUISITION CAMPAIGNS & AUTO-MATCHING */}
      {activeTab === "campaigns" && (
        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-slate-900">
                Lộ trình Chiến dịch Thu hút Thành viên theo Tuần Cụ thể (02/11/2026 – 30/11/2026)
              </h3>
              <button
                type="button"
                onClick={() => setEditingSettings(true)}
                className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-800 hover:bg-blue-100"
              >
                🎯 Tùy chỉnh Mục tiêu các Tuần
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Mỗi tuần đều gắn với mốc ngày tháng thực tế và chỉ tiêu rõ ràng (Tuần 1 [02/11–08/11]: {hub.stats.week1_target} thành viên → Tuần 2 [09/11–15/11]: {hub.stats.week2_target} thành viên → Tuần 3 [16/11–22/11]: {hub.stats.week3_target ?? 150} → Tuần 4 [23/11–30/11]: {hub.stats.week4_target ?? 300}).
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {hub.weekly_campaigns.map((c) => {
                const pct = Math.min(100, Math.round((c.current_members / c.target_members) * 100));
                return (
                  <div
                    key={c.week}
                    className={`rounded-xl border p-4 ${c.status === "completed_target"
                        ? "border-emerald-300 bg-emerald-50/40"
                        : c.status === "active_campaign"
                          ? "border-blue-300 bg-blue-50/40 ring-2 ring-blue-200"
                          : "border-slate-200 bg-white"
                      }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                        {c.date_range ? `Tuần ${c.week}: ${c.date_range}` : `Tuần ${c.week}`}
                      </span>
                      <span className="text-xs font-bold text-blue-800">
                        Mục tiêu: {c.target_members} người
                      </span>
                    </div>
                    <h4 className="mt-2 text-sm font-bold text-slate-900">{c.title}</h4>
                    <p className="mt-1 text-xs font-medium text-slate-600">Chủ đề trọng tâm: {c.theme}</p>
                    {c.responsible_agents && (
                      <p className="mt-1 text-[11px] font-semibold text-purple-800">
                        🤖 {c.responsible_agents}
                      </p>
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
                          className="rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 ring-1 ring-slate-200"
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

          {/* AUTO-MATCH ENGINE RADAR */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
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
                  onClick={handleScanMembers}
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
                void handleScanMembers();
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

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-xs">
                <thead className="bg-slate-50 uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Thành viên & Kênh phát hiện</th>
                    <th className="px-3 py-2.5">Tín hiệu Nhu cầu / Câu hỏi thực tế</th>
                    <th className="px-3 py-2.5">Xu hướng & Nhãn sở thích (Auto-Matched)</th>
                    <th className="px-3 py-2.5">Độ khớp</th>
                    <th className="px-3 py-2.5">Chiến dịch</th>
                    <th className="px-3 py-2.5">Trạng thái thật</th>
                  </tr>
                </thead>
                <tbody>
                  {hub.matched_members.map((m) => (
                    <tr key={m.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-3">
                        <p className="font-bold text-slate-900">{m.display_name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{m.channel}</p>
                      </td>
                      <td className="max-w-xs px-3 py-3 text-slate-700">
                        <p className="line-clamp-2">{m.matched_signal}</p>
                        {m.recommended_topic && (
                          <p className="mt-1 text-[11px] font-medium text-blue-700">
                            Gợi ý từ RAG: {m.recommended_topic}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-3">
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
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                          {m.affinity_score}%
                        </span>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-700">Tuần {m.campaign_week}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col items-start gap-1.5">
                          <span
                            className={`rounded-md px-2 py-1 text-[11px] font-bold ${m.status === "invited_via_messenger"
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
      )}

      {/* TAB 3: COMMUNITY DISCUSSIONS (WITH DEDICATED NON-OVERLAPPING IMAGES) */}
      {activeTab === "discussions" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
            <div className="space-y-4">
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
                    <div className="h-40 w-full overflow-hidden border-b border-slate-100 bg-slate-100">
                      <img src={d.image_url} alt={d.title} className="h-full w-full object-cover" />
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

      {/* TAB 4: MULTI-AGENT ARCHITECTURE & RAG AUTO-REPLY MECHANISM */}
      {activeTab === "architecture" && hub.architecture_info && (
        <div className="space-y-6">
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  2. Cơ chế Trả lời Tin nhắn của User: Tự động hóa dựa trên Bộ RAG có sẵn đã tích hợp
                </h3>
                <p className="mt-1 text-sm font-semibold text-emerald-800">
                  Chế độ vận hành: {hub.architecture_info.rag_reply_mechanism.mode}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
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
    </section>
  );
}
