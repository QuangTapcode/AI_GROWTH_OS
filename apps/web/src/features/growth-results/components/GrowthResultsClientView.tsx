"use client";

import React, { useState } from "react";
import AppShell from "@/features/shell/AppShell";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";
import { ErrorBlock, LoadingBlock } from "@/features/shell/StatusViews";
import KpiMetricsRow from "@/features/dashboard/components/KpiMetricsRow";
import DailyBarChart from "@/features/dashboard/components/DailyBarChart";
import { growthApi } from "@/lib/api";
import type { Lead } from "@/lib/apiTypes";
import { formatDateTime, humanize, toIsoDate } from "@/lib/format";
import { useApiData } from "@/lib/useApiData";

const RANGES = [7, 30, 90] as const;
const DAY_MS = 86_400_000;

function periodRange(days: number, offsetPeriods = 0) {
  const end = new Date(Date.now() - offsetPeriods * days * DAY_MS);
  return { from: toIsoDate(new Date(end.getTime() - (days - 1) * DAY_MS)), to: toIsoDate(end) };
}

const LEAD_STATUS_STYLE: Record<Lead["lead_status"], string> = {
  New: "bg-blue-50 text-blue-700 border-blue-200",
  Assigned: "bg-sky-50 text-sky-700 border-sky-200",
  Contacted: "bg-amber-50 text-amber-700 border-amber-200",
  Converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Archived: "bg-slate-50 text-slate-500 border-slate-200",
};

function GrowthResultsContent() {
  const { workspace } = useWorkspace();
  const [rangeDays, setRangeDays] = useState<(typeof RANGES)[number]>(30);
  const { data, error, loading, reload } = useApiData(`${workspace.id}:${rangeDays}`, async (signal) => {
    const range = periodRange(rangeDays);
    const [report, previous, sessions, leads, jobs] = await Promise.all([
      growthApi.getReport(workspace.id, range, signal),
      growthApi.getReport(workspace.id, periodRange(rangeDays, 1), signal),
      growthApi.getMetricSeries(workspace.id, "sessions", range, signal),
      growthApi.listLeads(workspace.id, signal),
      growthApi.listPublishingJobs(workspace.id, signal),
    ]);
    return { report, previous, sessions, leads: leads.items, jobs: jobs.items };
  });

  const published = data?.jobs.filter((j) => j.status === "published") ?? [];
  const leadsByTopic = new Map<string, number>();
  for (const lead of data?.leads ?? []) leadsByTopic.set(lead.interest_topic, (leadsByTopic.get(lead.interest_topic) ?? 0) + 1);

  return (
    <main className="flex-1 p-6 lg:p-8 space-y-6 max-w-[1600px] w-full mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">Growth Results</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Leads captured by the pilot site, traffic from connected analytics, and what has been published.
          </p>
        </div>
        <select
          value={rangeDays}
          onChange={(e) => setRangeDays(Number(e.target.value) as (typeof RANGES)[number])}
          className="bg-white border border-slate-200/90 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs cursor-pointer"
          aria-label="Report period"
        >
          {RANGES.map((d) => (
            <option key={d} value={d}>
              Last {d} days
            </option>
          ))}
        </select>
      </div>

      {error && <ErrorBlock error={error} onRetry={reload} />}
      {!data && loading && <LoadingBlock label="Loading growth results…" />}

      {data && (
        <>
          <KpiMetricsRow report={data.report} previous={data.previous} />

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <section className="xl:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
              <h2 className="text-sm font-bold text-slate-900">Sessions per day</h2>
              <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
                {data.sessions.from} → {data.sessions.to} · source: {data.sessions.provider.toUpperCase()}
              </p>
              {data.sessions.availability === "available" ? (
                <DailyBarChart series={data.sessions} height={220} />
              ) : (
                <div className="h-[220px] rounded-xl border border-dashed border-slate-200 bg-slate-50/60 flex flex-col items-center justify-center text-center px-6">
                  <p className="text-xs font-bold text-slate-700">No traffic data</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {humanize((data.sessions.missing_reason ?? "not connected").toLowerCase())}.
                  </p>
                </div>
              )}
            </section>

            <section className="xl:col-span-5 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Leads by interest</h2>
                <ul className="mt-3 space-y-2">
                  {[...leadsByTopic.entries()].map(([topic, count]) => (
                    <li key={topic} className="flex items-center gap-3 text-xs">
                      <span className="w-28 text-slate-600 truncate">{humanize(topic)}</span>
                      <span className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <span className="block bg-blue-600 h-2" style={{ width: `${(count / Math.max(1, data.leads.length)) * 100}%` }} />
                      </span>
                      <span className="w-6 text-right font-bold text-slate-800">{count}</span>
                    </li>
                  ))}
                  {leadsByTopic.size === 0 && <li className="text-xs text-slate-400">No leads yet.</li>}
                </ul>
              </div>
              <div className="pt-3 border-t border-slate-100">
                <h2 className="text-sm font-bold text-slate-900">Published content</h2>
                <p className="text-2xl font-black text-slate-900 mt-1">{published.length}</p>
                <ul className="mt-2 space-y-1">
                  {published.slice(0, 5).map((j) => (
                    <li key={j.id} className="text-[11px] text-slate-600 truncate">
                      {j.content_title} · {j.channel_name ?? j.platform_name}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </div>

          <section className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-6 pb-3">
              <h2 className="text-sm font-bold text-slate-900">Leads</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">{data.leads.length} leads from the pilot site form (all time)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="text-left font-bold px-6 py-2.5">Contact</th>
                    <th className="text-left font-bold px-3 py-2.5">Interest</th>
                    <th className="text-left font-bold px-3 py-2.5">Source</th>
                    <th className="text-left font-bold px-3 py-2.5">Status</th>
                    <th className="text-left font-bold px-6 py-2.5">Captured</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.leads.map((lead) => (
                    <tr key={lead.id}>
                      <td className="px-6 py-3">
                        <p className="font-semibold text-slate-900">{lead.name}</p>
                        <p className="text-[11px] text-slate-500">{lead.email}</p>
                      </td>
                      <td className="px-3 py-3 text-slate-700">{humanize(lead.interest_topic)}</td>
                      <td className="px-3 py-3 text-slate-600">
                        {[lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(" / ") || "direct"}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${LEAD_STATUS_STYLE[lead.lead_status] ?? LEAD_STATUS_STYLE.New}`}>
                          {lead.lead_status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{formatDateTime(lead.captured_at)}</td>
                    </tr>
                  ))}
                  {data.leads.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-6 text-center text-slate-400">
                        No leads yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default function GrowthResultsClientView() {
  return (
    <AppShell activeTab="growth-results" pageTitle="Growth Results">
      <GrowthResultsContent />
    </AppShell>
  );
}
