"use client";

import React from "react";
import Link from "next/link";
import type { WorkflowTask } from "@/lib/apiTypes";
import { agentLabel, timeAgo } from "@/lib/format";
import { taskTitle } from "@/features/workflows/adapters";

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  completed: { label: "Completed", className: "bg-slate-100 text-slate-700 border-slate-200" },
  awaiting_approval: { label: "Needs review", className: "bg-amber-100 text-amber-800 border-amber-200" },
  running: { label: "Running", className: "bg-sky-100 text-sky-800 border-sky-200" },
  failed: { label: "Failed", className: "bg-rose-100 text-rose-800 border-rose-200" },
  cancelled: { label: "Cancelled", className: "bg-slate-50 text-slate-500 border-slate-200" },
  queued: { label: "Queued", className: "bg-slate-50 text-slate-600 border-slate-200" },
  pending: { label: "Pending", className: "bg-slate-50 text-slate-600 border-slate-200" },
};

const ROLE_ICON_BG: Record<string, string> = {
  research: "bg-indigo-100 text-indigo-600",
  growth_lead: "bg-blue-100 text-blue-600",
  seo: "bg-sky-100 text-sky-600",
  content: "bg-amber-100 text-amber-600",
  community: "bg-emerald-100 text-emerald-600",
  performance: "bg-violet-100 text-violet-600",
};

export default function AgentActivityCard({ tasks }: { tasks: WorkflowTask[] }) {
  const count = (status: string) => tasks.filter((t) => t.status === status).length;
  const statusStats = [
    { label: "Running", count: count("running"), bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-100" },
    { label: "Completed", count: count("completed"), bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-100" },
    { label: "Review", count: count("awaiting_approval"), bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-100" },
    { label: "Failed", count: count("failed"), bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-100" },
  ];

  const recent = [...tasks].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 4);
  const lastUpdate = recent[0]?.updated_at;

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between h-full">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full bg-blue-600 ${count("running") > 0 ? "animate-pulse" : ""}`} />
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">AI Agent Activity</h2>
          </div>
          <Link href="/workflows" className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">
            View all tasks →
          </Link>
        </div>

        {/* 4 Status Counter Boxes */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {statusStats.map((s) => (
            <div key={s.label} className={`${s.bg} ${s.border} border rounded-xl p-2.5 text-center`}>
              <p className="text-[10px] text-slate-500 font-medium capitalize">{s.label}</p>
              <p className={`text-xl font-black ${s.text} leading-none mt-1`}>{s.count}</p>
            </div>
          ))}
        </div>

        {/* Agent Task List */}
        <div className="space-y-2.5">
          {recent.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">No agent activity yet in this workspace.</p>
          )}
          {recent.map((t) => {
            const style = STATUS_STYLE[t.status] ?? STATUS_STYLE.pending;
            return (
              <div
                key={t.id}
                className="p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 transition-all flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-7 h-7 rounded-lg ${ROLE_ICON_BG[t.role] ?? "bg-slate-100 text-slate-600"} flex items-center justify-center shrink-0 text-[10px] font-black uppercase`}
                  >
                    {t.role.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 leading-tight">{agentLabel(t.role)}</p>
                    <p className="text-[11px] text-slate-500 truncate leading-tight mt-0.5">{taskTitle(t)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${style.className}`}>
                    {style.label}
                  </span>
                  <span className="text-[10px] text-slate-400">{timeAgo(t.updated_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
        <span>{tasks.length} tasks in this workspace</span>
        <span>{lastUpdate ? `Last update ${timeAgo(lastUpdate)}` : ""}</span>
      </div>
    </div>
  );
}
