"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type WeeklyCampaign = {
  week: number;
  title: string;
  target_members: number;
  current_members: number;
  status: string;
  theme: string;
  target_trends: string[];
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
  week_number: number;
  source_id: string;
  topic_title: string;
  source_url: string;
  image_url: string;
  image_attribution: string;
  target_trend: string;
  interest_tags: string[];
  community_discussion_hook: string;
  status: "published" | "ready_to_publish";
  published_slug: string | null;
  published_at: string | null;
  unique_topic_verified: boolean;
  unique_image_verified: boolean;
};

type WeeklyCalendarItem = {
  week_number: number;
  week_label: string;
  member_target: string;
  pillar_theme: string;
  planned_topics: string[];
  interactive_format: string;
};

type MonthlyCalendarItem = {
  month_number: number;
  month_label: string;
  member_goal: string;
  content_commitment: string;
  key_pillars: string[];
};

type HubResponse = {
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
    real_page_followers: number | null;
    real_page_likes: number | null;
    real_identified_people: number;
    manual_prospects: number;
    week1_target: number;
    week1_achieved: number;
    week2_target: number;
    week2_progress: number;
    active_discussions: number;
    total_approved_playbook_topics: number;
    fresh_unposted_topics: number;
    approved_unique_images: number;
    duplication_rate_pct: number;
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
  const [activeTab, setActiveTab] = useState<"campaigns" | "discussions" | "calendar">("campaigns");
  const [calendarView, setCalendarView] = useState<"daily" | "weekly" | "monthly">("daily");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<string>("");
  const [editingSettings, setEditingSettings] = useState(false);

  // Settings form state
  const [customCommunityName, setCustomCommunityName] = useState("");
  const [customGroupUrl, setCustomGroupUrl] = useState("");

  // Form states for adding prospect & creating discussion
  const [prospectName, setProspectName] = useState("");
  const [prospectSignal, setProspectSignal] = useState("");
  const [discussionTitle, setDiscussionTitle] = useState("");
  const [discussionBody, setDiscussionBody] = useState("");
  const [discussionPrompt, setDiscussionPrompt] = useState("");

  async function fetchHub() {
    setLoading(true);
    try {
      const res = await apiRequest<HubResponse>(`/workspaces/${workspaceId}/community/hub`);
      setHub(res);
      setCustomCommunityName(res.group.name);
      setCustomGroupUrl(res.group.group_url);
    } catch (err) {
      setBannerMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchHub();
  }, [workspaceId]);

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
        },
      });
      setHub(res.data);
      setEditingSettings(false);
      setBannerMessage("Đã lưu cấu hình Cộng đồng & Link Group của riêng bạn!");
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
      setBannerMessage(
        `Đã quét hộp thư Messenger & bình luận thật trên Fanpage "${res.data.group.page_name}".`
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
      setBannerMessage(`Đã tạo chủ đề thảo luận 2 chiều mới trong "${res.data.group.name}"!`);
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

  if (loading && !hub) {
    return (
      <section className="rounded-2xl border border-blue-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-blue-800">
          Đang tải hệ thống Cộng đồng Tương tác 2 Chiều & Kế hoạch Nội dung của bạn…
        </p>
      </section>
    );
  }

  if (!hub) return null;

  return (
    <section className="space-y-6 rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-blue-50/50 to-white p-6 shadow-sm">
      {/* Header Banner */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-blue-100 pb-5">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-700 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
              Cộng đồng Tương tác 2 Chiều của Riêng Bạn
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
              Chống trùng lặp Hình ảnh & Nội dung: 100% Unique
            </span>
          </div>
          <h2 className="mt-3 text-2xl font-bold text-slate-900">{hub.group.name}</h2>
          <p className="mt-1 text-sm text-slate-600">{hub.group.positioning}</p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
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
              onClick={() => setEditingSettings((v) => !v)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-slate-700 hover:bg-slate-50"
            >
              ⚙️ Tùy chỉnh Tên Cộng đồng & Link Group của bạn
            </button>
            <button
              type="button"
              disabled={!canEdit || !!busyAction}
              onClick={() => handlePublishFreshPost()}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busyAction === "publish_fresh"
                ? "Đang tạo & đăng bài mới…"
                : "⚡ Đăng ngay 1 bài mới lên Fanpage & Cộng đồng của bạn (Không trùng lặp)"}
            </button>
          </div>

          {editingSettings && (
            <form onSubmit={handleSaveSettings} className="mt-4 space-y-3 rounded-xl border border-blue-200 bg-white p-4">
              <p className="text-xs font-bold text-slate-900">
                Cấu hình Tên Cộng đồng & Link Group Facebook của Riêng Bạn (Mọi bài đăng và lời mời thành viên sẽ dẫn về đây)
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
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
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!canEdit || busyAction === "save_settings"}
                  className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                >
                  {busyAction === "save_settings" ? "Đang lưu…" : "Lưu cấu hình Cộng đồng của tôi"}
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
        <div className="rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs text-slate-700">
          <p className="font-bold text-slate-900">
            Số liệu thật từ Facebook (Graph API): {hub.stats.real_page_followers ?? "—"} người theo dõi ·{" "}
            {hub.stats.real_page_likes ?? "—"} lượt thích Page
          </p>
          <p className="mt-1">
            Tiến độ các mốc 5 → 50 → 150 → 300 chỉ tính theo <b>người theo dõi thật</b> của Fanpage. Hệ thống không thể tự
            thêm ai vào Page/Group (Facebook không cho phép) — người dùng phải tự bấm Theo dõi / Tham gia.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
            <p className="text-xs font-semibold text-emerald-800">Tuần 1 (Mục tiêu 5 người theo dõi)</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">
              {hub.stats.week1_achieved}/{hub.stats.week1_target}
            </p>
            <p className="text-[11px] font-medium text-emerald-700">
              {hub.stats.week1_achieved >= hub.stats.week1_target ? "✓ Đạt chỉ tiêu Tuần 1" : "Chưa đạt — số follower thật"}
            </p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3">
            <p className="text-xs font-semibold text-blue-800">Tuần 2 (Mục tiêu 50 người theo dõi)</p>
            <p className="mt-1 text-2xl font-bold text-blue-900">
              {hub.stats.week2_progress}/{hub.stats.week2_target}
            </p>
            <p className="text-[11px] font-medium text-blue-700">
              {hub.stats.real_identified_people} người thật đã nhắn tin/bình luận
            </p>
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50/70 p-3">
            <p className="text-xs font-semibold text-purple-800">Thảo luận 2 chiều</p>
            <p className="mt-1 text-2xl font-bold text-purple-900">{hub.stats.active_discussions} chủ đề</p>
            <p className="text-[11px] font-medium text-purple-700">Thành viên tương tác chéo</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <p className="text-xs font-semibold text-amber-900">Kho Chủ đề & Ảnh chuẩn</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">
              {hub.stats.total_approved_playbook_topics} bài · {hub.stats.approved_unique_images} ảnh
            </p>
            <p className="text-[11px] font-medium text-amber-800">0% trùng lặp nội dung/ảnh</p>
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
          onClick={() => setActiveTab("campaigns")}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
            activeTab === "campaigns"
              ? "bg-blue-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          1. Chiến dịch Thu hút Thành viên (Tuần 1: 5 → Tuần 2: 50) & Tự động Gom người cùng xu hướng
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
          2. Cộng đồng Tương tác 2 Chiều của Bạn ({hub.discussions.length} Chủ đề Thảo luận)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("calendar")}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
            activeTab === "calendar"
              ? "bg-blue-700 text-white shadow-sm"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          3. Kế hoạch Đăng bài Ngày / Tuần / Tháng (Chống trùng lặp Ảnh & Nội dung)
        </button>
      </div>

      {/* TAB 1: WEEKLY MEMBER ACQUISITION CAMPAIGNS & AUTO-MATCHING */}
      {activeTab === "campaigns" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Lộ trình Chiến dịch Thu hút Thành viên vào Cộng đồng của Riêng Bạn theo từng Tuần
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Mục tiêu rõ ràng theo tuần (Tuần 1: thu hút 5 thành viên hạt nhân → Tuần 2: 50 thành viên → Tuần 3: 150 → Tuần 4: 300) kèm chiến thuật tự động nhận diện người có cùng mối quan tâm để mời vào cộng đồng của bạn.
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
                        Tuần {c.week}
                      </span>
                      <span className="text-xs font-bold text-blue-800">
                        Mục tiêu: {c.target_members} người
                      </span>
                    </div>
                    <h4 className="mt-2 text-sm font-bold text-slate-900">{c.title}</h4>
                    <p className="mt-1 text-xs font-medium text-slate-600">Chủ đề trọng tâm: {c.theme}</p>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs font-semibold">
                        <span>Tiến độ thu hút</span>
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
                  Chỉ liệt kê tài khoản Facebook thật đã nhắn tin / bình luận trên Fanpage &ldquo;{hub.group.page_name}&rdquo;, kèm nhãn sở thích để gợi ý bài phù hợp.
                  Đây là danh sách <b>khách tiềm năng để chăm sóc</b>, <b>không phải</b> người theo dõi Page — họ chỉ thành follower khi tự bấm Theo dõi.
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
                            Gợi ý bài: {m.recommended_topic}
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
                                  : "Đã tương tác — chưa mời vào Group"}
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

      {/* TAB 2: INTERACTIVE 2-WAY COMMUNITY DISCUSSIONS */}
      {activeTab === "discussions" && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900">
                Bảng Thảo luận Cộng đồng 2 Chiều của Bạn (Thành viên hỏi đáp & chia sẻ kinh nghiệm thực tế)
              </h3>
              {hub.discussions.map((d) => (
                <article key={d.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                      {d.category}
                    </span>
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
                    💬 Câu hỏi mở kích hoạt thảo luận 2 chiều: {d.discussion_prompt}
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
                </article>
              ))}
            </div>

            {/* Create New Interactive Thread */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="text-base font-bold text-slate-900">
                Tạo Chủ đề Thảo luận 2 Chiều mới cho Cộng đồng của Bạn
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Khác với bài thông báo 1 chiều, mỗi bài đăng trong &ldquo;{hub.group.name}&rdquo; đều có tình huống thực tế và câu hỏi mở để các thành viên bình luận chia sẻ kinh nghiệm cho nhau.
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
                    : "💬 Đăng Chủ đề Thảo luận 2 Chiều vào Cộng đồng của Tôi"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DAILY / WEEKLY / MONTHLY EDITORIAL CALENDAR & ANTI-DUPLICATION */}
      {activeTab === "calendar" && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Lịch trình Nội dung Mỗi Ngày • Mỗi Tuần • Mỗi Tháng cho Cộng đồng của Bạn (100% Thông tin Mới & Ảnh Riêng biệt)
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Mỗi bài đăng đều được đối chiếu chống trùng lặp: mỗi ngày khai thác 1 chủ đề mới khác nhau và tự động gán 1 hình ảnh minh họa khớp chủ đề riêng biệt từ kho 16 ảnh chuẩn để đăng lên Fanpage &ldquo;{hub.group.page_name}&rdquo; và Cộng đồng của bạn.
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
                Theo Ngày (14 Ngày)
              </button>
              <button
                type="button"
                onClick={() => setCalendarView("weekly")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  calendarView === "weekly" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                Theo Tuần (4 Tuần)
              </button>
              <button
                type="button"
                onClick={() => setCalendarView("monthly")}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  calendarView === "monthly" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
                }`}
              >
                Theo Tháng (3 Tháng)
              </button>
            </div>
          </div>

          {calendarView === "daily" && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {hub.calendar.daily.map((item) => (
                <div
                  key={item.source_id}
                  className="flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
                >
                  <div>
                    <div className="relative h-36 w-full overflow-hidden bg-slate-100">
                      <img
                        src={item.image_url}
                        alt={item.image_attribution}
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute left-2 top-2 rounded bg-slate-900/85 px-2 py-0.5 text-[11px] font-bold text-white">
                        {item.day_label}
                      </span>
                      <span
                        className={`absolute right-2 top-2 rounded px-2 py-0.5 text-[11px] font-bold ${
                          item.status === "published"
                            ? "bg-emerald-600 text-white"
                            : "bg-amber-400 text-slate-950"
                        }`}
                      >
                        {item.status === "published" ? "Đã đăng" : "Sẵn sàng đăng mới"}
                      </span>
                    </div>
                    <div className="p-4">
                      <div className="flex flex-wrap gap-1">
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                          ✓ Chủ đề duy nhất
                        </span>
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                          ✓ Ảnh riêng biệt
                        </span>
                      </div>
                      <h4 className="mt-2 text-sm font-bold text-slate-900">{item.topic_title}</h4>
                      <p className="mt-1 text-xs font-medium text-blue-800">
                        Xu hướng thu hút: {item.target_trend}
                      </p>
                      <p className="mt-2 text-xs text-slate-600">{item.community_discussion_hook}</p>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-600">
                        Kênh: {hub.group.page_name}
                      </span>
                      {item.status === "published" && item.published_slug ? (
                        <span className="text-xs font-bold text-emerald-700">
                          Đã lên bài (/posts/{item.published_slug.slice(0, 18)}…)
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!canEdit || !!busyAction}
                          onClick={() => handlePublishFreshPost(item.source_id)}
                          className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800 disabled:opacity-50"
                        >
                          {busyAction === item.source_id ? "Đang đăng…" : "Đăng ngay lên Cộng đồng của tôi"}
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
                <div key={w.week_number} className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-blue-700 px-2.5 py-1 text-xs font-bold text-white">
                      {w.week_label}
                    </span>
                    <span className="text-xs font-bold text-emerald-800">{w.member_target}</span>
                  </div>
                  <h4 className="mt-3 text-base font-bold text-slate-900">{w.pillar_theme}</h4>
                  <p className="mt-1 text-xs font-semibold text-blue-800">
                    Hình thức tương tác cộng đồng: {w.interactive_format}
                  </p>
                  <p className="mt-3 text-xs font-bold uppercase text-slate-500">
                    Danh sách bài viết mới trong tuần (Không trùng lặp):
                  </p>
                  <ul className="mt-2 space-y-1.5 text-xs text-slate-700">
                    {w.planned_topics.map((topic, i) => (
                      <li key={topic} className="flex gap-2">
                        <span className="font-bold text-blue-700">Ngày {i + 1}:</span>
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
                <div key={m.month_number} className="rounded-xl border border-slate-200 bg-white p-5">
                  <span className="rounded-md bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">
                    Tháng {m.month_number}
                  </span>
                  <h4 className="mt-3 text-base font-bold text-slate-900">{m.month_label}</h4>
                  <p className="mt-2 rounded-lg bg-emerald-50 p-2.5 text-xs font-bold text-emerald-900">
                    🎯 Mục tiêu thành viên: {m.member_goal}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">{m.content_commitment}</p>
                  <ul className="mt-3 space-y-2 text-xs text-slate-700">
                    {m.key_pillars.map((p) => (
                      <li key={p} className="flex gap-2">
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
    </section>
  );
}
