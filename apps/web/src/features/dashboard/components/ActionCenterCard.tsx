"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { Approval, ContentArtifact, SystemException, WorkflowTask } from "@/lib/apiTypes";
import { timeAgo } from "@/lib/format";

interface ActionCenterCardProps {
  approvals: Approval[];
  artifacts: ContentArtifact[];
  exceptions: SystemException[];
  tasks: WorkflowTask[];
}

interface ActionItem {
  id: string;
  dotColor: string;
  title: string;
  priority: string;
  priorityColor: string;
  description: string;
  btnText: string;
  btnClass: string;
  href: string;
}

const SEVERITY_STYLE: Record<SystemException["severity"], { dot: string; badge: string }> = {
  critical: { dot: "bg-rose-600 shadow-[0_0_6px_rgba(225,29,72,0.6)]", badge: "bg-rose-50 text-rose-700 border-rose-200" },
  high: { dot: "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]", badge: "bg-rose-50 text-rose-700 border-rose-200" },
  medium: { dot: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  low: { dot: "bg-sky-500 shadow-[0_0_6px_rgba(14,165,233,0.6)]", badge: "bg-slate-100 text-slate-700 border-slate-200" },
};

const PRIMARY_BTN = "bg-blue-600 hover:bg-blue-700 text-white shadow-xs shadow-blue-500/20";
const SECONDARY_BTN = "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50";

export default function ActionCenterCard({ approvals, artifacts, exceptions, tasks }: ActionCenterCardProps) {
  const router = useRouter();
  const actions: ActionItem[] = [];

  const pending = approvals.filter((a) => a.status === "pending");
  if (pending.length > 0) {
    const titles = pending
      .map((a) => artifacts.find((art) => art.id === a.target_id)?.title)
      .filter(Boolean)
      .slice(0, 2);
    actions.push({
      id: "approvals",
      dotColor: "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]",
      title: `Review ${pending.length} pending item${pending.length > 1 ? "s" : ""}`,
      priority: "HIGH",
      priorityColor: "bg-rose-50 text-rose-700 border-rose-200",
      description: titles.length > 0 ? `${titles.join(" · ")}${pending.length > titles.length ? " and more" : ""}` : "AI outputs waiting for human sign-off.",
      btnText: "Review now",
      btnClass: PRIMARY_BTN,
      href: "/review-queue",
    });
  }

  const openExceptions = exceptions.filter((e) => e.status === "open" || e.status === "investigating");
  for (const ex of openExceptions.slice(0, 3)) {
    const style = SEVERITY_STYLE[ex.severity];
    actions.push({
      id: ex.id,
      dotColor: style.dot,
      title: ex.title,
      priority: ex.severity.toUpperCase(),
      priorityColor: style.badge,
      description: `${ex.description ?? ex.code} · ${ex.status} · opened ${timeAgo(ex.created_at)}`,
      btnText: ex.source_task_id ? "Open task" : "View workflows",
      btnClass: SECONDARY_BTN,
      href: "/workflows",
    });
  }

  const linkedTaskIds = new Set(openExceptions.map((e) => e.source_task_id));
  const failed = tasks.filter((t) => t.status === "failed" && !linkedTaskIds.has(t.id));
  if (failed.length > 0) {
    actions.push({
      id: "failed-tasks",
      dotColor: "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]",
      title: `${failed.length} failed task${failed.length > 1 ? "s" : ""}`,
      priority: "TASK",
      priorityColor: "bg-slate-100 text-slate-700 border-slate-200",
      description: "Agent tasks stopped with an error and need a retry or a fix.",
      btnText: "Resolve",
      btnClass: SECONDARY_BTN,
      href: "/workflows",
    });
  }

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">Action Center</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Decisions and tasks requiring your attention ({actions.length} pending)
            </p>
          </div>
          <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full shrink-0">
            {actions.length} Actionable
          </span>
        </div>

        {/* Action Items List */}
        <div className="space-y-3">
          {actions.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-6">Nothing needs your attention right now.</p>
          )}
          {actions.map((act) => (
            <div
              key={act.id}
              className="p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/40 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${act.dotColor}`} />
                  <p className="text-xs font-bold text-slate-900 truncate">{act.title}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${act.priorityColor}`}>
                    {act.priority}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed pl-4">{act.description}</p>
              </div>

              <button
                type="button"
                onClick={() => router.push(act.href)}
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
