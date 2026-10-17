"use client";

import React from "react";
import Link from "next/link";

export default function AgentActivityCard() {
  const statusStats = [
    { label: "Running", count: 3, bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-100" },
    { label: "Completed", count: 18, bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-100" },
    { label: "Review", count: 4, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-100" },
    { label: "Failed", count: 1, bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-100" },
  ];

  const agentTasks = [
    {
      agent: "SEO Agent",
      action: "Optimize description tags for Da Nang guide",
      time: "12m ago",
      status: "Completed",
      statusColor: "bg-slate-100 text-slate-700 border-slate-200",
      iconBg: "bg-blue-100 text-blue-600",
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
    },
    {
      agent: "Content Agent",
      action: "Draft Da Nang travel blog 3/5",
      time: "34m ago",
      status: "Needs review",
      statusColor: "bg-amber-100 text-amber-800 border-amber-200",
      iconBg: "bg-amber-100 text-amber-600",
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      ),
    },
    {
      agent: "Research Agent",
      action: "Analyze seasonal query demand Q4",
      time: "1h ago",
      status: "Running",
      statusColor: "bg-sky-100 text-sky-800 border-sky-200",
      iconBg: "bg-indigo-100 text-indigo-600",
      icon: (
        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
    },
    {
      agent: "Distribution Agent",
      action: "Syndicate hotel curation to LinkedIn",
      time: "2h ago",
      status: "Completed",
      statusColor: "bg-slate-100 text-slate-700 border-slate-200",
      iconBg: "bg-sky-100 text-sky-600",
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      ),
    },
  ];

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              AI Agent Activity
            </h2>
          </div>
          <Link
            href="/dashboard?tab=workflows"
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            View all tasks →
          </Link>
        </div>

        {/* 4 Status Counter Boxes */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {statusStats.map((s, idx) => (
            <div
              key={idx}
              className={`${s.bg} ${s.border} border rounded-xl p-2.5 text-center`}
            >
              <p className="text-[10px] text-slate-500 font-medium capitalize">
                {s.label}
              </p>
              <p className={`text-xl font-black ${s.text} leading-none mt-1`}>
                {s.count}
              </p>
            </div>
          ))}
        </div>

        {/* Agent Task List */}
        <div className="space-y-2.5">
          {agentTasks.map((t, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-all flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-7 h-7 rounded-lg ${t.iconBg} flex items-center justify-center shrink-0`}
                >
                  {t.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 leading-tight">
                    {t.agent}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">
                    {t.action}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${t.statusColor}`}
                >
                  {t.status}
                </span>
                <span className="text-[10px] text-slate-400">{t.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Model & Latency Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-mono">
        <span>Model: Gemini 1.5 Pro</span>
        <span className="flex items-center gap-1.5 font-sans">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Avg latency: 420ms
        </span>
      </div>
    </div>
  );
}
