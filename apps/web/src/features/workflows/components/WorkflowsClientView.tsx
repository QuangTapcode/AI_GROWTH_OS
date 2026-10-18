"use client";

import React, { useState } from "react";
import DashboardSidebar, {
  DEFAULT_WORKSPACES,
  type WorkspaceItem,
} from "@/features/dashboard/components/DashboardSidebar";
import DashboardHeader from "@/features/dashboard/components/DashboardHeader";
import WorkflowsKpiRow from "./WorkflowsKpiRow";
import WorkflowPipelineCard from "./WorkflowPipelineCard";
import TasksTable from "./TasksTable";
import StageDetailsModal from "./StageDetailsModal";
import { MOCK_ACTIVE_AI_RUN, MOCK_TASKS } from "../data/workflowsMockData";
import { PipelineStage, GrowthTask } from "../types";

export default function WorkflowsClientView() {
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceItem>(
    DEFAULT_WORKSPACES[0]
  );
  const [activeTab, setActiveTab] = useState("workflows");

  // Selection state for detail modal ("màn hình nhỏ đó")
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<PipelineStage | null>(
    MOCK_ACTIVE_AI_RUN.stages[2] // Stage 3 initially loaded
  );
  const [selectedTask, setSelectedTask] = useState<GrowthTask | null>(null);

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

  // Click on "View execution trace"
  const handleViewTrace = () => {
    const runningStage = MOCK_ACTIVE_AI_RUN.stages.find(
      (s) => s.status === "Running"
    ) || MOCK_ACTIVE_AI_RUN.stages[2];
    setSelectedStage(runningStage);
    setSelectedTask(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex w-full font-sans antialiased text-slate-800">
      {/* ── Left Sidebar (Cobalt Theme) ── */}
      <DashboardSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedWorkspace={currentWorkspace}
        onWorkspaceChange={setCurrentWorkspace}
      />

      {/* ── Right Content Area ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        {/* Top Navbar */}
        <DashboardHeader
          workspaceName={currentWorkspace.name}
          currentPageTitle="Workflows & Tasks"
        />

        {/* Main Canvas */}
        <main className="flex-1 p-6 lg:p-8 space-y-6 max-w-[1600px] w-full mx-auto">
          {/* ── Page Header / Operations Title ── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                  AI Growth Operations
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 border border-slate-200/90 text-slate-600">
                  Prototype data • {currentWorkspace.name} AI Growth OS
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-500 mt-1">
                Monitor autonomous growth workflows, agent execution, and tasks requiring attention.
              </p>
            </div>

            {/* Right Action Controls */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Execution history button */}
              <button
                type="button"
                className="bg-white border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
              >
                <svg
                  className="w-3.5 h-3.5 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Execution history</span>
              </button>

              {/* + New AI run button */}
              <button
                type="button"
                className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm shadow-blue-500/25 transition-all cursor-pointer"
              >
                <svg
                  className="w-3.5 h-3.5 fill-current"
                  viewBox="0 0 24 24"
                >
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                <span>New AI run</span>
              </button>
            </div>
          </div>

          {/* ── 1. KPI Stat Cards (Running: 3, Completed: 35, etc.) ── */}
          <WorkflowsKpiRow />

          {/* ── 2. Active AI Run & Horizontal Pipeline Flow ── */}
          <WorkflowPipelineCard
            workflow={MOCK_ACTIVE_AI_RUN}
            selectedStageId={selectedStage?.id}
            onSelectStage={handleSelectStage}
            onViewTrace={handleViewTrace}
          />

          {/* ── 3. Tasks Table (Filterable, Interactive) ── */}
          <TasksTable
            tasks={MOCK_TASKS}
            onSelectTask={handleSelectTask}
          />
        </main>
      </div>

      {/* ── 4. Stage & Task Details Modal ("màn hình nhỏ đó") ── */}
      <StageDetailsModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        stage={selectedStage}
        task={selectedTask}
      />
    </div>
  );
}
