"use client";

import React from "react";
import type { MetricItem, WorkspaceReport } from "@/lib/apiTypes";
import { formatNumber, humanize } from "@/lib/format";

interface KpiMetricsRowProps {
  report: WorkspaceReport;
  previous: WorkspaceReport | null;
}

const ICONS: Record<string, React.ReactNode> = {
  sessions: (
    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  ),
  search_clicks: (
    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
    </svg>
  ),
  search_impressions: (
    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  leads_generated: (
    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="12" cy="12" r="9" strokeWidth="2" />
      <circle cx="12" cy="12" r="5" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  ),
  ad_spend: (
    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const METRICS: Array<{ key: string; label: string }> = [
  { key: "sessions", label: "Sessions" },
  { key: "search_clicks", label: "Organic Clicks" },
  { key: "search_impressions", label: "Search Impressions" },
  { key: "leads_generated", label: "Qualified Leads" },
  { key: "ad_spend", label: "Ad Spend" },
];

function formatValue(item: MetricItem): string {
  if (item.value === null) return "—";
  if (item.currency) return `${formatNumber(item.value)} ${item.currency}`;
  return formatNumber(item.value);
}

function changeText(current: MetricItem, previous: MetricItem | undefined): { text: string; tone: "up" | "down" | "flat" } | null {
  if (current.value === null || !previous || previous.availability !== "available" || previous.value === null) return null;
  if (previous.value === 0) return current.value === 0 ? { text: "0%", tone: "flat" } : null;
  const pct = ((current.value - previous.value) / previous.value) * 100;
  return { text: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, tone: pct > 0 ? "up" : pct < 0 ? "down" : "flat" };
}

export default function KpiMetricsRow({ report, previous }: KpiMetricsRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {METRICS.map(({ key, label }) => {
          const item = report.kpis[key];
          if (!item) return null;
          const prev = previous?.kpis[key];
          const change = changeText(item, prev);
          const available = item.availability === "available";
          return (
            <div
              key={key}
              className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-medium text-slate-600">{label}</span>
                <div className="w-7 h-7 rounded-lg bg-blue-50/80 flex items-center justify-center">{ICONS[key]}</div>
              </div>

              <div>
                <p className={`text-2xl font-black tracking-tight leading-none mb-2 ${available ? "text-slate-900" : "text-slate-300"}`}>
                  {formatValue(item)}
                </p>
                <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                  {available ? (
                    change ? (
                      <>
                        <span
                          className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded-md ${
                            change.tone === "up"
                              ? "text-emerald-600 bg-emerald-50"
                              : change.tone === "down"
                              ? "text-rose-600 bg-rose-50"
                              : "text-slate-600 bg-slate-100"
                          }`}
                        >
                          {change.tone === "up" ? "↑" : change.tone === "down" ? "↓" : "→"} {change.text}
                        </span>
                        <span className="text-slate-400">vs. {formatNumber(prev?.value)} prev.</span>
                      </>
                    ) : (
                      <span className="text-slate-400">No previous-period data</span>
                    )
                  ) : (
                    <span
                      className="inline-flex items-center font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md"
                      title={item.missing_reason ?? undefined}
                    >
                      {item.missing_reason === "NO_DATA_IN_RANGE"
                        ? "No data in range"
                        : `Not connected · ${humanize((item.missing_reason ?? item.availability).toLowerCase())}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-right pr-1">
        <span className="text-[10px] text-slate-400 italic">
          Report {report.period.from} → {report.period.to} · {report.period.timezone}
        </span>
      </div>
    </div>
  );
}
