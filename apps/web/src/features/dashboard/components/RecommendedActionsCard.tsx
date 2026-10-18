"use client";

import React, { useState } from "react";

export default function RecommendedActionsCard() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const recommendations = [
    {
      id: 1,
      title: 'Target high-intent query "Best boutique stays in Da Nang"',
      hypothesis:
        "Potential +1,400 monthly organic visits based on low SERP competition and high commercial intent.",
      confidence: "94%",
      btnText: "Explore opportunity",
      icon: (
        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
        </svg>
      ),
    },
    {
      id: 2,
      title: "Refresh declining Q2 Vietnam visa guide article",
      hypothesis:
        "Organic impressions dropped -14% following government visa policy update; refreshing content recovers ~620 visits.",
      confidence: "89%",
      btnText: "Create task",
      icon: (
        <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 3,
      title: "Auto-generate social snippets for Hoi An guide",
      hypothesis:
        "Estimated 280-350 referral visits across Twitter/X and LinkedIn distribution channels.",
      confidence: "91%",
      btnText: "Launch workflow",
      icon: (
        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <span className="text-blue-600 text-base">✦</span>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">
            Recommended next actions
          </h2>
          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
            AI Growth Intelligence
          </span>
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer flex items-center gap-1"
        >
          Dismiss recommendations ✕
        </button>
      </div>

      {/* 3 Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {recommendations.map((rec) => (
          <div
            key={rec.id}
            className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/30 hover:bg-white hover:border-blue-200 hover:shadow-xs transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="p-1 rounded-md bg-white border border-slate-100 shadow-xs">
                  {rec.icon}
                </span>
              </div>
              <h3 className="text-xs font-bold text-slate-900 leading-snug mb-2">
                {rec.title}
              </h3>
              <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
                <strong className="text-slate-700">Hypothesis:</strong>{" "}
                {rec.hypothesis}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-blue-600 font-semibold">
                Confidence: {rec.confidence}
              </span>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all cursor-pointer"
              >
                {rec.btnText}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
