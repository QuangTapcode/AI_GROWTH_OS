"use client";

import React from "react";

export default function ActionCenterCard() {
  const actions = [
    {
      id: 1,
      dotColor: "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]",
      title: "Review 4 pending content items",
      priority: "HIGH",
      priorityColor: "bg-rose-50 text-rose-700 border-rose-200",
      description:
        "3 articles and 1 destination overview drafted by Content Agent awaiting factual sign-off.",
      btnText: "Review now",
      btnClass:
        "bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20",
    },
    {
      id: 2,
      dotColor: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]",
      title: "Approve SEO recommendations",
      priority: "MEDIUM",
      priorityColor: "bg-amber-50 text-amber-700 border-amber-200",
      description:
        "Schema markup & keyword cluster expansion on Central Vietnam guides.",
      btnText: "Open task",
      btnClass:
        "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50",
    },
    {
      id: 3,
      dotColor: "bg-sky-500 shadow-[0_0_6px_rgba(14,165,233,0.6)]",
      title: "Reconnect distribution channel",
      priority: "CHANNEL",
      priorityColor: "bg-slate-100 text-slate-700 border-slate-200",
      description:
        "LinkedIn Pages OAuth token expired 2 days ago; 3 automated shares paused.",
      btnText: "Reconnect",
      btnClass:
        "bg-white border border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-200",
    },
  ];

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Action Center
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Decisions and tasks requiring your attention (4 pending)
            </p>
          </div>
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full shrink-0">
            4 Actionable
          </span>
        </div>

        {/* Action Items List */}
        <div className="space-y-3">
          {actions.map((act) => (
            <div
              key={act.id}
              className="p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/40 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${act.dotColor}`} />
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {act.title}
                  </p>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${act.priorityColor}`}
                  >
                    {act.priority}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed pl-4">
                  {act.description}
                </p>
              </div>

              <button
                type="button"
                className={`self-start sm:self-center shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${act.btnClass}`}
              >
                {act.btnText}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
