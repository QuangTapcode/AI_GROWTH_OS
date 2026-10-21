"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function ActionCenterCard() {
  const { t } = useLanguage();

  const actions = [
    {
      id: 1,
      dotColor: "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]",
      title: t.dashboard.actionCenter.item1Title,
      priority: t.dashboard.actionCenter.high,
      priorityColor: "bg-rose-50 text-rose-700 border-rose-200",
      description: t.dashboard.actionCenter.item1Desc,
      btnText: t.dashboard.actionCenter.item1Btn,
      btnClass: "bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20",
      href: "/review-queue",
    },
    {
      id: 2,
      dotColor: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]",
      title: t.dashboard.actionCenter.item2Title,
      priority: t.dashboard.actionCenter.medium,
      priorityColor: "bg-amber-50 text-amber-700 border-amber-200",
      description: t.dashboard.actionCenter.item2Desc,
      btnText: t.dashboard.actionCenter.item2Btn,
      btnClass: "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50",
      href: "/workflows",
    },
    {
      id: 3,
      dotColor: "bg-sky-500 shadow-[0_0_6px_rgba(14,165,233,0.6)]",
      title: t.dashboard.actionCenter.item3Title,
      priority: t.dashboard.actionCenter.channel,
      priorityColor: "bg-slate-100 text-slate-700 border-slate-200",
      description: t.dashboard.actionCenter.item3Desc,
      btnText: t.dashboard.actionCenter.item3Btn,
      btnClass: "bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-200",
      href: "/workflows",
    },
  ];

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              {t.dashboard.actionCenter.title}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              {t.dashboard.actionCenter.subtitle}
            </p>
          </div>
          <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-3 py-1 rounded-full shrink-0">
            {t.dashboard.actionCenter.actionableCount}
          </span>
        </div>

        {/* Action Items List */}
        <div className="space-y-3">
          {actions.map((act) => (
            <div
              key={act.id}
              className="p-4 rounded-xl border border-slate-200/70 hover:border-slate-300 bg-slate-50/50 hover:bg-white hover:shadow-xs transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 mb-1">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${act.dotColor}`} />
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {act.title}
                  </p>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${act.priorityColor}`}
                  >
                    {act.priority}
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed pl-5 font-normal">
                  {act.description}
                </p>
              </div>

              <Link
                href={act.href}
                className={`self-start sm:self-center shrink-0 h-9 px-4 rounded-xl text-xs font-bold inline-flex items-center justify-center transition-all cursor-pointer shadow-xs active:translate-y-px ${act.btnClass}`}
              >
                {act.btnText}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
