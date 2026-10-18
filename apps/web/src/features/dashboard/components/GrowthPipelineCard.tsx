"use client";

import React from "react";

export default function GrowthPipelineCard() {
  const stages = [
    {
      num: "1",
      name: "Research",
      count: "6",
      status: "identified",
      dot: "bg-blue-600",
      icon: "🔍",
    },
    {
      num: "2",
      name: "Opportunity",
      count: "4",
      status: "approved",
      dot: "bg-blue-600",
      icon: "⚡",
    },
    {
      num: "3",
      name: "Content",
      count: "8",
      status: "in progress",
      dot: "bg-blue-600",
      icon: "📝",
    },
    {
      num: "4",
      name: "Review",
      count: "4",
      status: "awaiting human",
      dot: "bg-amber-500",
      icon: "🕒",
    },
    {
      num: "5",
      name: "Distribute",
      count: "12",
      status: "scheduled",
      dot: "bg-blue-600",
      icon: "🚀",
    },
    {
      num: "6",
      name: "Results",
      count: "+18.6%",
      status: "traffic lift",
      dot: "bg-emerald-500",
      icon: "📈",
      isHighlight: true,
    },
  ];

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Growth Pipeline
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Autonomous workflow stages from discovery to qualified impact
            </p>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            TripC Pipeline v2.4
          </span>
        </div>

        {/* 6 Stage Boxes (3 columns x 2 rows) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-5">
          {stages.map((stg) => (
            <div
              key={stg.num}
              className="p-3 rounded-xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-blue-200 transition-all flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                  <span>{stg.icon}</span> {stg.num}. {stg.name}
                </span>
                <span className={`w-1.5 h-1.5 rounded-full ${stg.dot}`} />
              </div>

              <div>
                <span
                  className={`text-xl font-black tracking-tight leading-none ${
                    stg.isHighlight ? "text-emerald-600" : "text-slate-900"
                  }`}
                >
                  {stg.count}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5 capitalize">
                  {stg.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cycle Velocity Progress */}
      <div className="pt-2">
        <div className="flex items-center justify-between text-[11px] font-medium mb-1.5">
          <span className="text-slate-500">Overall cycle velocity</span>
          <span className="text-slate-700 font-semibold">82% on schedule</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-700"
            style={{ width: "82%" }}
          />
        </div>
      </div>
    </div>
  );
}
