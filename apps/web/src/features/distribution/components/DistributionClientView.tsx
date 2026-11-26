"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/features/shell/AppShell";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";
import { EmptyBlock, ErrorBlock, LoadingBlock, Toast } from "@/features/shell/StatusViews";
import { latestApproval } from "@/features/artifacts/adapters";
import { ApiError, apiRequest, growthApi } from "@/lib/api";
import GeneratedPosts, { type SitePost } from "./GeneratedPosts";
import type { Channel, ContentArtifact, PublishingJob } from "@/lib/apiTypes";
import { agentLabel, formatDateTime, humanize, shortCode, timeAgo } from "@/lib/format";
import { useApiData } from "@/lib/useApiData";

type DistributionPostMetric = {
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
  last_synced_at: string;
};

type DistributionHubSummary = {
  group?: {
    last_post_stats_sync_at?: string | null;
  };
  stats?: {
    real_group_members?: number | null;
    total_post_likes?: number;
    total_post_comments?: number;
    total_post_shares?: number;
    total_post_engagement?: number;
    tracked_posts_count?: number;
    member_growth_delta?: number;
    engagement_growth_delta?: number;
  };
  post_metrics?: DistributionPostMetric[];
};

function normalizeMetricUrl(raw?: string | null): string {
  if (!raw) return "";
  return raw.trim().split("?")[0].split("#")[0].replace(/\/+$/, "").toLowerCase();
}

function normalizeMetricTitle(raw?: string | null): string {
  if (!raw) return "";
  return raw
    .replace(/^[\p{Emoji}\s]*\[(CẨM NANG CỘNG ĐỒNG|VIETNAM PLAYBOOK)\]\s*/iu, "")
    .replace(/\s*\(tripc\.ai\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function matchJobPostMetric(
  job: PublishingJob,
  metrics: DistributionPostMetric[] | undefined
): DistributionPostMetric | null {
  if (!metrics || metrics.length === 0) return null;
  const preferredChannel =
    job.platform_name === "facebook_group"
      ? "group"
      : job.platform_name === "facebook"
        ? "fanpage"
        : null;
  const pool = preferredChannel
    ? metrics.filter((m) => m.channel === preferredChannel)
    : metrics;
  const candidates = pool.length > 0 ? pool : metrics;

  if (job.external_post_id) {
    const ext = job.external_post_id.trim();
    const extSuffix = ext.includes("_") ? ext.split("_")[1] : ext;
    const byKey = candidates.find(
      (m) =>
        m.external_post_key === ext ||
        (extSuffix && (m.external_post_key === extSuffix || m.external_post_key.endsWith(`_${extSuffix}`)))
    );
    if (byKey) return byKey;
  }

  const normJobUrl = normalizeMetricUrl(job.utm_url);
  if (normJobUrl) {
    const byUrl = candidates.find((m) => {
      const mUrl = normalizeMetricUrl(m.post_url);
      return Boolean(mUrl && mUrl === normJobUrl);
    });
    if (byUrl) return byUrl;
  }

  const normTitle = normalizeMetricTitle(job.content_title);
  if (normTitle.length >= 8) {
    const byTitle = candidates.find((m) => {
      const mTitle = normalizeMetricTitle(m.post_title);
      return mTitle === normTitle || mTitle.includes(normTitle) || normTitle.includes(mTitle);
    });
    if (byTitle) return byTitle;
  }

  return null;
}

const input =
  "w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";

const STATUS_STYLE: Record<PublishingJob["status"], string> = {
  scheduled: "bg-blue-100 text-blue-800",
  publishing: "bg-sky-100 text-sky-800",
  published: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-600",
  failed: "bg-rose-100 text-rose-800",
};

const STATUS_LABEL_VI: Record<PublishingJob["status"], string> = {
  scheduled: "Đang hẹn giờ",
  publishing: "Đang xuất bản",
  published: "Đã đăng",
  cancelled: "Đã hủy",
  failed: "Lỗi đăng",
};

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? `${err.message} (${err.code})` : fallback;
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function ScheduleForm({
  artifact,
  channels,
  onScheduled,
}: {
  artifact: ContentArtifact;
  channels: Channel[];
  onScheduled: (job: PublishingJob) => void;
}) {
  const { workspace } = useWorkspace();
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [when, setWhen] = useState(() => toLocalInput(new Date(Date.now() + 60 * 60 * 1000)));
  const [campaign, setCampaign] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const job = await growthApi.schedulePublishing(workspace.id, {
        artifact_id: artifact.id,
        channel_id: channelId,
        scheduled_for: new Date(when).toISOString(),
        utm_campaign: campaign.trim() || undefined,
      });
      onScheduled(job);
    } catch (err) {
      setError(errorText(err, "Không thể lên lịch bài viết này."));
    } finally {
      setSaving(false);
    }
  };

  if (channels.length === 0) {
    return <p className="text-xs text-slate-500">Vui lòng thêm kênh phân phối trước khi lên lịch.</p>;
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end mt-3 pt-3 border-t border-slate-200">
      <label className="space-y-1">
        <span className="text-xs font-semibold text-slate-700">Kênh xuất bản</span>
        <select className={input} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.display_name ?? humanize(c.platform_name)} ({c.publish_mode})
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-slate-700">Thời gian đăng</span>
        <input className={input} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-semibold text-slate-700">Mã chiến dịch (utm_campaign)</span>
        <input className={input} value={campaign} placeholder="cv-seo-q4" onChange={(e) => setCampaign(e.target.value)} />
      </label>
      <button
        type="submit"
        disabled={saving || !channelId}
        className="bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-4 py-2 rounded-lg cursor-pointer disabled:opacity-60"
      >
        {saving ? "Đang lưu lịch..." : "Xác nhận lên lịch"}
      </button>
      {error && (
        <p className="sm:col-span-4 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </form>
  );
}

function AddChannelForm({ onAdded }: { onAdded: (c: Channel) => void }) {
  const { workspace } = useWorkspace();
  const [platform, setPlatform] = useState<Channel["platform_name"]>("website");
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Vui lòng nhập tên hiển thị của kênh.");
    setError(null);
    try {
      const channel = await growthApi.createChannel(workspace.id, {
        platform_name: platform,
        display_name: name.trim(),
        channel_identifier: identifier.trim() || null,
      });
      setName("");
      setIdentifier("");
      onAdded(channel);
    } catch (err) {
      setError(errorText(err, "Không thể thêm kênh mới."));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 pt-4 border-t border-slate-200">
      <p className="text-xs font-bold text-slate-800">Thêm kênh phân phối mới</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <select className={input} value={platform} onChange={(e) => setPlatform(e.target.value as Channel["platform_name"])}>
          {(["website", "facebook_group", "facebook", "tiktok", "instagram", "linkedin", "email"] as const).map((p) => (
            <option key={p} value={p}>
              {p === "facebook_group" ? "Facebook Group" : humanize(p)}
            </option>
          ))}
        </select>
        <input className={input} placeholder="Tên hiển thị kênh" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={input} placeholder="URL hoặc định danh kênh" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <button
        type="submit"
        className="bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-4 py-2 rounded-lg cursor-pointer"
      >
        Thêm kênh
      </button>
    </form>
  );
}

type DistributionTabId = "published_by_date" | "schedule_queue" | "generated_posts" | "channels";

function DistributionContent() {
  const { workspace, canEdit, canApprove } = useWorkspace();
  const [toast, setToast] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [syncingStats, setSyncingStats] = useState(false);
  const [publishedDateFilter, setPublishedDateFilter] = useState<string>("");
  const [jobStatusFilter, setJobStatusFilter] = useState<"all" | "pending" | "published" | "failed">("all");
  const [activeTab, setActiveTab] = useState<DistributionTabId>("published_by_date");
  const [pubJobPage, setPubJobPage] = useState<number>(1);
  const [pubJobPageSize, setPubJobPageSize] = useState<number>(6);
  const [scheduleJobPage, setScheduleJobPage] = useState<number>(1);
  const [scheduleJobPageSize, setScheduleJobPageSize] = useState<number>(8);

  const { data, error, loading, reload } = useApiData(workspace.id, async (signal) => {
    const [channels, jobs, artifacts, approvals, integrations, automation, sitePosts, communityHub] = await Promise.all([
      growthApi.listChannels(workspace.id, signal),
      growthApi.listPublishingJobs(workspace.id, signal),
      growthApi.listArtifacts(workspace.id, signal),
      growthApi.listApprovals(workspace.id, signal),
      growthApi.getIntegrations(workspace.id, signal),
      apiRequest<{ settings: { auto_publish_website?: boolean } | null }>(`/workspaces/${workspace.id}/automation`, { signal }),
      apiRequest<{ items: SitePost[] }>(`/workspaces/${workspace.id}/site-posts`, { signal }),
      apiRequest<DistributionHubSummary>(`/workspaces/${workspace.id}/community/hub`, { signal }).catch(() => null),
    ]);
    const facebook = integrations.providers.find((p) => p.provider === "facebook_page");
    const facebookGroup = integrations.providers.find((p) => p.provider === "facebook_group");
    return {
      channels: channels.items,
      jobs: jobs.items,
      artifacts: artifacts.items,
      approvals: approvals.items,
      facebook: { connected: facebook?.status === "connected", reason: facebook?.missing_reason ?? null },
      facebookGroup: { connected: facebookGroup?.status === "connected", reason: facebookGroup?.missing_reason ?? null },
      websiteAutoPublish: automation.settings?.auto_publish_website === true,
      sitePosts: sitePosts.items,
      communityHub,
    };
  });

  const handleSyncPostStats = async () => {
    setSyncingStats(true);
    try {
      const res = await apiRequest<{
        sync_stats_result?: {
          fanpage_posts_synced: number;
          group_posts_synced: number;
          total_likes: number;
          total_comments: number;
          total_shares: number;
        };
      }>(`/workspaces/${workspace.id}/community/hub`, {
        method: "POST",
        body: { action: "sync_post_stats", include_group_bot: true },
      });
      const r = res.sync_stats_result;
      setToast(
        r
          ? `Đã đồng bộ ${r.group_posts_synced + r.fanpage_posts_synced} bài: ${r.total_likes} lượt thích · ${r.total_comments} bình luận · ${r.total_shares} chia sẻ.`
          : "Đã đồng bộ thống kê tương tác bài viết."
      );
      reload();
    } catch (err) {
      setToast(errorText(err, "Không thể đồng bộ thống kê bài viết."));
    } finally {
      setSyncingStats(false);
    }
  };

  const ready = useMemo(() => {
    if (!data) return [];
    return data.artifacts.filter((a) => {
      const approval = latestApproval(a.id, data.approvals);
      return approval?.status === "approved" && approval.target_version === a.version && approval.target_hash === a.content_hash;
    });
  }, [data]);

  const updateJob = async (job: PublishingJob, action: "cancel" | "mark_published") => {
    let externalId: string | null = null;
    if (action === "mark_published") {
      const answer = window.prompt("Nhập URL hoặc ID bài đã đăng trên kênh (tuỳ chọn):", "");
      if (answer === null) return;
      externalId = answer.trim() || null;
    }
    try {
      await growthApi.updatePublishingJob(
        workspace.id,
        job.id,
        action === "cancel" ? { action } : { action, external_post_id: externalId }
      );
      setToast(action === "cancel" ? "Đã hủy lịch đăng." : "Đã đánh dấu bài viết là Đã đăng.");
      reload();
    } catch (err) {
      setToast(errorText(err, "Không thể cập nhật trạng thái lịch đăng."));
    }
  };

  const counts = {
    scheduled: data?.jobs.filter((j) => j.status === "scheduled" || j.status === "publishing").length ?? 0,
    published: data?.jobs.filter((j) => j.status === "published").length ?? 0,
    failed: data?.jobs.filter((j) => j.status === "failed").length ?? 0,
  };

  const generatedPostsCount = useMemo(() => {
    if (!data) return 0;
    return data.artifacts.filter(
      (a) =>
        (a.operation === "seo.local_draft" ||
          a.operation === "content.repurpose" ||
          a.operation === "content.generate") &&
        (a.payload?.result as Record<string, unknown> | undefined)?.synthetic !== true
    ).length;
  }, [data]);

  const publishedJobsByDate = useMemo(() => {
    if (!data) return [];
    const pubJobs = data.jobs
      .filter((j) => j.status === "published")
      .filter((j) => {
        if (!publishedDateFilter) return true;
        const raw = j.published_at || j.scheduled_for;
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return false;
        const vn = new Date(d.getTime() + 7 * 3600_000);
        const iso = `${vn.getUTCFullYear()}-${String(vn.getUTCMonth() + 1).padStart(2, "0")}-${String(vn.getUTCDate()).padStart(2, "0")}`;
        return iso === publishedDateFilter;
      })
      .sort((a, b) => (b.published_at || b.scheduled_for).localeCompare(a.published_at || a.scheduled_for));

    const grouped = new Map<string, PublishingJob[]>();
    for (const job of pubJobs) {
      const raw = job.published_at || job.scheduled_for;
      const d = new Date(raw);
      let label = "Không rõ ngày";
      if (!Number.isNaN(d.getTime())) {
        const vn = new Date(d.getTime() + 7 * 3600_000);
        label = `${String(vn.getUTCDate()).padStart(2, "0")}/${String(vn.getUTCMonth() + 1).padStart(2, "0")}/${vn.getUTCFullYear()}`;
      }
      const list = grouped.get(label) ?? [];
      list.push(job);
      grouped.set(label, list);
    }
    return Array.from(grouped.entries());
  }, [data, publishedDateFilter]);

  const filteredScheduleJobs = useMemo(() => {
    if (!data) return [];
    return data.jobs.filter((j) => {
      if (jobStatusFilter === "published") return j.status === "published";
      if (jobStatusFilter === "pending") return j.status === "scheduled" || j.status === "publishing";
      if (jobStatusFilter === "failed") return j.status === "failed";
      return true;
    });
  }, [data, jobStatusFilter]);

  return (
    <main className="flex-1 p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {/* Header theo chuẩn Template Điều khiển tự động / Agent Maps (Không dùng icon) */}
        <div className="p-5 border-b border-slate-200">
          <div className="flex flex-wrap justify-between gap-4">
            <div>
              <h1 className="font-bold text-slate-900 text-base">
                Agent 4: Multi-Channel Publisher &amp; Distribution (Lịch xuất bản &amp; Phân phối đa kênh)
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Đã đăng: {counts.published} bài · Đang hẹn giờ tự động: {counts.scheduled} bài · Sẵn sàng lên lịch: {ready.length} bài
                {data?.communityHub?.stats
                  ? ` · Tổng tương tác: ${data.communityHub.stats.total_post_likes ?? 0} lượt thích, ${data.communityHub.stats.total_post_comments ?? 0} bình luận, ${data.communityHub.stats.total_post_shares ?? 0} chia sẻ`
                  : ""}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Quản lý tập trung toàn bộ bài viết đã xuất bản theo từng ngày, hàng đợi hẹn giờ tự động và kho nội dung từ SEO Worker / Content Agent trên Website, Facebook Group, Fanpage và TikTok.
              </p>
            </div>
            <span className="self-start rounded-md bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              Tự động xuất bản 24/7 đã bật
            </span>
          </div>

          {/* Khung Điều khiển & Thống kê tương tác theo chuẩn hộp xanh nhạt */}
          <div className="mt-5 rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-slate-900 text-sm">
                Đồng bộ tương tác thực tế &amp; Điều phối kênh xuất bản ({workspace.name})
              </h2>
              {data?.communityHub?.group?.last_post_stats_sync_at && (
                <span className="rounded-md bg-white border border-blue-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  Đồng bộ gần nhất: {formatDateTime(data.communityHub.group.last_post_stats_sync_at)}
                </span>
              )}
            </div>

            {data?.communityHub?.stats && (
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-800">
                  Bài theo dõi: {data.communityHub.stats.tracked_posts_count ?? 0} bài
                </span>
                <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-800">
                  Lượt thích: {data.communityHub.stats.total_post_likes ?? 0}
                </span>
                <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-800">
                  Bình luận: {data.communityHub.stats.total_post_comments ?? 0}
                </span>
                <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-800">
                  Chia sẻ: {data.communityHub.stats.total_post_shares ?? 0}
                </span>
                <span className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-800">
                  Thành viên Group: {data.communityHub.stats.real_group_members ?? 5} người (
                  {(data.communityHub.stats.member_growth_delta ?? 0) >= 0
                    ? `+${data.communityHub.stats.member_growth_delta ?? 0}`
                    : data.communityHub.stats.member_growth_delta}
                  )
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {canEdit && (
                <button
                  type="button"
                  disabled={syncingStats}
                  onClick={() => void handleSyncPostStats()}
                  className="rounded-lg bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 cursor-pointer"
                >
                  {syncingStats ? "Đang đồng bộ tương tác..." : "Đồng bộ Thích, Bình luận, Chia sẻ"}
                </button>
              )}
              <Link
                href="/agents/community"
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Mở Trung tâm Cộng đồng (Agent 8)
              </Link>
              <button
                type="button"
                onClick={reload}
                className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Làm mới dữ liệu
              </button>
            </div>
          </div>
        </div>

        {/* Thanh Tabs điều hướng chuẩn Agent Maps (không icon) */}
        <div className="px-5 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 sm:gap-5">
            <button
              type="button"
              onClick={() => setActiveTab("published_by_date")}
              className={`py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === "published_by_date"
                  ? "border-blue-700 text-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Bài đã đăng theo ngày ({counts.published})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("schedule_queue")}
              className={`py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === "schedule_queue"
                  ? "border-blue-700 text-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Lịch xuất bản &amp; Hàng đợi ({data?.jobs.length ?? 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("generated_posts")}
              className={`py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === "generated_posts"
                  ? "border-blue-700 text-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Kho bài viết Agent đã soạn ({generatedPostsCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("channels")}
              className={`py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === "channels"
                  ? "border-blue-700 text-blue-700"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Kênh phân phối ({data?.channels.length ?? 0})
            </button>
          </div>
        </div>

        {/* Nội dung từng Tab */}
        <div className="p-6">
          {error && <ErrorBlock error={error} onRetry={reload} />}
          {!data && loading && <LoadingBlock label="Đang tải dữ liệu phân phối..." />}

          {data && (
            <>
              {/* TAB 1: CÁC BÀI ĐÃ ĐĂNG THEO NGÀY / THÁNG / NĂM (LƯỚI 3 CỘT + PHÂN TRANG) */}
              {activeTab === "published_by_date" && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">
                        Các bài đã xuất bản theo Ngày / Tháng / Năm ({counts.published} bài)
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Hiển thị dạng lưới 3 cột gọn gàng có phân trang cho toàn bộ bài đã đăng lên Facebook Group Cộng đồng, Website và Fanpage.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        aria-label="Lọc bài đã đăng theo ngày tháng năm"
                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800"
                        value={publishedDateFilter}
                        onChange={(e) => {
                          setPublishedDateFilter(e.target.value);
                          setPubJobPage(1);
                        }}
                      />
                      {publishedDateFilter && (
                        <button
                          type="button"
                          onClick={() => {
                            setPublishedDateFilter("");
                            setPubJobPage(1);
                          }}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
                        >
                          Xóa lọc ngày
                        </button>
                      )}
                      <select
                        aria-label="Số bài đã đăng mỗi trang"
                        value={pubJobPageSize}
                        onChange={(e) => {
                          setPubJobPageSize(Number(e.target.value));
                          setPubJobPage(1);
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                      >
                        <option value={6}>6 bài / trang</option>
                        <option value={9}>9 bài / trang</option>
                        <option value={12}>12 bài / trang</option>
                      </select>
                    </div>
                  </div>

                  {(() => {
                    const flatPubJobs = publishedJobsByDate.flatMap(([dateLabel, jobsOnDate]) =>
                      jobsOnDate.map((job) => ({ dateLabel, job }))
                    );
                    if (flatPubJobs.length === 0) {
                      return (
                        <div className="p-8 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-500">
                          Không có bài đã đăng nào trong ngày đã chọn.
                        </div>
                      );
                    }
                    const totalPubPages = Math.max(1, Math.ceil(flatPubJobs.length / pubJobPageSize));
                    const currentPubPage = Math.min(Math.max(1, pubJobPage), totalPubPages);
                    const startIdx = (currentPubPage - 1) * pubJobPageSize;
                    const pageItems = flatPubJobs.slice(startIdx, startIdx + pubJobPageSize);

                    return (
                      <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                          <span className="text-slate-600">
                            Hiển thị <strong>{startIdx + 1}–{Math.min(startIdx + pubJobPageSize, flatPubJobs.length)}</strong> / {flatPubJobs.length} bài đã đăng (Trang <strong>{currentPubPage}/{totalPubPages}</strong>)
                          </span>
                          {totalPubPages > 1 && (
                            <div className="flex flex-wrap items-center gap-1">
                              <button
                                type="button"
                                disabled={currentPubPage <= 1}
                                onClick={() => setPubJobPage((p) => Math.max(1, p - 1))}
                                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                              >
                                Trước
                              </button>
                              {Array.from({ length: totalPubPages }, (_, idx) => idx + 1).map((pNum) => (
                                <button
                                  key={pNum}
                                  type="button"
                                  onClick={() => setPubJobPage(pNum)}
                                  className={`w-7 h-7 rounded-lg font-semibold transition-colors ${
                                    pNum === currentPubPage
                                      ? "bg-blue-700 text-white"
                                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                  }`}
                                >
                                  {pNum}
                                </button>
                              ))}
                              <button
                                type="button"
                                disabled={currentPubPage >= totalPubPages}
                                onClick={() => setPubJobPage((p) => Math.min(totalPubPages, p + 1))}
                                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                              >
                                Sau
                              </button>
                            </div>
                          )}
                        </div>

                        <ul className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {pageItems.map(({ dateLabel, job }) => {
                            const matchedMetric = matchJobPostMetric(job, data.communityHub?.post_metrics);
                            return (
                              <li
                                key={job.id}
                                className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between space-y-3 transition-colors hover:border-blue-400"
                              >
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                                    <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold">
                                      Ngày {dateLabel}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold">
                                      Đã đăng
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                                      {job.channel_name ?? (job.platform_name ? humanize(job.platform_name) : "Kênh")}
                                    </span>
                                    <span className="text-slate-500">
                                      · {formatDateTime(job.published_at || job.scheduled_for)}
                                    </span>
                                  </div>
                                  <p className="font-semibold text-slate-900 text-sm line-clamp-2 break-words">
                                    {job.content_title}
                                  </p>
                                  {matchedMetric && (
                                    <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                                      Thích: {matchedMetric.likes_count} · Bình luận: {matchedMetric.comments_count} · Chia sẻ: {matchedMetric.shares_count}
                                    </div>
                                  )}
                                </div>
                                <div className="pt-2 border-t border-slate-100">
                                  {job.utm_url ? (
                                    <a
                                      href={job.utm_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block w-full text-center px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-700 font-semibold hover:bg-slate-50"
                                    >
                                      Xem bài đã đăng
                                    </a>
                                  ) : (
                                    <span className="block w-full text-center py-1.5 text-xs text-slate-400">
                                      Đã xuất bản
                                    </span>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>

                        {totalPubPages > 1 && (
                          <div className="px-5 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                            <span className="text-slate-600 font-medium">
                              Đang xem trang <strong>{currentPubPage} / {totalPubPages}</strong>
                            </span>
                            <div className="flex flex-wrap items-center gap-1">
                              <button
                                type="button"
                                disabled={currentPubPage <= 1}
                                onClick={() => setPubJobPage(1)}
                                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                              >
                                « Đầu
                              </button>
                              <button
                                type="button"
                                disabled={currentPubPage <= 1}
                                onClick={() => setPubJobPage((p) => Math.max(1, p - 1))}
                                className="px-3 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                              >
                                ‹ Trang trước
                              </button>
                              {Array.from({ length: totalPubPages }, (_, idx) => idx + 1).map((pNum) => (
                                <button
                                  key={pNum}
                                  type="button"
                                  onClick={() => setPubJobPage(pNum)}
                                  className={`w-7 h-7 rounded-lg font-bold transition-colors ${
                                    pNum === currentPubPage
                                      ? "bg-blue-700 text-white"
                                      : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                  }`}
                                >
                                  {pNum}
                                </button>
                              ))}
                              <button
                                type="button"
                                disabled={currentPubPage >= totalPubPages}
                                onClick={() => setPubJobPage((p) => Math.min(totalPubPages, p + 1))}
                                className="px-3 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                              >
                                Trang sau ›
                              </button>
                              <button
                                type="button"
                                disabled={currentPubPage >= totalPubPages}
                                onClick={() => setPubJobPage(totalPubPages)}
                                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                              >
                                Cuối »
                              </button>
                            </div>
                          </div>
                        )}
                      </section>
                    );
                  })()}
                </div>
              )}

              {/* TAB 2: LỊCH XUẤT BẢN & HÀNG ĐỢI */}
              {activeTab === "schedule_queue" && (
                <div className="space-y-6">
                  {/* Phần 1: Nội dung đã duyệt sẵn sàng lên lịch mới */}
                  <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">
                        Bài viết đã duyệt sẵn sàng lên lịch mới ({ready.length})
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Các bài viết đã được phê duyệt phiên bản mới nhất, có thể đặt lịch xuất bản bổ sung lên kênh bất kỳ.
                      </p>
                    </div>
                    {ready.length === 0 ? (
                      <EmptyBlock
                        title="Chưa có bài mới chờ đặt lịch thủ công"
                        description="Các bài trong kế hoạch tự động đã được Worker xếp lịch. Bạn cũng có thể duyệt bài mới trong Review Queue."
                      />
                    ) : (
                      <ul className="space-y-2.5">
                        {ready.map((a) => (
                          <li key={a.id} className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900">{a.title}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {shortCode("ART", a.id)} · v{a.version} · {humanize(a.artifact_type)} · {agentLabel(a.role)}
                                </p>
                              </div>
                              {canEdit && scheduling !== a.id && (
                                <button
                                  type="button"
                                  onClick={() => setScheduling(a.id)}
                                  className="shrink-0 bg-blue-700 hover:bg-blue-800 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg cursor-pointer"
                                >
                                  Đặt lịch đăng
                                </button>
                              )}
                            </div>
                            {scheduling === a.id && (
                              <ScheduleForm
                                artifact={a}
                                channels={data.channels}
                                onScheduled={(job) => {
                                  setScheduling(null);
                                  setToast(`Đã lên lịch trên ${job.channel_name ?? job.platform_name} (${job.mode}).`);
                                  reload();
                                }}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>

                  {/* Phần 2: Bảng danh sách toàn bộ tác vụ xuất bản */}
                  <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 id="publishing-schedule-heading" className="text-sm font-semibold text-slate-900">
                          Danh sách tác vụ xuất bản ({filteredScheduleJobs.length} / {data.jobs.length})
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Phân tách rõ các bài đang hẹn giờ chờ đăng và các bài đã hoàn tất xuất bản.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(
                          [
                            { id: "all", label: `Tất cả (${data.jobs.length})` },
                            { id: "pending", label: `Chưa đăng / Hẹn giờ (${counts.scheduled})` },
                            { id: "published", label: `Đã đăng (${counts.published})` },
                            ...(counts.failed > 0 ? [{ id: "failed", label: `Lỗi (${counts.failed})` }] : []),
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                              setJobStatusFilter(tab.id as any);
                              setScheduleJobPage(1);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                              jobStatusFilter === tab.id
                                ? "bg-blue-700 text-white"
                                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                        <select
                          aria-label="Số tác vụ mỗi trang"
                          value={scheduleJobPageSize}
                          onChange={(e) => {
                            setScheduleJobPageSize(Number(e.target.value));
                            setScheduleJobPage(1);
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                        >
                          <option value={5}>5 dòng / trang</option>
                          <option value={8}>8 dòng / trang</option>
                          <option value={12}>12 dòng / trang</option>
                        </select>
                      </div>
                    </div>

                    {filteredScheduleJobs.length === 0 ? (
                      <p className="p-6 text-xs text-slate-500 text-center">
                        Không có tác vụ xuất bản nào khớp với bộ lọc hiện tại.
                      </p>
                    ) : (
                      (() => {
                        const totalSchedPages = Math.max(1, Math.ceil(filteredScheduleJobs.length / scheduleJobPageSize));
                        const currentSchedPage = Math.min(Math.max(1, scheduleJobPage), totalSchedPages);
                        const startIdx = (currentSchedPage - 1) * scheduleJobPageSize;
                        const pagedJobs = filteredScheduleJobs.slice(startIdx, startIdx + scheduleJobPageSize);

                        return (
                          <>
                            <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="text-slate-600">
                                Hiển thị <strong>{startIdx + 1}–{Math.min(startIdx + scheduleJobPageSize, filteredScheduleJobs.length)}</strong> / {filteredScheduleJobs.length} tác vụ (Trang <strong>{currentSchedPage}/{totalSchedPages}</strong>)
                              </span>
                              {totalSchedPages > 1 && (
                                <div className="flex flex-wrap items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={currentSchedPage <= 1}
                                    onClick={() => setScheduleJobPage((p) => Math.max(1, p - 1))}
                                    className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                                  >
                                    Trước
                                  </button>
                                  {Array.from({ length: totalSchedPages }, (_, idx) => idx + 1).map((pNum) => (
                                    <button
                                      key={pNum}
                                      type="button"
                                      onClick={() => setScheduleJobPage(pNum)}
                                      className={`w-7 h-7 rounded-lg font-semibold transition-colors ${
                                        pNum === currentSchedPage
                                          ? "bg-blue-700 text-white"
                                          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                      }`}
                                    >
                                      {pNum}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    disabled={currentSchedPage >= totalSchedPages}
                                    onClick={() => setScheduleJobPage((p) => Math.min(totalSchedPages, p + 1))}
                                    className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 font-semibold"
                                  >
                                    Sau
                                  </button>
                                </div>
                              )}
                            </div>

                            <div
                              tabIndex={0}
                              role="region"
                              aria-labelledby="publishing-schedule-heading"
                              className="overflow-x-auto"
                            >
                              <table className="w-full text-xs">
                                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                                  <tr>
                                    <th scope="col" className="text-left font-bold px-5 py-3">Nội dung bài viết</th>
                                    <th scope="col" className="text-left font-bold px-3 py-3">Kênh đích</th>
                                    <th scope="col" className="text-left font-bold px-3 py-3">Thời gian hẹn / đăng</th>
                                    <th scope="col" className="text-left font-bold px-3 py-3">Trạng thái</th>
                                    <th scope="col" className="text-right font-bold px-5 py-3">Thao tác</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {pagedJobs.map((job) => {
                                    const matchedMetric =
                                      job.status === "published"
                                        ? matchJobPostMetric(job, data.communityHub?.post_metrics)
                                        : undefined;
                                    return (
                                      <tr key={job.id} className="hover:bg-slate-50/60">
                                        <th scope="row" className="px-5 py-3.5 text-left font-normal">
                                          <p className="font-semibold text-slate-900">{job.content_title}</p>
                                          <p className="text-[11px] text-slate-500 mt-0.5">
                                            Phiên bản v{job.artifact_version ?? "?"}
                                            {job.utm_url && (
                                              <>
                                                {" · "}
                                                <a
                                                  href={job.utm_url}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="text-blue-700 font-semibold hover:underline"
                                                >
                                                  Mở liên kết bài đăng
                                                </a>
                                              </>
                                            )}
                                          </p>
                                        </th>
                                        <td className="px-3 py-3.5 text-slate-700">
                                          <span className="font-medium">
                                            {job.channel_name ?? (job.platform_name ? humanize(job.platform_name) : "Kênh")}
                                          </span>
                                          <span className="ml-1.5 text-[11px] text-slate-400">({job.mode})</span>
                                        </td>
                                        <td className="px-3 py-3.5 text-slate-600 whitespace-nowrap">
                                          {formatDateTime(job.published_at || job.scheduled_for)}
                                        </td>
                                        <td className="px-3 py-3.5">
                                          <span
                                            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md ${
                                              STATUS_STYLE[job.status] ?? STATUS_STYLE.scheduled
                                            }`}
                                          >
                                            {STATUS_LABEL_VI[job.status] ?? humanize(job.status)}
                                          </span>
                                          {matchedMetric && (
                                            <p className="mt-1 text-[11px] font-medium text-slate-600 whitespace-nowrap">
                                              Thích: {matchedMetric.likes_count} · Bình luận: {matchedMetric.comments_count} · Chia sẻ: {matchedMetric.shares_count}
                                            </p>
                                          )}
                                          {job.status === "failed" && job.error_message && (
                                            <p className="mt-1 text-[11px] text-rose-700 max-w-xs break-words">
                                              {job.error_message}
                                            </p>
                                          )}
                                          {job.published_at && (
                                            <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(job.published_at)}</p>
                                          )}
                                        </td>
                                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                                          {canEdit && (job.status === "scheduled" || job.status === "publishing") ? (
                                            <div className="flex justify-end gap-1.5">
                                              <button
                                                type="button"
                                                onClick={() => updateJob(job, "mark_published")}
                                                className="px-2.5 py-1 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold cursor-pointer"
                                              >
                                                Đánh dấu đã đăng
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => updateJob(job, "cancel")}
                                                className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                                              >
                                                Hủy lịch
                                              </button>
                                            </div>
                                          ) : job.utm_url ? (
                                            <a
                                              href={job.utm_url}
                                              target="_blank"
                                              rel="noreferrer"
                                              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 font-semibold hover:bg-slate-50 inline-block"
                                            >
                                              Xem bài đã đăng
                                            </a>
                                          ) : (
                                            <span className="text-slate-400">Đã hoàn tất</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </>
                        );
                      })()
                    )}
                  </section>
                </div>
              )}

              {/* TAB 3: KHO BÀI VIẾT AGENT ĐÃ SOẠN */}
              {activeTab === "generated_posts" && (
                <GeneratedPosts
                  artifacts={data.artifacts}
                  approvals={data.approvals}
                  jobs={data.jobs}
                  sitePosts={data.sitePosts}
                  facebook={data.facebook}
                  facebookGroup={data.facebookGroup}
                  websiteAutoPublish={data.websiteAutoPublish}
                />
              )}

              {/* TAB 4: KÊNH PHÂN PHỐI */}
              {activeTab === "channels" && (
                <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 max-w-3xl">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">
                      Danh sách kênh phân phối đang kết nối ({data.channels.length})
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Các kênh ở chế độ live sẽ được Worker tự động đăng khi đến giờ hẹn.
                    </p>
                  </div>
                  {data.channels.length === 0 && (
                    <p className="text-xs text-slate-500">Chưa có kênh phân phối nào.</p>
                  )}
                  <ul className="space-y-2">
                    {data.channels.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 p-3.5 rounded-lg border border-slate-200 bg-slate-50/50"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {c.display_name ?? (c.platform_name ? humanize(c.platform_name) : c.id)}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">
                            {c.platform_name ? humanize(c.platform_name) : "Channel"}
                            {c.channel_identifier ? ` · ${c.channel_identifier}` : ""}
                          </p>
                        </div>
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-md shrink-0 ${
                            c.publish_mode === "live"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {c.publish_mode === "live" ? "Tự động (live)" : "Thủ công (manual)"}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {canApprove && (
                    <AddChannelForm
                      onAdded={(c) => {
                        setToast(`Đã thêm kênh: ${c.display_name}`);
                        reload();
                      }}
                    />
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function DistributionClientView() {
  return (
    <AppShell activeTab="distribution" pageTitle="Distribution">
      <DistributionContent />
    </AppShell>
  );
}
