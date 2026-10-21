"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function RecommendedActionsCard() {
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const recommendations = [
    {
      id: 1,
      title: t.dashboard.recommendations.rec1Title,
      hypothesis: t.dashboard.recommendations.rec1Hypo,
      confidence: "94%",
      btnText: t.dashboard.recommendations.rec1Btn,
      href: "/workflows",
      icon: (
        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
        </svg>
      ),
    },
    {
      id: 2,
      title: t.dashboard.recommendations.rec2Title,
      hypothesis: t.dashboard.recommendations.rec2Hypo,
      confidence: "89%",
      btnText: t.dashboard.recommendations.rec2Btn,
      href: "/workflows",
      icon: (
        <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 3,
      title: t.dashboard.recommendations.rec3Title,
      hypothesis: t.dashboard.recommendations.rec3Hypo,
      confidence: "91%",
      btnText: t.dashboard.recommendations.rec3Btn,
      href: "/workflows",
      icon: (
        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <span className="text-blue-600 text-lg">✦</span>
          <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
            {t.dashboard.recommendations.title}
          </h2>
          <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-3 py-0.5 rounded-full">
            {t.dashboard.recommendations.badge}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer flex items-center gap-1 font-semibold"
        >
          {t.dashboard.recommendations.dismiss}
        </button>
      </div>

      {/* 3 Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className="p-5 rounded-2xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between group"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="p-2 rounded-xl bg-white border border-slate-200 shadow-2xs group-hover:border-blue-200 transition-colors">
                  {rec.icon}
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 leading-snug mb-2 group-hover:text-blue-600 transition-colors">
                {rec.title}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed mb-4 font-medium">
                <strong className="text-slate-800">{t.dashboard.recommendations.hypothesis}</strong>{" "}
                {rec.hypothesis}
              </p>
            </div>

            <div className="pt-3.5 border-t border-slate-200/80 flex items-center justify-between gap-2">
              <span className="text-xs text-blue-700 font-bold bg-blue-50 border border-blue-200/80 px-2.5 py-1 rounded-full">
                {t.dashboard.recommendations.confidence} {rec.confidence}
              </span>
              <Link
                href={rec.href}
                className="h-9 px-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all inline-flex items-center justify-center shadow-xs cursor-pointer active:translate-y-px"
              >
                {rec.btnText}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
