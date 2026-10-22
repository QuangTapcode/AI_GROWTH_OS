"use client";

import React, { useMemo, useState } from "react";
import AppShell from "@/features/shell/AppShell";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";
import { EmptyBlock, ErrorBlock, LoadingBlock, Toast } from "@/features/shell/StatusViews";
import { latestApproval } from "@/features/artifacts/adapters";
import { ApiError, growthApi } from "@/lib/api";
import type { Channel, ContentArtifact, PublishingJob } from "@/lib/apiTypes";
import { agentLabel, formatDateTime, humanize, shortCode, timeAgo } from "@/lib/format";
import { useApiData } from "@/lib/useApiData";

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
          {(["website", "facebook", "tiktok", "instagram", "linkedin", "email"] as const).map((p) => (
            <option key={p} value={p}>
              {humanize(p)}
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
  const { data, error, loading, reload } = useApiData(workspace.id, async (signal) => {
    const [channels, jobs, artifacts, approvals] = await Promise.all([
      growthApi.listChannels(workspace.id, signal),
      growthApi.listPublishingJobs(workspace.id, signal),
      growthApi.listArtifacts(workspace.id, signal),
      growthApi.listApprovals(workspace.id, signal),
    ]);
    return { channels: channels.items, jobs: jobs.items, artifacts: artifacts.items, approvals: approvals.items };
  });

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
          <div className="xl:col-span-8 space-y-6">
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

            <section className={`${card} overflow-hidden`}>
              <div className="p-6 pb-3">
                <h2 className="text-sm font-bold text-slate-900">Publishing schedule</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{data.jobs.length} jobs</p>
              </div>
              {data.jobs.length === 0 ? (
                <p className="px-6 pb-6 text-xs text-slate-400">No publishing jobs yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="text-left font-bold px-6 py-2.5">Content</th>
                        <th className="text-left font-bold px-3 py-2.5">Channel</th>
                        <th className="text-left font-bold px-3 py-2.5">Scheduled</th>
                        <th className="text-left font-bold px-3 py-2.5">Status</th>
                        <th className="text-right font-bold px-6 py-2.5">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.jobs.map((job) => (
                        <tr key={job.id}>
                          <td className="px-6 py-3">
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
                          </td>
                          <td className="px-3 py-3 text-slate-700">
                            {job.channel_name ?? humanize(job.platform_name)}
                            <span className="ml-1.5 text-[10px] text-slate-400">{job.mode}</span>
                          </td>
                          <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{formatDateTime(job.scheduled_for)}</td>
                          <td className="px-3 py-3">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[job.status] ?? STATUS_STYLE.scheduled}`}>
                              {humanize(job.status)}
                            </span>
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
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div className="xl:col-span-4">
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
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${
                        c.publish_mode === "live" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
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
