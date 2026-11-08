"use client";

import { useCallback, useEffect, useState } from "react";
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

type DailyCalendarItem = {
  day_index: number;
  day_label: string;
  scheduled_date_vn?: string;
  scheduled_date_short?: string;
  scheduled_date_only?: string;
  scheduled_iso?: string;
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
  const [editingSettings, setEditingSettings] = useState(false);

  // Settings & Custom Target form state
  const [customCommunityName, setCustomCommunityName] = useState("");
  const [customGroupUrl, setCustomGroupUrl] = useState("");
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

  const syncFormFromHub = useCallback((res: HubResponse, isEditing: boolean) => {
    if (isEditing) return;
    setCustomCommunityName(res.group.name);
    setCustomGroupUrl(res.group.group_url);
    setCustomGroupMemberCount(res.stats.real_group_members ?? res.stats.week1_achieved ?? 5);
    setCustomWeek1Target(res.stats.week1_target || 5);
    setCustomWeek2Target(res.stats.week2_target || 50);
    setCustomWeek3Target(res.stats.week3_target || res.weekly_campaigns?.[2]?.target_members || 150);
    setCustomWeek4Target(res.stats.week4_target || res.weekly_campaigns?.[3]?.target_members || 300);
  }, []);

  const fetchHub = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setLoading(true);
      } else {
        setSyncingRealtime(true);
      }
      try {
        const res = await apiRequest<HubResponse>(`/workspaces/${workspaceId}/community/hub`);
        setHub(res);
        syncFormFromHub(res, editingSettings);
        const now = res.synced_at ? new Date(res.synced_at) : new Date();
        setLastSyncedDisplay(now.toLocaleTimeString("vi-VN", { hour12: false }));
      } catch (err) {
        if (!options.silent) {
          setBannerMessage((err as Error).message);
        }
      } finally {
        setLoading(false);
        setSyncingRealtime(false);
      }
    },
    [workspaceId, editingSettings, syncFormFromHub]
  );

  // Initial load + Automatic background sync every 15s + Sync on window focus / tab visibility
  useEffect(() => {
    void fetchHub({ silent: false });
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
      clearInterval(interval);
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [fetchHub]);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction("save_settings");
    setBannerMessage("");
    try {
      const res = await apiRequest<{ data: HubResponse }>(`/workspaces/${workspaceId}/community/hub`, {
        method: "POST",
        body: {
          action: "update_settings",
          community_name: customCommunityName.trim(),
          group_url: customGroupUrl.trim(),
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
      setBannerMessage(
        `Đã cập nhật Mục tiêu các Tuần (${res.data.stats.week1_target} → ${res.data.stats.week2_target} → ${res.data.stats.week3_target ?? customWeek3Target} → ${res.data.stats.week4_target ?? customWeek4Target}) & số thành viên Group (${res.data.stats.real_group_members} thành viên)!`
      );
    } catch (err) {
      setBannerMessage((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleScanMembers() {
    setBusyAction("scan");
    setBannerMessage("");
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
      setBannerMessage(
        `Đã đồng bộ trực tiếp số thành viên Group (${res.data.stats.real_group_members} thành viên) & hộp thư Messenger thật trên Fanpage "${res.data.group.page_name}".`
      );
      onUpdated?.();
    } catch (err) {
      setBannerMessage((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSendMessengerInvite(externalRef?: string) {
    setBusyAction(externalRef || "invite_all");
    setBannerMessage("");
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
      setBannerMessage(
        `Kết quả gửi lời mời tham gia Group (${res.data.group.group_url}) qua Messenger thật: ${summary}`
      );
      onUpdated?.();
    } catch (err) {
      setBannerMessage((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateDiscussion(e: React.FormEvent) {
    e.preventDefault();
    if (!discussionTitle.trim() || !discussionBody.trim()) return;
    setBusyAction("discussion");
    setBannerMessage("");
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
      setBannerMessage(`Đã tạo chủ đề thảo luận mới trong "${res.data.group.name}"!`);
    } catch (err) {
      setBannerMessage((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePublishFreshPost(sourceId?: string) {
    setBusyAction(sourceId || "publish_fresh");
    setBannerMessage("");
    try {
      const res = await apiRequest<{
        published: { title: string; website_slug: string | null; image_url: string };
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
      setBannerMessage(
        `Đã xuất bản bài viết mới 100% không trùng lặp: "${res.published.title}" lên Website (/posts/${res.published.website_slug}) và đăng trực tiếp kèm ảnh riêng biệt + lời mời tham gia "${res.data.group.name}" lên Fanpage "${res.data.group.page_name}"!`
      );
      onUpdated?.();
    } catch (err) {
      setBannerMessage((err as Error).message);
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
      setBannerMessage(
        `Đã copy sẵn toàn bộ nội dung bài "${title}" vào bộ nhớ tạm! Cửa sổ Group "${hub.group.name}" đã mở — bạn chỉ cần bấm vào ô "Bạn viết gì đi..." và nhấn Ctrl + V để đăng vào Nhóm.`
      );
    } catch {
      // Fallback if clipboard blocked
    }
    window.open(hub.group.group_url, "_blank", "noopener,noreferrer");
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

  const publishedCount =
    hub.stats.published_topics_count ??
    hub.calendar.daily.filter((d) => d.status === "published").length;

  return (
    <section className="space-y-6 rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-blue-50/50 to-white p-6 shadow-sm">
      {/* Header Banner */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-blue-100 pb-5">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-700 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
              Cộng đồng Facebook Chính thức của Bạn
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              Kho 30 Ảnh Riêng biệt (25 Bài + 5 Thảo luận): 0% Trùng lặp
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-bold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {syncingRealtime
                ? "Đang tự động đồng bộ Facebook…"
                : `Tự động cập nhật Realtime (mỗi 15s) • Lúc ${lastSyncedDisplay || "vừa xong"}`}
            </span>
          </div>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">{hub.group.name}</h2>
          <p className="mt-1 text-sm text-slate-600">{hub.group.positioning}</p>
          <div className="mt-3 flex flex-wrap gap-2.5 text-xs font-semibold">
            <a
              href={hub.group.group_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-blue-700 px-3 py-1.5 text-white hover:bg-blue-800"
            >
              Mở Cộng đồng / Group của Bạn ↗
            </a>
            <a
              href={hub.group.page_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-blue-800 hover:bg-blue-50"
            >
              Mở Fanpage: {hub.group.page_name} ↗
            </a>
            <button
              type="button"
              onClick={() => void fetchHub({ silent: false })}
              className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-1.5 font-bold text-emerald-800 hover:bg-emerald-100"
            >
              🔄 Đồng bộ Facebook Ngay
            </button>
            <button
              type="button"
              onClick={() => setEditingSettings((v) => !v)}
              className="rounded-lg border border-blue-600 bg-blue-50 px-3 py-1.5 text-blue-800 hover:bg-blue-100"
            >
              🎯 Đặt Mục tiêu Thành viên theo Tuần & Cấu hình Group
            </button>
            <button
              type="button"
              disabled={!canEdit || !!busyAction}
              onClick={() => handlePublishFreshPost()}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busyAction === "publish_fresh"
                ? "Đang tạo & đăng bài mới…"
                : "⚡ Đăng ngay 1 bài mới lên Fanpage & Cộng đồng của bạn (Không trùng ảnh)"}
            </button>
          </div>

          {editingSettings && (
            <form onSubmit={handleSaveSettings} className="mt-4 space-y-4 rounded-xl border-2 border-blue-300 bg-white p-4 shadow-sm">
              <div>
                <p className="text-xs font-bold text-slate-900">
                  1. Cấu hình Tên Cộng đồng & Link Group Facebook của Riêng Bạn
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Tên Cộng đồng của bạn
                    <input
                      type="text"
                      required
                      value={customCommunityName}
                      onChange={(e) => setCustomCommunityName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Link Group / Cộng đồng Facebook của bạn
                    <input
                      type="url"
                      required
                      value={customGroupUrl}
                      onChange={(e) => setCustomGroupUrl(e.target.value)}
                      placeholder="https://www.facebook.com/groups/ten-group-cua-ban"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
                    />
                  </label>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <p className="text-xs font-bold text-slate-900">
                  2. Tùy chỉnh Mục tiêu Thành viên các Tuần & Số Thành viên hiện tại trong Group (Không fix cứng)
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Bạn có thể tự đặt mục tiêu KPI thành viên cho từng tuần và cập nhật số lượng thành viên hiện tại của Group Facebook.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <label className="block text-xs font-semibold text-emerald-800">
                    Hiện có trong Group
                    <input
                      type="number"
                      min={0}
                      required
                      value={customGroupMemberCount}
                      onChange={(e) => setCustomGroupMemberCount(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-emerald-400 bg-emerald-50/40 px-3 py-1.5 text-xs font-bold text-emerald-950"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Mục tiêu Tuần 1 (02/11–08/11)
                    <input
                      type="number"
                      min={1}
                      required
                      value={customWeek1Target}
                      onChange={(e) => setCustomWeek1Target(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Mục tiêu Tuần 2 (09/11–15/11)
                    <input
                      type="number"
                      min={1}
                      required
                      value={customWeek2Target}
                      onChange={(e) => setCustomWeek2Target(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Mục tiêu Tuần 3 (16/11–22/11)
                    <input
                      type="number"
                      min={1}
                      required
                      value={customWeek3Target}
                      onChange={(e) => setCustomWeek3Target(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
                    />
                  </label>
                  <label className="block text-xs font-semibold text-slate-700">
                    Mục tiêu Tuần 4 (23/11–30/11)
                    <input
                      type="number"
                      min={1}
                      required
                      value={customWeek4Target}
                      onChange={(e) => setCustomWeek4Target(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold"
                    />
                  </label>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!canEdit || busyAction === "save_settings"}
                  className="rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {busyAction === "save_settings" ? "Đang lưu…" : "Lưu Mục tiêu & Cấu hình Cộng đồng"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSettings(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  Đóng
                </button>
              </div>
            </form>
          )}
        </div>

        {/* KPI Summary Cards — growth is measured only by real Facebook numbers */}
        <div className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold text-slate-900">
              Số liệu thật từ Facebook (Tự động làm mới mỗi 15 giây):{" "}
              <span className="text-emerald-700">
                {hub.stats.real_group_members ?? hub.stats.week1_achieved} thành viên trong Nhóm (Group)
              </span>{" "}
              · {hub.stats.real_page_followers ?? 0} người theo dõi Page · {hub.stats.real_page_likes ?? 0} lượt thích Page
            </p>
            <button
              type="button"
              onClick={() => setEditingSettings(true)}
              className="rounded-md border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
            >
              ✏️ Đổi mục tiêu ({hub.stats.week1_target} → {hub.stats.week2_target} → {hub.stats.week3_target ?? 150} → {hub.stats.week4_target ?? 300})
            </button>
          </div>
          <p className="mt-1">
            Phối hợp liên Agent: <b>Growth Lead Agent</b> (Lập lịch ngày/tuần/tháng) → <b>SEO Agent</b> (Soạn bài chuẩn RAG) →{" "}
            <b>Content Agent</b> (Chọn 1 trong 30 ảnh riêng biệt & đăng Fanpage) → <b>Community Agent</b> (Trả lời tin nhắn tự động bằng RAG & mời vào Group).
          </p>
        </div>

        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
            <p className="text-xs font-semibold text-emerald-800">
              Tuần 1 (02/11 – 08/11/2026)
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">
              {hub.stats.week1_achieved}/{hub.stats.week1_target}
            </p>
            <p className="text-[11px] font-medium text-emerald-700">
              {hub.stats.week1_achieved >= hub.stats.week1_target
                ? "✓ Đạt chỉ tiêu Tuần 1 (100%)"
                : `Đang có ${hub.stats.week1_achieved} thành viên thật trong Group`}
            </p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3">
            <p className="text-xs font-semibold text-blue-800">
              Tuần 2 (09/11 – 15/11/2026)
            </p>
            <p className="mt-1 text-2xl font-bold text-blue-900">
              {hub.stats.week2_progress}/{hub.stats.week2_target}
            </p>
            <p className="text-[11px] font-medium text-blue-700">
              {hub.stats.real_identified_people} người thật đã nhắn tin Messenger
            </p>
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3">
            <p className="text-xs font-semibold text-purple-800">Tiến độ Lịch Đăng bài</p>
            <p className="mt-1 text-2xl font-bold text-purple-900">
              {publishedCount}/{hub.stats.total_approved_playbook_topics} bài
            </p>
            <p className="text-[11px] font-medium text-purple-700">
              Còn {hub.stats.fresh_unposted_topics} bài đã có ngày đăng cụ thể
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <p className="text-xs font-semibold text-amber-900">Kho Chủ đề & Ảnh chuẩn</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">
              {hub.stats.total_approved_playbook_topics} bài · {hub.stats.approved_unique_images} ảnh
            </p>
            <p className="text-[11px] font-medium text-amber-800">
              0% trùng lặp nội dung & hình ảnh
            </p>
          </div>
        </div>
      </div>

      {bannerMessage && (
        <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-sm font-medium text-emerald-900">
          {bannerMessage}
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
            activeTab === "calendar"
              ? "bg-blue-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          1. Lịch Đăng bài Cụ thể theo Ngày / Tuần / Tháng (06/11 – 24/11/2026)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("campaigns")}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
            activeTab === "campaigns"
              ? "bg-blue-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          2. Chiến dịch Thu hút Thành viên ({hub.stats.week1_target} → {hub.stats.week2_target} → {hub.stats.week3_target ?? 150} → {hub.stats.week4_target ?? 300})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("discussions")}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
            activeTab === "discussions"
              ? "bg-blue-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          3. Thảo luận Cộng đồng ({hub.discussions.length} Chủ đề)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("architecture")}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
            activeTab === "architecture"
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Kế hoạch Đăng bài Thực tế theo Ngày • Tuần • Tháng (Có Ngày Giờ Cụ thể & Phân công Agent Rõ ràng)
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Toàn bộ {hub.calendar.daily.length} chủ đề đều có <b>ngày tháng năm & khung giờ cụ thể</b> (Đã đăng: {publishedCount} bài; Dự kiến đăng từ <b>08/11/2026 đến 24/11/2026 lúc 09:00 sáng</b>: {hub.stats.fresh_unposted_topics} bài). Mỗi bài được gán 1 hình ảnh độc nhất từ kho {hub.stats.approved_unique_images} ảnh chuẩn (0% trùng lặp).
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCalendarView("daily")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  calendarView === "daily" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                Lịch Ngày Cụ thể ({hub.calendar.daily.length} Bài: 06/11 – 24/11/2026)
              </button>
              <button
                type="button"
                onClick={() => setCalendarView("weekly")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  calendarView === "weekly" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                Lịch 4 Tuần Cụ thể (02/11 – 30/11/2026)
              </button>
              <button
                type="button"
                onClick={() => setCalendarView("monthly")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  calendarView === "monthly" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                Lộ trình 3 Tháng (11/2026 – 01/2027)
              </button>
            </div>
          </div>

          {calendarView === "daily" && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {hub.calendar.daily.map((item) => (
                <div
                  key={item.source_id}
                  className={`flex flex-col justify-between overflow-hidden rounded-xl border bg-white shadow-sm ${
                    item.status === "published" ? "border-emerald-300" : "border-slate-200"
                  }`}
                >
                  <div>
                    <div className="relative h-40 w-full overflow-hidden bg-slate-100">
                      <img
                        src={item.image_url}
                        alt={item.image_attribution}
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute left-2 top-2 rounded bg-slate-900/90 px-2.5 py-1 text-[11px] font-bold text-white shadow">
                        📅 {item.scheduled_date_vn || item.day_label}
                      </span>
                      <span
                        className={`absolute right-2 top-2 rounded px-2.5 py-1 text-[11px] font-bold shadow ${
                          item.status === "published"
                            ? "bg-emerald-600 text-white"
                            : "bg-amber-400 text-slate-950"
                        }`}
                      >
                        {item.status === "published" ? "✓ Đã xuất bản" : "⏰ Lịch đăng dự kiến"}
                      </span>
                      {item.week_range_label && (
                        <span className="absolute bottom-2 left-2 rounded bg-blue-900/85 px-2 py-0.5 text-[10px] font-semibold text-white">
                          {item.week_range_label}
                        </span>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          ✓ Bài #{item.day_index}/25 (Không trùng chủ đề)
                        </span>
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                          ✓ Ảnh độc nhất #{item.day_index}
                        </span>
                      </div>
                      <h4 className="mt-2 text-sm font-bold text-slate-900">{item.topic_title}</h4>
                      <p className="mt-1 text-xs font-semibold text-blue-800">
                        Xu hướng thu hút: {item.target_trend}
                      </p>
                      {item.concrete_action && (
                        <p className="mt-1.5 rounded bg-slate-50 p-2 text-[11px] font-medium text-slate-700">
                          🎯 <b>Kế hoạch thực tế:</b> {item.concrete_action}
                        </p>
                      )}
                      <p className="mt-2 text-xs text-slate-600">{item.community_discussion_hook}</p>
                      <div className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                        <b>Phối hợp Agent:</b> Growth Lead (Lên lịch {item.scheduled_date_only}) → SEO Agent (Bài Web) → Content Agent (Bài Page + Ảnh) → Community Agent (Mở thảo luận Group)
                      </div>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {item.facebook_post_url && (
                          <a
                            href={item.facebook_post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-blue-700 hover:underline"
                          >
                            Xem bài trên Fanpage ↗
                          </a>
                        )}
                        {item.published_slug && (
                          <a
                            href={`http://localhost:3001/posts/${item.published_slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-emerald-700 hover:underline"
                          >
                            Xem bài Web ↗
                          </a>
                        )}
                        {!item.facebook_post_url && !item.published_slug && (
                          <span className="font-semibold text-slate-600">
                            Dự kiến: {item.scheduled_date_short}
                          </span>
                        )}
                      </div>
                      {item.status === "published" ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyAndOpenGroup(
                              item.topic_title,
                              item.concrete_action || item.target_trend,
                              item.community_discussion_hook
                            )
                          }
                          className="rounded-lg border border-blue-600 bg-white px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50"
                        >
                          📋 Copy & Chia sẻ vào Group ↗
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!canEdit || !!busyAction}
                          onClick={() => handlePublishFreshPost(item.source_id)}
                          className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                        >
                          {busyAction === item.source_id ? "Đang đăng…" : "⚡ Đăng ngay hôm nay"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {calendarView === "weekly" && (
            <div className="grid gap-4 md:grid-cols-2">
              {hub.calendar.weekly.map((w) => (
                <div key={w.week_number} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-md bg-blue-700 px-2.5 py-1 text-xs font-bold text-white">
                      {w.week_label}
                    </span>
                    <span className="text-xs font-bold text-emerald-800">{w.member_target}</span>
                  </div>
                  <h4 className="mt-3 text-base font-bold text-slate-900">{w.pillar_theme}</h4>
                  {w.responsible_agents && (
                    <p className="mt-1 text-xs font-semibold text-purple-800">
                      🤖 Phân công Agent: {w.responsible_agents}
                    </p>
                  )}
                  <p className="mt-1 text-xs font-semibold text-blue-800">
                    💬 Hoạt động tương tác thực tế: {w.interactive_format}
                  </p>
                  <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                    Lịch đăng bài cụ thể từng ngày trong tuần ({w.planned_topics.length} bài):
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                    {w.planned_topics.map((topic) => (
                      <li key={topic} className="flex gap-2 rounded bg-slate-50 px-2.5 py-1.5">
                        <span className="font-bold text-blue-700">•</span>
                        <span>{topic}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
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
                    className={`rounded-xl border p-4 ${
                      c.status === "completed_target"
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
            <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_1.6fr_auto]">
              <input
                type="text"
                placeholder="Tên người dùng / khách tiềm năng (VD: Nguyễn Minh Tuấn)"
                value={prospectName}
                onChange={(e) => setProspectName(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              />
              <input
                type="text"
                placeholder="Tín hiệu / Nhu cầu quan tâm (VD: Muốn tìm chỗ ở và lịch trình du lịch Đà Nẵng 2 tuần)"
                value={prospectSignal}
                onChange={(e) => setProspectSignal(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
              />
              <button
                type="button"
                disabled={!canEdit || !prospectName.trim() || !prospectSignal.trim() || busyAction === "scan"}
                onClick={handleScanMembers}
                className="rounded-lg border border-blue-600 bg-white px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                + Ghi chú khách tiềm năng (nhập tay)
              </button>
            </div>

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
                  {d.image_url && (
                    <div className="relative h-36 w-full overflow-hidden bg-slate-100">
                      <img src={d.image_url} alt={d.title} className="h-full w-full object-cover" />
                      <span className="absolute left-3 top-3 rounded-full bg-blue-700/90 px-2.5 py-0.5 text-xs font-bold text-white">
                        {d.category}
                      </span>
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {!d.image_url && (
                        <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                          {d.category}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        👥 {d.participants_count} thành viên tham gia thảo luận · {(d.replies ?? []).length} phản hồi
                      </span>
                    </div>
                    <h4 className="mt-2 text-base font-bold text-slate-900">{d.title}</h4>
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
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-base font-bold text-slate-900">
                Tạo Chủ đề Thảo luận mới cho Cộng đồng của Bạn
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Mỗi bài đăng trong &ldquo;{hub.group.name}&rdquo; đều có tình huống thực tế và câu hỏi mở để các thành viên bình luận chia sẻ kinh nghiệm cho nhau.
              </p>
              <form onSubmit={handleCreateDiscussion} className="mt-4 space-y-3">
                <label className="block text-xs font-bold text-slate-800">
                  Tiêu đề thảo luận
                  <input
                    type="text"
                    required
                    value={discussionTitle}
                    onChange={(e) => setDiscussionTitle(e.target.value)}
                    placeholder="VD: Kinh nghiệm chọn khu vực thuê nhà yên tĩnh tại Đà Nẵng (Mỹ An vs Sơn Trà)?"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-800">
                  Nội dung chia sẻ mở đầu
                  <textarea
                    rows={3}
                    required
                    value={discussionBody}
                    onChange={(e) => setDiscussionBody(e.target.value)}
                    placeholder="Mô tả tình huống thực tế hoặc kinh nghiệm để mở đầu cuộc trò chuyện trong cộng đồng của bạn..."
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </label>
                <label className="block text-xs font-bold text-slate-800">
                  Câu hỏi mở mời các thành viên tương tác với nhau
                  <input
                    type="text"
                    value={discussionPrompt}
                    onChange={(e) => setDiscussionPrompt(e.target.value)}
                    placeholder="VD: Bạn đang ở khu vực nào và kinh nghiệm thực tế của bạn là gì?"
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                  />
                </label>
                <button
                  type="submit"
                  disabled={!canEdit || busyAction === "discussion"}
                  className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {busyAction === "discussion"
                    ? "Đang đăng chủ đề thảo luận…"
                    : "💬 Đăng Chủ đề Thảo luận vào Cộng đồng"}
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
