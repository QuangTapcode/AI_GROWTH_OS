"use client";

import React from "react";

export default function KpiMetricsRow() {
  const metrics = [
    {
      label: "Qualified Traffic",
      value: "12,480",
      change: "+18.6%",
      prev: "10,520 prev.",
      icon: (
        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      label: "Organic Clicks",
      value: "8,240",
      change: "+12.4%",
      prev: "7,330 prev.",
      icon: (
        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
      ),
    },
    {
      label: "New Users",
      value: "3,180",
      change: "+9.2%",
      prev: "2,912 prev.",
      icon: (
        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
      ),
    },
    {
      label: "Qualified Leads",
      value: "246",
      change: "+14.8%",
      prev: "214 prev.",
      icon: (
        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="9" strokeWidth="2" />
          <circle cx="12" cy="12" r="5" strokeWidth="2" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        </svg>
      ),
    },
    {
      label: "Published Content",
      value: "38",
      change: "+11.5%",
      prev: "34 prev.",
      icon: (
        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {metrics.map((m, idx) => (
          <div
            key={idx}
            className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between"
          >
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-medium text-slate-600">{m.label}</span>
              <div className="w-7 h-7 rounded-lg bg-blue-50/80 flex items-center justify-center">
                {m.icon}
              </div>
            </div>

            <div>
              <p className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-2">
                {m.value}
              </p>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="inline-flex items-center font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                  ↑ {m.change}
                </span>
                <span className="text-slate-400">vs. {m.prev}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="text-right pr-1">
        <span className="text-[10px] text-slate-400 italic">
          Illustrative demo data for TripC workspace
        </span>
      </div>
    </div>
  );
}
