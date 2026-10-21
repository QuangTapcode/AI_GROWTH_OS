"use client";

import React from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function WorkflowsKpiRow() {
  const { language } = useLanguage();

  const cards = [
    {
      id: "running",
      label: language === "vi" ? "Đang chạy" : "Running",
      value: "3",
      subtext: language === "vi" ? "3 đợt chạy AI đang tiến hành" : "3 AI runs in progress",
      accent: "from-blue-600 to-indigo-600",
      iconBg: "bg-blue-600 text-white shadow-md shadow-blue-500/25",
      icon: (
        <svg
          className="w-5 h-5 fill-current ml-0.5"
          viewBox="0 0 24 24"
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      ),
    },
    {
      id: "completed",
      label: language === "vi" ? "Hoàn thành hôm nay" : "Completed today",
      value: "35",
      subtext: language === "vi" ? "Đã hoàn tất thành công" : "Successfully finished",
      accent: "from-emerald-500 to-teal-600",
      iconBg: "bg-emerald-600 text-white shadow-md shadow-emerald-500/25",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      ),
    },
    {
      id: "needs-review",
      label: language === "vi" ? "Cần phê duyệt" : "Needs review",
      value: "3",
      subtext: language === "vi" ? "Chờ con người ký duyệt" : "Awaiting human approval",
      accent: "from-amber-500 to-orange-600",
      iconBg: "bg-amber-600 text-white shadow-md shadow-amber-500/25",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          />
        </svg>
      ),
    },
    {
      id: "blocked",
      label: language === "vi" ? "Bị chặn" : "Blocked",
      value: "1",
      subtext: language === "vi" ? "Cần sự chú ý" : "Requires attention",
      accent: "from-rose-500 to-red-600",
      iconBg: "bg-rose-600 text-white shadow-md shadow-rose-500/25",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div
          key={card.id}
          className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200/90 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex items-center justify-between relative overflow-hidden group cursor-default"
        >
          {/* Top colored accent bar */}
          <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.accent} group-hover:h-1.5 transition-all`} />

          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {card.label}
            </p>
            <p className="text-3xl font-extrabold text-slate-900 tracking-tight leading-none pt-0.5">
              {card.value}
            </p>
            <p className="text-xs text-slate-500 font-medium pt-1">{card.subtext}</p>
          </div>

          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${card.iconBg}`}
          >
            {card.icon}
          </div>
        </div>
      ))}
    </div>
  );
}
