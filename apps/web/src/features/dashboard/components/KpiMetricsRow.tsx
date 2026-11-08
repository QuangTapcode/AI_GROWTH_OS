"use client";

import React from "react";
import Link from "next/link";
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

const FACEBOOK_ICON = (
  <svg className="w-4 h-4 text-blue-600" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" />
  </svg>
);
ICONS.fb_followers = FACEBOOK_ICON;
ICONS.fb_posts = (
  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l6 6v8a2 2 0 01-2 2zM7 9h5M7 13h10M7 17h10" />
  </svg>
);
ICONS.fb_engagements = (
  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
  </svg>
);
ICONS.fb_conversations = (
  <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
  </svg>
);

/** Channels the workspace owns (Facebook Page) and internal leads always come first. */
const PRIMARY_METRICS: Array<{ key: string; label: string }> = [
  { key: "fb_followers", label: "Page Followers" },
  { key: "fb_posts", label: "Posts Published" },
  { key: "fb_engagements", label: "Post Engagement" },
  { key: "fb_conversations", label: "Messenger Chats" },
  { key: "leads_generated", label: "Qualified Leads" },
];

/** External sources: shown as a tile only once their connector returns data. */
const EXTERNAL_METRICS: Array<{ key: string; label: string; source: string }> = [
  { key: "sessions", label: "Sessions", source: "Google Analytics 4" },
  { key: "search_clicks", label: "Organic Clicks", source: "Search Console" },
  { key: "search_impressions", label: "Search Impressions", source: "Search Console" },
  { key: "ad_spend", label: "Ad Spend", source: "Meta Ads" },
];

const NOT_CONFIGURED = new Set(["GOOGLE_CREDENTIALS_NOT_CONFIGURED", "PROPERTY_NOT_VERIFIED", "META_ADS_ACCESS_MISSING"]);

function isUnconfigured(item: MetricItem | undefined): boolean {
  return !item || (item.availability === "missing" && NOT_CONFIGURED.has(item.missing_reason ?? ""));
}

function missingLabel(item: MetricItem): string {
  switch (item.missing_reason) {
    case "NO_DATA_IN_RANGE":
      return "No data in range";
    case "CURRENT_SNAPSHOT_ONLY":
      return "Current count only";
    case "FACEBOOK_API_ERROR":
      return "Facebook API error";
    default:
      return `Not connected · ${humanize((item.missing_reason ?? item.availability).toLowerCase())}`;
  }
}

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
  const metrics = [
    ...PRIMARY_METRICS.filter(({ key }) => report.kpis[key]),
    ...EXTERNAL_METRICS.filter(({ key }) => !isUnconfigured(report.kpis[key])),
  ];
  const pendingSources = [
    ...new Set(EXTERNAL_METRICS.filter(({ key }) => isUnconfigured(report.kpis[key])).map(({ source }) => source)),
  ];
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {metrics.map(({ key, label }) => {
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
                      {missingLabel(item)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap px-1">
        {pendingSources.length > 0 ? (
          <span className="text-[11px] text-slate-500">
            Not connected yet: {pendingSources.join(" · ")} —{" "}
            <Link href="/workspace-integrations" className="font-semibold text-blue-600 hover:underline">
              connect in Workspace &amp; Integrations
            </Link>
          </span>
        ) : (
          <span />
        )}
        <span className="text-[10px] text-slate-400 italic">
          Report {report.period.from} → {report.period.to} · {report.period.timezone}
        </span>
      </div>
    </div>
  );
}
