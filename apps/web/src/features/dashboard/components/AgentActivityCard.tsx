"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { StatusPill } from "@/components/ui";

export default function AgentActivityCard() {
  const { language, t } = useLanguage();

  const statusStats = [
    { label: t.dashboard.agentActivity.running, count: 3, bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-100" },
    { label: t.dashboard.agentActivity.completed, count: 18, bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-100" },
    { label: t.dashboard.agentActivity.review, count: 4, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-100" },
    { label: t.dashboard.agentActivity.failed, count: 1, bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-100" },
  ];

  const agentTasks = [
    {
      agent: t.dashboard.agentActivity.seoAgent,
      action: t.dashboard.agentActivity.seoAction,
      time: language === "vi" ? "12 phút trước" : "12m ago",
      status: t.dashboard.agentActivity.completed,
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
      agent: t.dashboard.agentActivity.contentAgent,
      action: t.dashboard.agentActivity.contentAction,
      time: language === "vi" ? "34 phút trước" : "34m ago",
      status: t.dashboard.agentActivity.needsReview,
      statusColor: "bg-amber-100 text-amber-800 border-amber-200",
      iconBg: "bg-amber-100 text-amber-600",
      icon: (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      ),
    },
    {
      agent: t.dashboard.agentActivity.researchAgent,
      action: t.dashboard.agentActivity.researchAction,
      time: language === "vi" ? "1 giờ trước" : "1h ago",
      status: t.dashboard.agentActivity.running,
      statusColor: "bg-sky-100 text-sky-800 border-sky-200",
      iconBg: "bg-indigo-100 text-indigo-600",
      icon: (
        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
    },
    {
      agent: t.dashboard.agentActivity.distributionAgent,
      action: t.dashboard.agentActivity.distributionAction,
      time: language === "vi" ? "2 giờ trước" : "2h ago",
      status: t.dashboard.agentActivity.completed,
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
    <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 animate-pulse" />
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              {t.dashboard.agentActivity.title}
            </h2>
          </div>
          <Link
            href="/workflows"
            className="text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1"
          >
            <span>{t.dashboard.agentActivity.viewAllTasks}</span>
            <span>→</span>
          </Link>
        </div>

        {/* 4 Status Counter Boxes (padded, distinct contrast) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {statusStats.map((s, idx) => (
            <div
              key={idx}
              className={`${s.bg} ${s.border} border rounded-xl p-3.5 text-center flex flex-col justify-between`}
            >
              <p className="text-xs text-slate-600 font-bold uppercase tracking-wider">
                {s.label}
              </p>
              <p className={`text-2xl font-black ${s.text} leading-none mt-2`}>
                {s.count}
              </p>
            </div>
          ))}
        </div>

        {/* Recent Agent Tasks List (rows min 56px, StatusPill right-aligned) */}
        <div className="space-y-3">
          {agentTasks.map((tItem, idx) => (
            <div
              key={idx}
              className="min-h-[56px] flex items-center justify-between gap-3 p-3.5 rounded-xl border border-slate-200/80 hover:bg-slate-50/80 hover:border-slate-300 transition-all"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`w-9 h-9 rounded-xl ${tItem.iconBg} flex items-center justify-center shrink-0 shadow-xs`}
                >
                  {tItem.icon}
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {tItem.agent}
                    </p>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs text-slate-500 font-medium truncate">
                      {tItem.time}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 truncate font-normal">
                    {tItem.action}
                  </p>
                </div>
              </div>

              <div className="shrink-0">
                <StatusPill status={tItem.status} label={tItem.status} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
