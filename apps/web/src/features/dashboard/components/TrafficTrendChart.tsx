"use client";

import React, { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function TrafficTrendChart() {
  const { language, t } = useLanguage();
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("daily");

  const timeframeLabels: Record<"daily" | "weekly" | "monthly", string> = {
    daily: t.dashboard.chart.daily,
    weekly: t.dashboard.chart.weekly,
    monthly: t.dashboard.chart.monthly,
  };

  const monthPrefix = language === "vi" ? "Th10 " : "Oct ";
  const nextMonthPrefix = language === "vi" ? "Th11 " : "Nov ";

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
      {/* Top Header */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              {t.dashboard.chart.title}
            </h2>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full">
              {t.dashboard.chart.vsPrev}
            </span>
          </div>

          {/* Timeframe switch */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center text-xs font-semibold text-slate-600 border border-slate-200/70">
            {(["daily", "weekly", "monthly"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTimeframe(key)}
                className={`px-3.5 py-1 rounded-lg transition-all capitalize cursor-pointer ${
                  timeframe === key
                    ? "bg-white text-blue-600 font-bold shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {timeframeLabels[key]}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-6 text-xs text-slate-500 mb-6 font-medium">
          <div className="flex items-center gap-2">
            <span className="w-4 h-1.5 bg-blue-600 rounded-full" />
            <span className="font-semibold text-slate-700">{t.dashboard.chart.currentPeriod}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-slate-400" />
            <span className="text-slate-500">{t.dashboard.chart.previous30Days}</span>
          </div>
        </div>

        {/* Chart SVG Canvas */}
        <div className="relative w-full h-[220px] px-2">
          {/* Floating Peak Tooltip */}
          <div className="absolute -top-1 right-[22%] xl:right-[26%] bg-slate-900 text-white rounded-xl px-3 py-2 text-center shadow-2xl border border-slate-700/80 z-10 pointer-events-none">
            <p className="text-[11px] text-slate-300 font-medium leading-tight">
              {language === "vi" ? "28 Th10 · Đỉnh điểm" : "Oct 28 · Peak"}
            </p>
            <p className="text-xs font-bold leading-tight mt-1">
              524 {t.dashboard.chart.visits}{" "}
              <span className="text-emerald-400 font-bold">(+22%)</span>
            </p>
            <div className="w-2.5 h-2.5 bg-slate-900 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2 border-r border-b border-slate-700/80" />
          </div>

          <svg viewBox="0 0 540 180" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.20" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid horizontal lines */}
            <line x1="36" y1="20" x2="520" y2="20" stroke="#f1f5f9" strokeWidth="1" />
            <line x1="36" y1="55" x2="520" y2="55" stroke="#f1f5f9" strokeWidth="1" />
            <line x1="36" y1="90" x2="520" y2="90" stroke="#f1f5f9" strokeWidth="1" />
            <line x1="36" y1="125" x2="520" y2="125" stroke="#f1f5f9" strokeWidth="1" />
            <line x1="36" y1="160" x2="520" y2="160" stroke="#f1f5f9" strokeWidth="1" />

            {/* Y Axis text (min 12px font) */}
            <text x="6" y="24" fill="#64748b" fontSize="12" fontWeight="600">12k</text>
            <text x="6" y="59" fill="#64748b" fontSize="12" fontWeight="600">9k</text>
            <text x="6" y="94" fill="#64748b" fontSize="12" fontWeight="600">6k</text>
            <text x="6" y="129" fill="#64748b" fontSize="12" fontWeight="600">3k</text>
            <text x="14" y="163" fill="#64748b" fontSize="12" fontWeight="600">0</text>

            {/* Peak vertical indicator line */}
            <line
              x1="390"
              y1="40"
              x2="390"
              y2="160"
              stroke="#2563eb"
              strokeWidth="1.5"
              strokeDasharray="4 3"
              opacity="0.6"
            />

            {/* Previous 30 days line (dashed) */}
            <path
              d="M40 148 Q 90 142, 130 136 T 220 128 T 310 115 T 400 102 T 500 88"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2"
              strokeDasharray="5 4"
              opacity="0.75"
            />

            {/* Current period area fill */}
            <path
              d="M40 138 Q 90 130, 130 118 T 220 105 T 310 82 T 390 48 T 500 32 L 500 160 L 40 160 Z"
              fill="url(#trafficGradient)"
            />

            {/* Current period stroke line */}
            <path
              d="M40 138 Q 90 130, 130 118 T 220 105 T 310 82 T 390 48 T 500 32"
              fill="none"
              stroke="#2563eb"
              strokeWidth="3"
              strokeLinecap="round"
            />

            {/* Peak Point */}
            <circle cx="390" cy="48" r="5" fill="#2563eb" stroke="#ffffff" strokeWidth="2.5" />
            <circle cx="500" cy="32" r="4" fill="#2563eb" />

            {/* X Axis dates (min 12px font) */}
            <text x="40" y="178" fill="#64748b" fontSize="12" fontWeight="500" textAnchor="middle">{monthPrefix}1</text>
            <text x="135" y="178" fill="#64748b" fontSize="12" fontWeight="500" textAnchor="middle">{monthPrefix}8</text>
            <text x="225" y="178" fill="#64748b" fontSize="12" fontWeight="500" textAnchor="middle">{monthPrefix}15</text>
            <text x="315" y="178" fill="#64748b" fontSize="12" fontWeight="500" textAnchor="middle">{monthPrefix}22</text>
            <text x="405" y="178" fill="#64748b" fontSize="12" fontWeight="500" textAnchor="middle">{monthPrefix}29</text>
            <text x="495" y="178" fill="#64748b" fontSize="12" fontWeight="500" textAnchor="middle">{nextMonthPrefix}5</text>
          </svg>
        </div>
      </div>

      {/* Bottom KPI strip (evenly distributed 16px padding) */}
      <div className="mt-5 p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="sm:px-3 first:pl-0">
          <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider mb-0.5">
            {language === "vi" ? "Ngày cao điểm" : "Peak Day"}
          </span>
          <strong className="text-slate-900 font-bold text-sm">
            {language === "vi" ? "28 Th10 (524 lượt)" : "Oct 28 (524 visits)"}
          </strong>
        </div>
        <div className="pt-2 sm:pt-0 sm:px-3">
          <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider mb-0.5">
            {language === "vi" ? "Tỷ lệ chuyển đổi" : "Conversion Rate"}
          </span>
          <strong className="text-slate-900 font-bold text-sm">1.97%</strong>
        </div>
        <div className="pt-2 sm:pt-0 sm:px-3">
          <span className="text-slate-500 block text-[11px] font-medium uppercase tracking-wider mb-0.5">
            {language === "vi" ? "Thời lượng phiên TB" : "Avg Session"}
          </span>
          <strong className="text-slate-900 font-bold text-sm">
            {language === "vi" ? "3 phút 42 giây" : "3m 42s"}
          </strong>
        </div>
      </div>
    </div>
  );
}
