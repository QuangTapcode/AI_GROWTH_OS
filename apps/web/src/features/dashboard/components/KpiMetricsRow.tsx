"use client";

import React from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function KpiMetricsRow() {
  const { t } = useLanguage();

  const metrics = [
    {
      label: t.dashboard.kpi.qualifiedTraffic,
      value: "12,480",
      change: "+18.6%",
      prev: `10,520 ${t.dashboard.kpi.prev}`,
      accent: "from-blue-600 to-indigo-600",
      iconBg: "bg-blue-600 text-white shadow-blue-500/25",
      icon: (
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      label: t.dashboard.kpi.organicClicks,
      value: "8,240",
      change: "+12.4%",
      prev: `7,330 ${t.dashboard.kpi.prev}`,
      accent: "from-cyan-500 to-blue-600",
      iconBg: "bg-cyan-600 text-white shadow-cyan-500/25",
      icon: (
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
      ),
    },
    {
      label: t.dashboard.kpi.newUsers,
      value: "3,180",
      change: "+9.2%",
      prev: `2,912 ${t.dashboard.kpi.prev}`,
      accent: "from-violet-500 to-purple-600",
      iconBg: "bg-purple-600 text-white shadow-purple-500/25",
      icon: (
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
    },
    {
      label: t.dashboard.kpi.qualifiedLeads,
      value: "246",
      change: "+14.8%",
      prev: `214 ${t.dashboard.kpi.prev}`,
      accent: "from-amber-500 to-orange-600",
      iconBg: "bg-amber-600 text-white shadow-amber-500/25",
      icon: (
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="9" strokeWidth="2.2" />
          <circle cx="12" cy="12" r="5" strokeWidth="2.2" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
      ),
    },
    {
      label: t.dashboard.kpi.publishedContent,
      value: "38",
      change: "+11.5%",
      prev: `34 ${t.dashboard.kpi.prev}`,
      accent: "from-emerald-500 to-teal-600",
      iconBg: "bg-emerald-600 text-white shadow-emerald-500/25",
      icon: (
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {metrics.map((m, idx) => (
          <div
            key={idx}
            className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between relative overflow-hidden group cursor-default"
          >
            {/* Top Accent Gradient Bar */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${m.accent} group-hover:h-1.5 transition-all`} />

            <div className="flex items-center justify-between text-slate-500 mb-3 pt-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-600">{m.label}</span>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-md ${m.iconBg}`}>
                {m.icon}
              </div>
            </div>

            <div>
              <p className="text-3xl font-black text-slate-900 tracking-tight leading-none mb-2.5">
                {m.value}
              </p>
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="inline-flex items-center font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80">
                  ↑ {m.change}
                </span>
                <span className="text-slate-400 font-medium">{t.dashboard.kpi.vs} {m.prev}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="text-right pr-1">
        <span className="text-[10px] text-slate-400 italic">
          {t.dashboard.kpi.demoFootnote.replace("{workspace}", "TripC")}
        </span>
      </div>
    </div>
  );
}
