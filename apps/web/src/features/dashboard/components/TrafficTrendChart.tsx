"use client";

import React from "react";
import type { MetricSeries, WorkspaceReport } from "@/lib/apiTypes";
import { formatNumber, humanize } from "@/lib/format";
import DailyBarChart from "./DailyBarChart";

/**
 * Xu hướng sessions theo ngày từ GET /metrics (metrics_snapshots). Chưa có snapshot nào
 * (GA4 chưa kết nối) thì hiển thị đúng trạng thái missing + lý do, không vẽ số giả.
 */
export default function TrafficTrendChart({ report, series }: { report: WorkspaceReport; series: MetricSeries }) {
  const sessions = report.kpis.sessions;
  const clicks = report.kpis.search_clicks;
  const leads = report.kpis.leads_generated;
  const hasData = series.availability === "available";
  const conversion =
    sessions?.value && leads?.value !== null && leads?.value !== undefined
      ? `${((leads.value / sessions.value) * 100).toFixed(2)}%`
      : "—";

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between h-full">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">Qualified Traffic Trend</h2>
            {sessions?.availability === "partial" && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                Partial data
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400">
            Sessions/day · {series.from} → {series.to}
          </span>
        </div>

        {hasData ? (
          <DailyBarChart series={series} />
        ) : (
          <div className="h-[180px] rounded-xl border border-dashed border-slate-200 bg-slate-50/60 flex flex-col items-center justify-center text-center px-6 gap-2">
            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
            <p className="text-xs font-bold text-slate-700">Traffic analytics not connected</p>
            <p className="text-[11px] text-slate-500 max-w-sm">
              {humanize((series.missing_reason ?? "no data source").toLowerCase())}. Connect GA4 and Search Console for
              this workspace to see the traffic trend.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50/70 p-3 rounded-xl border border-slate-200/60">
        <div>
          <span className="text-slate-500">Sessions: </span>
          <strong className="text-slate-800 font-semibold">{formatNumber(sessions?.value)}</strong>
        </div>
        <div className="hidden sm:block text-slate-300">·</div>
        <div>
          <span className="text-slate-500">Search clicks: </span>
          <strong className="text-slate-800 font-semibold">{formatNumber(clicks?.value)}</strong>
        </div>
        <div className="hidden sm:block text-slate-300">·</div>
        <div>
          <span className="text-slate-500">Leads: </span>
          <strong className="text-slate-800 font-semibold">{formatNumber(leads?.value)}</strong>
        </div>
        <div className="hidden sm:block text-slate-300">·</div>
        <div>
          <span className="text-slate-500">Conversion rate: </span>
          <strong className="text-slate-800 font-semibold">{conversion}</strong>
        </div>
      </div>
    </div>
  );
}
