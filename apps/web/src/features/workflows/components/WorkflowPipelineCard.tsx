"use client";

import React from "react";
import { ActiveAiRun, PipelineStage } from "../types";

interface WorkflowPipelineCardProps {
  workflow: ActiveAiRun;
  selectedStageId?: string;
  onSelectStage: (stage: PipelineStage) => void;
  onViewTrace: () => void;
}

export default function WorkflowPipelineCard({
  workflow,
  selectedStageId,
  onSelectStage,
  onViewTrace,
}: WorkflowPipelineCardProps) {
  // Helper to render stage icon based on type
  const renderStageIcon = (iconType: PipelineStage["iconType"], status: PipelineStage["status"]) => {
    switch (iconType) {
      case "search":
        return (
          <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        );
      case "chart":
        return (
          <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        );
      case "process":
        return (
          <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6.5h4M6.5 10v7.5a1 1 0 001 1H14" />
          </svg>
        );
      case "sparkles":
        return (
          <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
        );
      case "shield":
        return (
          <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        );
    }
  };

  // Helper for status badge on stage cards
  const renderStageStatusBadge = (status: PipelineStage["status"]) => {
    switch (status) {
      case "Completed":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
            <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Completed</span>
          </span>
        );
      case "Running":
        return (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            <span>Running</span>
          </span>
        );
      case "Queued":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-full">
            <span>Queued</span>
          </span>
        );
      case "Approval required":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
            <svg className="w-3 h-3 text-amber-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span>Approval required</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* ── Top Meta Bar ── */}
      <div className="px-6 pt-5 pb-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 border border-blue-200 text-blue-700">
            ACTIVE AI RUN
          </span>
          <span className="text-slate-300">•</span>
          <span className="text-xs font-semibold text-slate-600">
            {workflow.pipelineName}
          </span>
        </div>

        {/* Right meta badges & progress */}
        <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
          <span className="font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[11px]">
            {workflow.runId}
          </span>
          <span className="hidden sm:inline text-slate-300">•</span>
          <span>Trigger: <strong className="text-slate-700 font-semibold">{workflow.trigger}</strong></span>
          <span className="hidden sm:inline text-slate-300">•</span>
          <span>Agent: <strong className="text-slate-700 font-semibold">{workflow.agent}</strong></span>
          <span className="hidden sm:inline text-slate-300">•</span>
          <span>Started: {workflow.startedAt}</span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            Running
          </span>
          <span className="text-slate-400 font-mono text-[11px]">{workflow.duration}</span>

          {/* Progress bar info */}
          <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-200">
            <span className="text-[11px] text-slate-600 font-medium">
              {workflow.completedStages} of {workflow.totalStages} stages completed
            </span>
            <div className="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full"
                style={{ width: `${workflow.progressPercent}%` }}
              />
            </div>
            <span className="text-[11px] font-bold text-blue-600">
              {workflow.progressPercent}%
            </span>
          </div>
        </div>
      </div>

      {/* ── Main Heading & Subtitle ── */}
      <div className="px-6 pt-5 pb-4">
        <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
          {workflow.title}
        </h2>
        <p className="text-xs md:text-sm text-slate-500 mt-1 max-w-4xl">
          {workflow.description}
        </p>
      </div>

      {/* ── Workflow Execution Pipeline ── */}
      <div className="px-6 pb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            WORKFLOW EXECUTION PIPELINE
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
            <span>Click any stage to view stage details</span>
          </div>
        </div>

        {/* 5 Stages Grid / Pipeline horizontal flow */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 relative">
          {workflow.stages.map((stage) => {
            const isSelected = selectedStageId === stage.id;
            const isRunning = stage.status === "Running";

            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => onSelectStage(stage)}
                className={`relative text-left rounded-xl p-3.5 transition-all cursor-pointer border ${
                  isSelected
                    ? "bg-blue-50/40 border-blue-500 ring-2 ring-blue-500/30 shadow-sm"
                    : isRunning
                    ? "bg-blue-50/20 border-blue-400 ring-1 ring-blue-300 hover:shadow-xs"
                    : stage.status === "Completed"
                    ? "bg-emerald-50/20 border-emerald-200/90 hover:border-emerald-300 hover:bg-emerald-50/40"
                    : stage.status === "Approval required"
                    ? "bg-amber-50/20 border-amber-200/90 hover:border-amber-300 hover:bg-amber-50/40"
                    : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                }`}
              >
                {/* Stage Header: Icon & Status */}
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      stage.status === "Completed"
                        ? "bg-emerald-100/70"
                        : isRunning
                        ? "bg-blue-100"
                        : stage.status === "Approval required"
                        ? "bg-amber-100/70"
                        : "bg-slate-100"
                    }`}
                  >
                    {renderStageIcon(stage.iconType, stage.status)}
                  </div>
                  {renderStageStatusBadge(stage.status)}
                </div>

                {/* Stage Title & Subtitle */}
                <h4 className="text-xs font-bold text-slate-900 tracking-tight leading-tight">
                  {stage.title}
                </h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-tight line-clamp-2">
                  {stage.subtitle}
                </p>
              </button>
            );
          })}
        </div>

        {/* ── Current Step & Latest Activity Footer Strip ── */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              CURRENT STEP
            </p>
            <p className="text-xs font-bold text-slate-800 mt-0.5">
              {workflow.currentStep.title}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {workflow.currentStep.description}
            </p>
          </div>

          <div className="flex flex-col md:items-end gap-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              LATEST ACTIVITY
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-700">
                {workflow.latestActivity.title}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs text-slate-500">
                {workflow.latestActivity.agent} · {workflow.latestActivity.timestamp}
              </span>
            </div>
            <button
              type="button"
              onClick={onViewTrace}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1 cursor-pointer mt-0.5"
            >
              <span>View execution trace</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
