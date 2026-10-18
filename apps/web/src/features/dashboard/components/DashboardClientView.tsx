"use client";

import React, { useState } from "react";
import AppShell from "@/features/shell/AppShell";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";
import { ErrorBlock, LoadingBlock, Toast } from "@/features/shell/StatusViews";
import CreateTaskModal, { type TaskDraft } from "@/features/workflows/components/CreateTaskModal";
import { growthApi } from "@/lib/api";
import { toIsoDate } from "@/lib/format";
import { useApiData } from "@/lib/useApiData";
import KpiMetricsRow from "./KpiMetricsRow";
import TrafficTrendChart from "./TrafficTrendChart";
import AgentActivityCard from "./AgentActivityCard";
import ActionCenterCard from "./ActionCenterCard";
import GrowthPipelineCard from "./GrowthPipelineCard";
import RecommendedActionsCard from "./RecommendedActionsCard";

const RANGES = [7, 30, 90] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

function periodRange(days: number, offsetPeriods = 0) {
  const end = new Date(Date.now() - offsetPeriods * days * DAY_MS);
  const start = new Date(end.getTime() - (days - 1) * DAY_MS);
  return { from: toIsoDate(start), to: toIsoDate(end) };
}

function DashboardContent() {
  const { workspace, canEdit, refreshAttention } = useWorkspace();
  const [rangeDays, setRangeDays] = useState<(typeof RANGES)[number]>(30);
  const [taskDraft, setTaskDraft] = useState<Partial<TaskDraft> | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, error, loading, reload } = useApiData(`${workspace.id}:${rangeDays}`, async (signal) => {
    const [tasks, approvals, artifacts, exceptions, report, previous] = await Promise.all([
      growthApi.listTasks(workspace.id, signal),
      growthApi.listApprovals(workspace.id, signal),
      growthApi.listArtifacts(workspace.id, signal),
      growthApi.listExceptions(workspace.id, signal),
      growthApi.getReport(workspace.id, periodRange(rangeDays), signal),
      growthApi.getReport(workspace.id, periodRange(rangeDays, 1), signal),
    ]);
    return {
      tasks: tasks.items,
      approvals: approvals.items,
      artifacts: artifacts.items,
      exceptions: exceptions.items,
      report,
      previous,
    };
  });

  const handleRefresh = () => {
    reload();
    refreshAttention();
  };

  return (
    <main className="flex-1 p-6 lg:p-8 space-y-6 max-w-[1600px] w-full mx-auto">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* ── Page Header / Command Center Title ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">GROWTH COMMAND CENTER</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-0.5">Overview</h1>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Monitor growth performance, AI activity, and the next actions for{" "}
            <span className="font-semibold text-slate-700">{workspace.name}</span>.
          </p>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Date Filter */}
          <label className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700 flex items-center gap-2 shadow-xs">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <select
              value={rangeDays}
              onChange={(e) => setRangeDays(Number(e.target.value) as (typeof RANGES)[number])}
              className="bg-transparent focus:outline-none cursor-pointer"
              aria-label="Report period"
            >
              {RANGES.map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </select>
          </label>

          {/* Refresh button */}
          <button
            type="button"
            title="Refresh metrics"
            onClick={handleRefresh}
            disabled={loading}
            className="bg-white border border-slate-200/90 hover:border-slate-300 p-2 rounded-xl text-slate-600 hover:text-slate-900 shadow-xs cursor-pointer transition-colors disabled:opacity-60"
          >
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          {/* Primary CTA: Create growth task */}
          <button
            type="button"
            onClick={() => setTaskDraft({})}
            disabled={!canEdit}
            title={canEdit ? "Create a new task" : "Viewers cannot create tasks"}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm shadow-blue-500/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-base font-bold leading-none">+</span>
            <span>Create growth task</span>
          </button>
        </div>
      </div>

      {error && <ErrorBlock error={error} onRetry={reload} />}
      {!data && loading && <LoadingBlock label="Loading workspace overview…" />}

      {data && (
        <>
          {/* ── 1. KPI Summary Cards ── */}
          <KpiMetricsRow report={data.report} previous={data.previous} />

          {/* ── 2. Middle Row: Traffic Chart & AI Agent Activity ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className="lg:col-span-7 flex flex-col">
              <TrafficTrendChart report={data.report} />
            </div>
            <div className="lg:col-span-5 flex flex-col">
              <AgentActivityCard tasks={data.tasks} />
            </div>
          </div>

          {/* ── 3. Lower Row: Action Center & Growth Pipeline ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            <ActionCenterCard
              approvals={data.approvals}
              artifacts={data.artifacts}
              exceptions={data.exceptions}
              tasks={data.tasks}
            />
            <GrowthPipelineCard
              workspaceName={workspace.name}
              tasks={data.tasks}
              approvals={data.approvals}
              leads={data.report.kpis.leads_generated?.value ?? null}
            />
          </div>

          {/* ── 4. Bottom Row: Recommended Next Actions ── */}
          <RecommendedActionsCard artifacts={data.artifacts} canEdit={canEdit} onCreateTask={setTaskDraft} />
        </>
      )}

      <CreateTaskModal
        isOpen={taskDraft !== null}
        workspaceId={workspace.id}
        canEdit={canEdit}
        initialDraft={taskDraft ?? undefined}
        onClose={() => setTaskDraft(null)}
        onCreated={(task) => {
          setToast(`Task created and queued: ${String(task.payload?.title ?? task.operation)}`);
          reload();
        }}
      />
    </main>
  );
}

export default function DashboardClientView() {
  return (
    <AppShell activeTab="overview" pageTitle="Overview">
      <DashboardContent />
    </AppShell>
  );
}
