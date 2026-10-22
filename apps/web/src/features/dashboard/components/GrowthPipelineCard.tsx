"use client";

import React from "react";
import type { Approval, WorkflowTask } from "@/lib/apiTypes";
import { formatNumber } from "@/lib/format";

interface GrowthPipelineCardProps {
  workspaceName: string;
  tasks: WorkflowTask[];
  approvals: Approval[];
  leads: number | null;
}

function summarize(tasks: WorkflowTask[]): string {
  if (tasks.length === 0) return "no tasks yet";
  const running = tasks.filter((t) => t.status === "running" || t.status === "queued" || t.status === "pending").length;
  const done = tasks.filter((t) => t.status === "completed").length;
  const parts = [`${done} completed`];
  if (running > 0) parts.push(`${running} in progress`);
  return parts.join(" · ");
}

export default function GrowthPipelineCard({ workspaceName, tasks, approvals, leads }: GrowthPipelineCardProps) {
  const byRoles = (...roles: string[]) => tasks.filter((t) => roles.includes(t.role));
  const pendingReviews = approvals.filter((a) => a.status === "pending").length;
  const awaitingTasks = tasks.filter((t) => t.status === "awaiting_approval").length;

  const research = byRoles("research");
  const opportunity = byRoles("growth_lead");
  const content = byRoles("content", "seo");
  const distribute = byRoles("community");

  const stages = [
    { num: "1", name: "Research", count: String(research.length), status: summarize(research), dot: "bg-blue-600", icon: "🔍" },
    { num: "2", name: "Opportunity", count: String(opportunity.length), status: summarize(opportunity), dot: "bg-blue-600", icon: "⚡" },
    { num: "3", name: "Content", count: String(content.length), status: summarize(content), dot: "bg-blue-600", icon: "📝" },
    {
      num: "4",
      name: "Review",
      count: String(pendingReviews + awaitingTasks),
      status: `${pendingReviews} approvals · ${awaitingTasks} tasks waiting`,
      dot: pendingReviews + awaitingTasks > 0 ? "bg-amber-500" : "bg-blue-600",
      icon: "🕒",
    },
    { num: "5", name: "Distribute", count: String(distribute.length), status: summarize(distribute), dot: "bg-blue-600", icon: "🚀" },
    {
      num: "6",
      name: "Results",
      count: formatNumber(leads),
      status: "leads in period",
      dot: "bg-emerald-500",
      icon: "📈",
      isHighlight: true,
    },
  ];

  const considered = tasks.filter((t) => t.status !== "cancelled");
  const completed = considered.filter((t) => t.status === "completed").length;
  const velocity = considered.length > 0 ? Math.round((completed / considered.length) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">Growth Pipeline</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Workflow stages from discovery to qualified impact</p>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">{workspaceName}</span>
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
                <span className="text-[10px] text-slate-400 block mt-0.5">{stg.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Completion Progress */}
      <div className="pt-2">
        <div className="flex items-center justify-between text-[11px] font-medium mb-1.5">
          <span className="text-slate-500">Tasks completed</span>
          <span className="text-slate-700 font-semibold">
            {completed}/{considered.length} ({velocity}%)
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
          <div className="bg-blue-600 h-2 rounded-full transition-all duration-700" style={{ width: `${velocity}%` }} />
        </div>
      </div>
    </div>
  );
}
