"use client";

import React, { useMemo, useState } from "react";
import AppShell from "@/features/shell/AppShell";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";
import { EmptyBlock, ErrorBlock, LoadingBlock, Toast } from "@/features/shell/StatusViews";
import { growthApi } from "@/lib/api";
import { useApiData } from "@/lib/useApiData";
import WorkflowsKpiRow from "./WorkflowsKpiRow";
import WorkflowPipelineCard from "./WorkflowPipelineCard";
import TasksTable from "./TasksTable";
import StageDetailsModal from "./StageDetailsModal";
import CreateTaskModal from "./CreateTaskModal";
import { buildActiveRun, taskKpis, toGrowthTask } from "../adapters";
import { PipelineStage, GrowthTask } from "../types";

function WorkflowsContent() {
  const { workspace, canEdit } = useWorkspace();
  const { data, error, loading, reload } = useApiData(workspace.id, async (signal) => {
    const [tasks, campaigns] = await Promise.all([
      growthApi.listTasks(workspace.id, signal),
      growthApi.listCampaigns(workspace.id, signal),
    ]);
    return { tasks: tasks.items, campaigns: campaigns.items };
  });

  // Selection state for detail modal ("màn hình nhỏ đó")
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<PipelineStage | null>(null);
  const [selectedTask, setSelectedTask] = useState<GrowthTask | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const byId = new Map(data.tasks.map((t) => [t.id, t]));
    return {
      run: buildActiveRun(data.tasks, data.campaigns),
      tasks: data.tasks.map((t) => toGrowthTask(t, byId)),
      kpis: taskKpis(data.tasks),
    };
  }, [data]);

  // Click on a stage from the pipeline
  const handleSelectStage = (stage: PipelineStage) => {
    setSelectedStage(stage);
    setSelectedTask(null);
    setIsModalOpen(true);
  };

  // Click on a task from the table
  const handleSelectTask = (task: GrowthTask) => {
    setSelectedTask(task);
    setSelectedStage(null);
    setIsModalOpen(true);
  };

  // Click on "View execution trace": mở stage đang dở
  const handleViewTrace = () => {
    const stages = view?.run?.stages ?? [];
    const current = stages.find((s) => s.status !== "Completed") ?? stages[stages.length - 1];
    if (!current) return;
    setSelectedStage(current);
    setSelectedTask(null);
    setIsModalOpen(true);
  };

  return (
    <main className="flex-1 p-6 lg:p-8 space-y-6 max-w-[1600px] w-full mx-auto">
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      {/* ── Page Header / Operations Title ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
              AI Growth Operations
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 border border-slate-200/90 text-slate-600">
              {workspace.name}
            </span>
          </div>
          <p className="text-xs md:text-sm text-slate-500 mt-1">
            Monitor autonomous growth workflows, agent execution, and tasks requiring attention.
          </p>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="bg-white border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
          >
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{loading ? "Refreshing…" : "Refresh"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            disabled={!canEdit}
            title={canEdit ? "Create a new task" : "Viewers cannot create tasks"}
            className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm shadow-blue-500/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>New AI run</span>
          </button>
        </div>
      </div>

      {error && <ErrorBlock error={error} onRetry={reload} />}
      {!view && loading && <LoadingBlock label="Loading workflow tasks…" />}

      {view && (
        <>
          {/* ── 1. KPI Stat Cards ── */}
          <WorkflowsKpiRow kpis={view.kpis} />

          {/* ── 2. Active AI Run & Horizontal Pipeline Flow ── */}
          {view.run ? (
            <WorkflowPipelineCard
              workflow={view.run}
              selectedStageId={selectedStage?.id}
              onSelectStage={handleSelectStage}
              onViewTrace={handleViewTrace}
            />
          ) : (
            <EmptyBlock
              title="No AI runs yet"
              description="Create a task for one of the six agents to start a workflow in this workspace."
            />
          )}

          {/* ── 3. Tasks Table (Filterable, Interactive) ── */}
          <TasksTable tasks={view.tasks} onSelectTask={handleSelectTask} />
        </>
      )}

      {/* ── 4. Stage & Task Details Modal ("màn hình nhỏ đó") ── */}
      <StageDetailsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        stage={selectedStage}
        task={selectedTask}
      />

      <CreateTaskModal
        isOpen={isCreateOpen}
        workspaceId={workspace.id}
        canEdit={canEdit}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(task) => {
          setToast(`Task created and queued: ${String(task.payload?.title ?? task.operation)}`);
          reload();
        }}
      />
    </main>
  );
}

export default function WorkflowsClientView() {
  return (
    <AppShell activeTab="workflows" pageTitle="Workflows & Tasks">
      <WorkflowsContent />
    </AppShell>
  );
}
