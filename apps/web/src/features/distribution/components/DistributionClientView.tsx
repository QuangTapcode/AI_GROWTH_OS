"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/features/shell/AppShell";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";
import { EmptyBlock, ErrorBlock, LoadingBlock, Toast } from "@/features/shell/StatusViews";
import { latestApproval } from "@/features/artifacts/adapters";
import { ApiError, apiRequest, growthApi } from "@/lib/api";
import GeneratedPosts, { type SitePost } from "./GeneratedPosts";
import TikTokVideoStudio from "./TikTokVideoStudio";
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

const card = "bg-white rounded-2xl border border-slate-200/80 shadow-xs";
const input =
  "w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";

const STATUS_STYLE: Record<PublishingJob["status"], string> = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  publishing: "bg-sky-50 text-sky-700 border-sky-200",
  published: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-slate-50 text-slate-500 border-slate-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
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
      setError(errorText(err, "Could not schedule this item."));
    } finally {
      setSaving(false);
    }
  };

  if (channels.length === 0) {
    return <p className="text-[11px] text-slate-400">Add a channel first to schedule this item.</p>;
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end mt-3">
      <label className="space-y-1">
        <span className="text-[10px] font-semibold text-slate-500">Channel</span>
        <select className={input} value={channelId} onChange={(e) => setChannelId(e.target.value)}>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.display_name ?? humanize(c.platform_name)} ({c.publish_mode})
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-[10px] font-semibold text-slate-500">Publish at</span>
        <input className={input} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </label>
      <label className="space-y-1">
        <span className="text-[10px] font-semibold text-slate-500">utm_campaign (optional)</span>
        <input className={input} value={campaign} placeholder="cv-seo-q4" onChange={(e) => setCampaign(e.target.value)} />
      </label>
      <button
        type="submit"
        disabled={saving || !channelId}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-4 py-2 rounded-xl cursor-pointer disabled:opacity-60"
      >
        {saving ? "Scheduling…" : "Schedule"}
      </button>
      {error && <p className="sm:col-span-4 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
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
    if (!name.trim()) return setError("Channel name is required.");
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
      setError(errorText(err, "Could not add the channel."));
    }
  };

  return (
    <form onSubmit={submit} className="space-y-2 pt-3 border-t border-slate-100">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Add channel</p>
      <div className="grid grid-cols-3 gap-2">
        <select className={input} value={platform} onChange={(e) => setPlatform(e.target.value as Channel["platform_name"])}>
          {(["website", "facebook_group", "facebook", "tiktok", "instagram", "linkedin", "email"] as const).map((p) => (
            <option key={p} value={p}>
              {p === "facebook_group" ? "Facebook Group" : humanize(p)}
            </option>
          ))}
        </select>
        <input className={input} placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={input} placeholder="URL / handle" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
      </div>
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <button type="submit" className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3.5 py-1.5 rounded-xl cursor-pointer">
        Add channel
      </button>
    </form>
  );
}

function DistributionContent() {
  const { workspace, canEdit, canApprove } = useWorkspace();
  const [toast, setToast] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [syncingStats, setSyncingStats] = useState(false);
  const [publishedDateFilter, setPublishedDateFilter] = useState<string>("");
  const { data, error, loading, reload } = useApiData(workspace.id, async (signal) => {
    const [channels, jobs, artifacts, approvals, integrations, automation, sitePosts, communityHub, tikTok] = await Promise.all([
      growthApi.listChannels(workspace.id, signal),
      growthApi.listPublishingJobs(workspace.id, signal),
      growthApi.listArtifacts(workspace.id, signal),
      growthApi.listApprovals(workspace.id, signal),
      growthApi.getIntegrations(workspace.id, signal),
      apiRequest<{ settings: { auto_publish_website?: boolean } | null }>(`/workspaces/${workspace.id}/automation`, { signal }),
      apiRequest<{ items: SitePost[] }>(`/workspaces/${workspace.id}/site-posts`, { signal }),
      apiRequest<DistributionHubSummary>(`/workspaces/${workspace.id}/community/hub`, { signal }).catch(() => null),
      growthApi.listTikTokVideos(workspace.id, signal).catch(() => ({
        connection: {
          connected: false,
          expired: false,
          open_id: null,
          display_name: null,
          avatar_url: null,
          scopes: [],
          expires_at: null,
          refresh_expires_at: null,
          sandbox_privacy_default: "SELF_ONLY" as const,
        },
        items: [],
      })),
    ]);
    const facebook = integrations.providers.find((p) => p.provider === "facebook_page");
    const facebookGroup = integrations.providers.find((p) => p.provider === "facebook_group");
    return {
      channels: channels.items, jobs: jobs.items, artifacts: artifacts.items, approvals: approvals.items,
      facebook: { connected: facebook?.status === "connected", reason: facebook?.missing_reason ?? null },
      facebookGroup: { connected: facebookGroup?.status === "connected", reason: facebookGroup?.missing_reason ?? null },
      websiteAutoPublish: automation.settings?.auto_publish_website === true, sitePosts: sitePosts.items,
      communityHub,
      tikTokConnection: tikTok.connection,
      tikTokVideos: tikTok.items,
    };
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tt = params.get("tiktok");
    const ttName = params.get("tiktok_name");
    const ttError = params.get("tiktok_error");
    if (tt !== "connected" && !ttError) return;

    const message =
      tt === "connected"
        ? `Đã kết nối tài khoản TikTok thành công${ttName ? ` (${ttName})` : ""}.`
        : `Lỗi kết nối TikTok: ${ttError}`;

    const timer = window.setTimeout(() => {
      setToast(message);
      params.delete("tiktok");
      params.delete("tiktok_name");
      params.delete("tiktok_error");
      const nextSearch = params.toString();
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

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
          ? `Đã đồng bộ ${r.group_posts_synced + r.fanpage_posts_synced} bài: ${r.total_likes} Likes · ${r.total_comments} Comments · ${r.total_shares} Chia sẻ.`
          : "Đã đồng bộ thống kê tương tác bài viết."
      );
      reload();
    } catch (err) {
      setToast(errorText(err, "Không thể đồng bộ thống kê bài viết."));
    } finally {
      setSyncingStats(false);
    }
  };

  // Chỉ artifact có approval mới nhất = approved và khớp đúng version + hash (cùng quy tắc với BE)
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
      const answer = window.prompt("Post URL or ID on the channel (optional):", "");
      if (answer === null) return;
      externalId = answer.trim() || null;
    }
    try {
      await growthApi.updatePublishingJob(
        workspace.id,
        job.id,
        action === "cancel" ? { action } : { action, external_post_id: externalId }
      );
      setToast(action === "cancel" ? "Publishing job cancelled." : "Marked as published.");
      reload();
    } catch (err) {
      setToast(errorText(err, "Could not update the job."));
    }
  };

  const counts = {
    scheduled: data?.jobs.filter((j) => j.status === "scheduled" || j.status === "publishing").length ?? 0,
    published: data?.jobs.filter((j) => j.status === "published").length ?? 0,
  };

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

  return (
    <main className="flex-1 p-6 lg:p-8 space-y-6 max-w-[1600px] w-full mx-auto">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Distribution</h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 border border-slate-200/90 text-slate-600">
              {workspace.name}
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Schedule approved outputs to channels. Channels without a live connector run in manual mode: post it, then mark it published.
          </p>
        </div>
        {data && (
          <div className="flex items-center gap-4 bg-white border border-slate-200/90 rounded-2xl px-4 py-2 shadow-2xs text-xs font-semibold text-slate-700">
            <span>{ready.length} ready</span>
            <span className="text-slate-200">|</span>
            <span>{counts.scheduled} scheduled</span>
            <span className="text-slate-200">|</span>
            <span>{counts.published} published</span>
          </div>
        )}
      </div>

      {error && <ErrorBlock error={error} onRetry={reload} />}
      {!data && loading && <LoadingBlock label="Loading distribution…" />}

      {data && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-8 min-w-0 space-y-6">
            {data.communityHub?.stats && (
              <section className={`${card} p-5 border-rose-200/80 bg-gradient-to-r from-rose-50/50 via-white to-emerald-50/40`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-[1_1_420px] space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase">
                        📊 Thống kê Tương tác &amp; Phát triển
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600">
                        {data.communityHub.stats.tracked_posts_count ?? 0} bài đã đồng bộ
                      </span>
                      {data.communityHub.group?.last_post_stats_sync_at && (
                        <span className="text-[11px] text-slate-400">
                          • Lúc {formatDateTime(data.communityHub.group.last_post_stats_sync_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                      <span className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-800">
                        ❤️ {data.communityHub.stats.total_post_likes ?? 0} Likes
                      </span>
                      <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-800">
                        💬 {data.communityHub.stats.total_post_comments ?? 0} Comments
                      </span>
                      <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-800">
                        ↗️ {data.communityHub.stats.total_post_shares ?? 0} Chia sẻ
                      </span>
                      <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-indigo-800">
                        👥 {data.communityHub.stats.real_group_members ?? 5} thành viên (
                        {(data.communityHub.stats.member_growth_delta ?? 0) >= 0
                          ? `+${data.communityHub.stats.member_growth_delta ?? 0}`
                          : data.communityHub.stats.member_growth_delta}
                        )
                      </span>
                      <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                        📈 Biến động tương tác:{" "}
                        {(data.communityHub.stats.engagement_growth_delta ?? 0) >= 0
                          ? `+${data.communityHub.stats.engagement_growth_delta ?? 0}`
                          : data.communityHub.stats.engagement_growth_delta}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canEdit && (
                      <button
                        type="button"
                        disabled={syncingStats}
                        onClick={() => void handleSyncPostStats()}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                      >
                        {syncingStats ? "Đang đồng bộ…" : "📊 Đồng bộ Like, Comment, Share"}
                      </button>
                    )}
                    <Link
                      href="/agents/community"
                      className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 text-xs font-bold"
                    >
                      👥 Chi tiết Stats &amp; Auto-Reply ↗
                    </Link>
                  </div>
                </div>
              </section>
            )}

            <section className={`${card} p-6 border-emerald-200/90 bg-emerald-50/20`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    📚 Các bài đã đăng theo Ngày / Tháng / Năm ({counts.published} bài)
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Toàn bộ bài đã xuất bản lên Group Cộng đồng, Website và Fanpage được lưu cố định theo ngày tháng năm, không bị ẩn.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    aria-label="Lọc bài đã đăng theo ngày tháng năm"
                    className={input}
                    value={publishedDateFilter}
                    onChange={(e) => setPublishedDateFilter(e.target.value)}
                  />
                  {publishedDateFilter && (
                    <button
                      type="button"
                      onClick={() => setPublishedDateFilter("")}
                      className="px-2.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-xs font-semibold"
                    >
                      Xóa lọc
                    </button>
                  )}
                </div>
              </div>

              {publishedJobsByDate.length === 0 ? (
                <p className="text-xs text-slate-500 bg-white rounded-xl border border-slate-200/80 p-4">
                  Không có bài đã đăng nào trong ngày đã chọn.
                </p>
              ) : (
                <div className="space-y-4">
                  {publishedJobsByDate.map(([dateLabel, jobsOnDate]) => (
                    <div key={dateLabel} className="rounded-xl border border-emerald-200/80 bg-white p-4 space-y-2.5">
                      <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                        <span className="px-2.5 py-0.5 rounded-lg bg-emerald-700 text-white text-xs font-bold">
                          📅 Ngày {dateLabel}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-800">
                          {jobsOnDate.length} bài đã đăng
                        </span>
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {jobsOnDate.map((job) => {
                          const matchedMetric = matchJobPostMetric(job, data.communityHub?.post_metrics);
                          return (
                            <li key={job.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-slate-900 break-words">{job.content_title}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {job.channel_name ?? humanize(job.platform_name)} · Đăng lúc{" "}
                                  {formatDateTime(job.published_at || job.scheduled_for)}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {matchedMetric && (
                                  <span className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-900">
                                    ❤️ {matchedMetric.likes_count} · 💬 {matchedMetric.comments_count} · ↗️{" "}
                                    {matchedMetric.shares_count}
                                  </span>
                                )}
                                {job.utm_url && (
                                  <a
                                    href={job.utm_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-semibold hover:bg-blue-100"
                                  >
                                    Xem bài đã đăng ↗
                                  </a>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <GeneratedPosts artifacts={data.artifacts} approvals={data.approvals} jobs={data.jobs} sitePosts={data.sitePosts}
              facebook={data.facebook} facebookGroup={data.facebookGroup} websiteAutoPublish={data.websiteAutoPublish} />

            <TikTokVideoStudio
              workspaceId={workspace.id}
              canEdit={canEdit}
              connection={data.tikTokConnection}
              videos={data.tikTokVideos}
              artifacts={data.artifacts}
              onToast={setToast}
              onReload={reload}
            />
            <section className={`${card} p-6`}>
              <h2 className="text-sm font-bold text-slate-900">Ready to publish</h2>
              <p className="text-[11px] text-slate-400 mt-0.5 mb-4">Artifacts whose exact current version was approved by an owner.</p>
              {ready.length === 0 ? (
                <EmptyBlock title="Nothing approved yet" description="Approve an output in the Review Queue to make it available here." />
              ) : (
                <ul className="space-y-3">
                  {ready.map((a) => (
                    <li key={a.id} className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/40">
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
                            className="shrink-0 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3.5 py-1.5 rounded-xl cursor-pointer"
                          >
                            Schedule
                          </button>
                        )}
                      </div>
                      {scheduling === a.id && (
                        <ScheduleForm
                          artifact={a}
                          channels={data.channels}
                          onScheduled={(job) => {
                            setScheduling(null);
                            setToast(`Scheduled on ${job.channel_name ?? job.platform_name} (${job.mode}).`);
                            reload();
                          }}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={`${card} min-w-0`}>
              <div className="p-6 pb-3">
                <h2 id="publishing-schedule-heading" className="text-sm font-bold text-slate-900">Publishing schedule</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{data.jobs.length} jobs</p>
              </div>
              {data.jobs.length === 0 ? (
                <p className="px-6 pb-6 text-xs text-slate-400">No publishing jobs yet.</p>
              ) : (
                <div
                  tabIndex={0}
                  role="region"
                  aria-labelledby="publishing-schedule-heading"
                  className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-b-2xl"
                >
                  <table className="w-full text-xs">
                    <caption className="visually-hidden">Publishing schedule jobs and post engagement metrics</caption>
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                      <tr>
                        <th scope="col" className="text-left font-bold px-6 py-2.5">Content</th>
                        <th scope="col" className="text-left font-bold px-3 py-2.5">Channel</th>
                        <th scope="col" className="text-left font-bold px-3 py-2.5">Scheduled</th>
                        <th scope="col" className="text-left font-bold px-3 py-2.5">Status</th>
                        <th scope="col" className="text-right font-bold px-6 py-2.5">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.jobs.map((job) => {
                        const matchedMetric =
                          job.status === "published"
                            ? matchJobPostMetric(job, data.communityHub?.post_metrics)
                            : undefined;
                        return (
                        <tr key={job.id}>
                          <th scope="row" className="px-6 py-3 text-left font-normal">
                            <p className="font-semibold text-slate-900">{job.content_title}</p>
                            <p className="text-[11px] text-slate-400">
                              v{job.artifact_version ?? "?"}
                              {job.utm_url && (
                                <>
                                  {" · "}
                                  <a href={job.utm_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                                    tracking link
                                  </a>
                                </>
                              )}
                            </p>
                          </th>
                          <td className="px-3 py-3 text-slate-700">
                            {job.channel_name ?? humanize(job.platform_name)}
                            <span className="ml-1.5 text-[10px] text-slate-400">{job.mode}</span>
                          </td>
                          <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{formatDateTime(job.scheduled_for)}</td>
                          <td className="px-3 py-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[job.status] ?? STATUS_STYLE.scheduled}`}>
                              {humanize(job.status)}
                            </span>
                            {matchedMetric && (
                              <p className="mt-1 text-[10px] font-bold text-rose-800 whitespace-nowrap">
                                ❤️ {matchedMetric.likes_count} · 💬 {matchedMetric.comments_count} · ↗️ {matchedMetric.shares_count}
                              </p>
                            )}
                            {job.status === "failed" && job.error_message && (
                              <p className="mt-1 text-[10px] text-rose-700 max-w-xs break-words">{job.error_message}</p>
                            )}
                            {job.status === "published" && job.external_post_id && (
                              <p className="mt-1 text-[10px] text-slate-500 font-mono truncate max-w-[160px]" title={job.external_post_id}>
                                ID: {job.external_post_id}
                              </p>
                            )}
                            {job.published_at && <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(job.published_at)}</p>}
                          </td>
                          <td className="px-6 py-3 text-right whitespace-nowrap">
                            {canEdit && (job.status === "scheduled" || job.status === "publishing") ? (
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => updateJob(job, "mark_published")}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                                >
                                  Mark published
                                </button>
                                <button
                                  type="button"
                                  onClick={() => updateJob(job, "cancel")}
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div className="xl:col-span-4 min-w-0">
            <section className={`${card} p-6 space-y-3`}>
              <h2 className="text-sm font-bold text-slate-900">Channels</h2>
              {data.channels.length === 0 && <p className="text-xs text-slate-400">No channels yet.</p>}
              <ul className="space-y-2">
                {data.channels.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/40">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{c.display_name ?? humanize(c.platform_name)}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {humanize(c.platform_name)}
                        {c.channel_identifier ? ` · ${c.channel_identifier}` : ""}
                      </p>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${c.publish_mode === "live" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                        }`}
                    >
                      {c.publish_mode}
                    </span>
                  </li>
                ))}
              </ul>
              {canApprove && (
                <AddChannelForm
                  onAdded={(c) => {
                    setToast(`Channel added: ${c.display_name}`);
                    reload();
                  }}
                />
              )}
            </section>
          </div>
        </div>
      )}
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
