"use client";

import React from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function GrowthPipelineCard() {
  const { t } = useLanguage();

  const stages = [
    {
      num: "1",
      name: t.dashboard.pipeline.stage1,
      count: "6",
      status: t.dashboard.pipeline.stage1Status,
      dot: "bg-blue-600",
      icon: "🔍",
    },
    {
      num: "2",
      name: t.dashboard.pipeline.stage2,
      count: "4",
      status: t.dashboard.pipeline.stage2Status,
      dot: "bg-blue-600",
      icon: "⚡",
    },
    {
      num: "3",
      name: t.dashboard.pipeline.stage3,
      count: "8",
      status: t.dashboard.pipeline.stage3Status,
      dot: "bg-blue-600",
      icon: "📝",
    },
    {
      num: "4",
      name: t.dashboard.pipeline.stage4,
      count: "4",
      status: t.dashboard.pipeline.stage4Status,
      dot: "bg-amber-500",
      icon: "🕒",
    },
    {
      num: "5",
      name: t.dashboard.pipeline.stage5,
      count: "12",
      status: t.dashboard.pipeline.stage5Status,
      dot: "bg-blue-600",
      icon: "🚀",
    },
    {
      num: "6",
      name: t.dashboard.pipeline.stage6,
      count: "+18.6%",
      status: t.dashboard.pipeline.stage6Status,
      dot: "bg-emerald-500",
      icon: "📈",
      isHighlight: true,
    },
  ];

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              {t.dashboard.pipeline.title}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              {t.dashboard.pipeline.subtitle}
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono font-semibold bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
            {t.dashboard.pipeline.pipelineVersion}
          </span>
        </div>

        {/* 6 Stage Boxes (3 columns x 2 rows) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {stages.map((stg) => (
            <div
              key={stg.num}
              className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:border-blue-300 hover:shadow-xs transition-all flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>{stg.icon}</span> {stg.num}. {stg.name}
                </span>
                <span className={`w-2 h-2 rounded-full ${stg.dot}`} />
              </div>

              <div>
                <span
                  className={`text-2xl font-black tracking-tight leading-none ${
                    stg.isHighlight ? "text-emerald-600" : "text-slate-900"
                  }`}
                >
                  {stg.count}
                </span>
                <span className="text-xs text-slate-500 font-medium block mt-1 capitalize">
                  {stg.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cycle Velocity Progress */}
      <div className="pt-2">
        <div className="flex items-center justify-between text-xs font-medium mb-1.5">
          <span className="text-slate-600 font-semibold">{t.dashboard.pipeline.cycleVelocity}</span>
          <span className="text-slate-900 font-bold">{t.dashboard.pipeline.velocityOnSchedule}</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200/60">
          <div
            className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2.5 rounded-full transition-all duration-700"
            style={{ width: "82%" }}
          />
        </div>
      </div>
    </div>
  );
}
