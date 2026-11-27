'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import { OfficeAgentViewModel } from '../types';
import { AgentTaskSteps } from './AgentTaskSteps';

interface AgentInspectorProps {
  agent: OfficeAgentViewModel | null;
  onClose: () => void;
  workspaceId?: string;
  onRequestRunTask?: (agent: OfficeAgentViewModel) => void;
  onRequestRetryTask?: (agent: OfficeAgentViewModel) => void;
  isActionLoading?: boolean;
}

export function AgentInspector({
  agent,
  onClose,
  workspaceId,
  onRequestRunTask,
  onRequestRetryTask,
  isActionLoading = false,
}: AgentInspectorProps) {
  const [tabSelection, setTabSelection] = useState<{ code: string; tab: 'overview' | 'steps' | 'logs' }>({
    code: '',
    tab: 'overview',
  });
  const activeTab = agent && tabSelection.code === agent.code ? tabSelection.tab : 'overview';
  const setActiveTab = (tab: 'overview' | 'steps' | 'logs') => {
    if (agent) setTabSelection({ code: agent.code, tab });
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!agent) return null;

  const statusConfigs: Record<
    string,
    { label: string; badgeClass: string; dotClass: string }
  > = {
    running: {
      label: 'Đang Thực Thi',
      badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
      dotClass: 'bg-sky-400 animate-pulse',
    },
    idle: {
      label: 'Sẵn Sàng (Idle)',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      dotClass: 'bg-emerald-400',
    },
    queued: {
      label: 'Trong Hàng Đợi',
      badgeClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      dotClass: 'bg-blue-400',
    },
    needs_review: {
      label: 'Chờ Phê Duyệt',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      dotClass: 'bg-amber-400 animate-ping',
    },
    completed: {
      label: 'Hoàn Thành',
      badgeClass: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
      dotClass: 'bg-teal-400',
    },
    error: {
      label: 'Có Lỗi',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      dotClass: 'bg-rose-400',
    },
    cancelled: {
      label: 'Đã Huỷ',
      badgeClass: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
      dotClass: 'bg-slate-400',
    },
  };

  const currentStatus = statusConfigs[agent.status] ?? statusConfigs.idle;

  return (
    <AnimatePresence>
      <motion.aside
        key={agent.code}
        initial={{ opacity: 0, x: 40, y: 0 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, x: 40, y: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 280 }}
        aria-label="Agent Inspector"
        className="fixed sm:absolute bottom-0 left-0 right-0 sm:bottom-6 sm:top-28 sm:left-auto sm:right-4 w-full sm:w-[410px] max-h-[85vh] sm:max-h-none z-30 flex flex-col bg-slate-900/95 sm:bg-slate-900/90 backdrop-blur-2xl sm:backdrop-blur-xl border-t sm:border border-slate-700/80 rounded-t-3xl sm:rounded-2xl shadow-2xl text-slate-100 overflow-hidden"
      >
        {/* Mobile Drag Indicator Handle */}
        <div className="sm:hidden w-12 h-1 bg-slate-600 rounded-full mx-auto my-2" />

        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl shadow-inner border border-white/10"
              style={{ backgroundColor: `${agent.color}33` }}
            >
              {agent.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                  {agent.num}
                </span>
                <span className="text-[11px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {agent.department}
                </span>
              </div>
              <h3 className="font-bold text-sm text-white leading-tight mt-0.5">
                {agent.title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Đóng bảng chi tiết (Esc)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-800 bg-slate-950/60 px-4 pt-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`pb-2.5 px-2 font-semibold border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Tổng Quan
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('steps')}
            className={`pb-2.5 px-2 font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'steps'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Tiến Trình</span>
            {agent.status === 'running' && (
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`pb-2.5 px-2 font-semibold border-b-2 transition-colors ${
              activeTab === 'logs'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Nhật Ký Tác Vụ
          </button>
        </div>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {activeTab === 'overview' && (
            <>
              {/* Status Indicator */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/60">
                <span className="text-slate-400 font-medium">Trạng thái vận hành:</span>
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${currentStatus.badgeClass}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.dotClass}`} />
                  <span>{currentStatus.label}</span>
                </div>
              </div>

              {/* KPI & Core Responsibilities */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide uppercase text-slate-400">
                  Chỉ số KPI & Trách nhiệm chính
                </span>
                <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-900/40 text-blue-200 font-medium">
                  🎯 {agent.kpi}
                </div>
              </div>

              {/* Detailed Description */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide uppercase text-slate-400">
                  Mô tả nhiệm vụ tự hành
                </span>
                <p className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 text-slate-300 leading-relaxed">
                  {agent.desc}
                </p>
              </div>

              {/* Active Task or Idle State */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold tracking-wide uppercase text-slate-400">
                  Tác vụ hiện tại
                </span>
                {agent.currentTask ? (
                  <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-200">
                        {agent.currentTask.title}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">
                        {agent.currentTask.status}
                      </span>
                    </div>
                    {agent.currentTask.progressPercent !== null && (
                      <div className="space-y-1">
                        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-300"
                            style={{ width: `${agent.currentTask.progressPercent}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[10px] text-slate-400">
                          <span>Tiến độ hoàn thành</span>
                          <span>{agent.currentTask.progressPercent}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-700/40 text-slate-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500/70" />
                    <span>Đang túc trực 24/7. Hàng đợi tác vụ sẵn sàng.</span>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'steps' && (
            <AgentTaskSteps
              steps={agent.currentTask?.steps}
              currentOperation={agent.currentTask?.title}
              isCompleted={agent.status === 'completed'}
            />
          )}

          {activeTab === 'logs' && (
            <div className="space-y-3 font-mono">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Nhật ký thời gian thực</span>
                <span className="text-blue-400">Live Agent Stream</span>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-[11px] text-slate-300 max-h-64 overflow-y-auto">
                <div className="text-slate-500 flex gap-2">
                  <span>[00:00:01]</span>
                  <span>Agent initialized with role &apos;{agent.role}&apos;</span>
                </div>
                <div className="text-slate-400 flex gap-2">
                  <span>[00:00:03]</span>
                  <span>Connecting to workspace context: {workspaceId ?? 'ws-active'}</span>
                </div>
                {agent.currentTask && (
                  <div className="text-cyan-300 flex gap-2">
                    <span>[00:00:06]</span>
                    <span>Task received: &quot;{agent.currentTask.title}&quot;</span>
                  </div>
                )}
                {agent.status === 'running' && (
                  <div className="text-sky-400 flex gap-2 animate-pulse">
                    <span>[RUNNING]</span>
                    <span>Processing LLM pipeline & reasoning chains...</span>
                  </div>
                )}
                {agent.status === 'needs_review' && (
                  <div className="text-amber-400 flex gap-2">
                    <span>[APPROVAL]</span>
                    <span>Task completed execution. Awaiting human approval.</span>
                  </div>
                )}
                {agent.status === 'completed' && (
                  <div className="text-emerald-400 flex gap-2">
                    <span>[DONE]</span>
                    <span>Artifact generated and successfully published.</span>
                  </div>
                )}
                {agent.status === 'error' && (
                  <div className="text-rose-400 flex gap-2">
                    <span>[ERROR]</span>
                    <span>{agent.currentTask?.errorDetails || 'Operation failed during API handoff.'}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Quick Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-col gap-2">
          {/* If agent has tasks needing review, prominent Review Queue button */}
          {agent.status === 'needs_review' && (
            <Link
              href="/review-queue"
              className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-center text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
            >
              <span>Phê Duyệt Nội Dung (Review Queue) →</span>
            </Link>
          )}

          {/* If agent has an error, Retry Task button */}
          {(agent.status === 'error' || agent.currentTask?.status === 'failed') && onRequestRetryTask && (
            <button
              type="button"
              onClick={() => onRequestRetryTask(agent)}
              disabled={isActionLoading}
              className="w-full py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
            >
              {isActionLoading ? (
                <span className="animate-spin">⏳</span>
              ) : (
                <span>↺ Thử Lại Tác Vụ Thất Bại (Retry)</span>
              )}
            </button>
          )}

          {/* Primary Navigation to Dedicated Studio */}
          <Link
            href={agent.actionRoute}
            className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-center text-xs transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
          >
            <span>Mở Không Gian Làm Việc {agent.name}</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>

          {/* Secondary: Direct AI Task Execution */}
          {onRequestRunTask && agent.status !== 'running' && (
            <button
              type="button"
              onClick={() => onRequestRunTask(agent)}
              disabled={isActionLoading}
              className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors border border-slate-700 flex items-center justify-center gap-2"
            >
              <span>⚡ Kích Hoạt Tác Vụ Tự Hành (Run Now)</span>
            </button>
          )}
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
