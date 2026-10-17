"use client";

import React, { useState } from "react";

export default function TrafficTrendChart() {
  const [timeframe, setTimeframe] = useState<"daily" | "weekly" | "monthly">("daily");

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
      {/* Top Header */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Qualified Traffic Trend
            </h2>
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
              +18.6% vs prev.
            </span>
          </div>

          {/* Timeframe switch */}
          <div className="bg-slate-100 p-0.5 rounded-lg flex items-center text-[11px] font-medium text-slate-600">
            {(["daily", "weekly", "monthly"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTimeframe(t)}
                className={`px-3 py-1 rounded-md transition-all capitalize cursor-pointer ${
                  timeframe === t
                    ? "bg-white text-slate-900 font-semibold shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 text-[11px] text-slate-500 mb-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-blue-600 rounded-full" />
            <span>Current period (Last 30d)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 border-t border-dashed border-slate-400" />
            <span className="text-slate-400">Previous 30 days</span>
          </div>
        </div>

        {/* Chart SVG */}
        <div className="relative w-full h-[180px]">
          {/* Floating Peak Tooltip */}
          <div className="absolute top-2 right-[20%] xl:right-[24%] bg-slate-900 text-white rounded-lg px-2.5 py-1.5 text-center shadow-xl border border-slate-700/80 z-10 pointer-events-none">
            <p className="text-[10px] text-slate-400 leading-tight">Oct 28 · Peak</p>
            <p className="text-xs font-bold leading-tight mt-0.5">
              524 visits <span className="text-emerald-400 font-semibold">(+22%)</span>
            </p>
            <div className="w-2 h-2 bg-slate-900 rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2 border-r border-b border-slate-700/80" />
          </div>

          <svg viewBox="0 0 540 180" className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="trafficGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid horizontal lines */}
            <line x1="30" y1="20" x2="520" y2="20" stroke="#f1f5f9" strokeWidth="1" />
            <line x1="30" y1="55" x2="520" y2="55" stroke="#f1f5f9" strokeWidth="1" />
            <line x1="30" y1="90" x2="520" y2="90" stroke="#f1f5f9" strokeWidth="1" />
            <line x1="30" y1="125" x2="520" y2="125" stroke="#f1f5f9" strokeWidth="1" />
            <line x1="30" y1="160" x2="520" y2="160" stroke="#f1f5f9" strokeWidth="1" />

            {/* Y Axis text */}
            <text x="8" y="24" fill="#94a3b8" fontSize="10">12k</text>
            <text x="8" y="59" fill="#94a3b8" fontSize="10">9k</text>
            <text x="8" y="94" fill="#94a3b8" fontSize="10">6k</text>
            <text x="8" y="129" fill="#94a3b8" fontSize="10">3k</text>
            <text x="14" y="163" fill="#94a3b8" fontSize="10">0</text>

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
              strokeWidth="1.8"
              strokeDasharray="3 3"
              opacity="0.8"
            />

            {/* Current period area fill */}
            <path
              d="M40 135 C 90 130, 120 125, 170 115 C 230 102, 280 92, 330 78 C 370 65, 410 42, 450 36 L 500 32 L 500 160 L 40 160 Z"
              fill="url(#trafficGradient)"
            />

            {/* Current period main curve line */}
            <path
              d="M40 135 C 90 130, 120 125, 170 115 C 230 102, 280 92, 330 78 C 370 65, 410 42, 450 36 L 500 32"
              fill="none"
              stroke="#2563eb"
              strokeWidth="2.5"
              strokeLinecap="round"
            />

            {/* Peak Point */}
            <circle cx="390" cy="48" r="4.5" fill="#2563eb" stroke="#ffffff" strokeWidth="2.5" />
            <circle cx="500" cy="32" r="3.5" fill="#2563eb" />

            {/* X Axis dates */}
            <text x="40" y="176" fill="#94a3b8" fontSize="10" textAnchor="middle">Oct 1</text>
            <text x="135" y="176" fill="#94a3b8" fontSize="10" textAnchor="middle">Oct 8</text>
            <text x="225" y="176" fill="#94a3b8" fontSize="10" textAnchor="middle">Oct 15</text>
            <text x="315" y="176" fill="#94a3b8" fontSize="10" textAnchor="middle">Oct 22</text>
            <text x="405" y="176" fill="#94a3b8" fontSize="10" textAnchor="middle">Oct 29</text>
            <text x="495" y="176" fill="#94a3b8" fontSize="10" textAnchor="middle">Nov 5</text>
          </svg>
        </div>
      </div>

      {/* Bottom KPI strip */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50/70 p-3 rounded-xl border border-slate-200/60">
        <div>
          <span className="text-slate-500">Peak Day: </span>
          <strong className="text-slate-800 font-semibold">Oct 28 (524 visits)</strong>
        </div>
        <div className="hidden sm:block text-slate-300">·</div>
        <div>
          <span className="text-slate-500">Conversion Rate: </span>
          <strong className="text-slate-800 font-semibold">1.97%</strong>
        </div>
        <div className="hidden sm:block text-slate-300">·</div>
        <div>
          <span className="text-slate-500">Avg Session: </span>
          <strong className="text-slate-800 font-semibold">3m 42s</strong>
        </div>
      </div>
    </div>
  );
}
