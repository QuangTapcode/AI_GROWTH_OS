"use client";

import React, { useState, useMemo } from "react";
import { GrowthTask } from "../types";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { StatusPill } from "@/components/ui";

interface TasksTableProps {
  tasks: GrowthTask[];
  onSelectTask: (task: GrowthTask) => void;
}

export default function TasksTable({ tasks, onSelectTask }: TasksTableProps) {
  const { language, t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");

  // Filter tasks based on search, status, and agent
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch =
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.taskId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.agent.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ||
        task.status.toLowerCase().replace(/\s+/g, "-") === statusFilter;

      const matchesAgent =
        agentFilter === "all" || task.agent === agentFilter;

      return matchesSearch && matchesStatus && matchesAgent;
    });
  }, [tasks, searchQuery, statusFilter, agentFilter]);

  // Unique list of agents for dropdown
  const uniqueAgents = useMemo(() => {
    return Array.from(new Set(tasks.map((t) => t.agent)));
  }, [tasks]);

  const renderActionButton = (task: GrowthTask) => {
    if (task.actionType === "review") {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectTask(task);
          }}
          className="h-8 px-3.5 rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer whitespace-nowrap active:translate-y-px"
        >
          {language === "vi" ? "Duyệt ngay" : "Review"}
        </button>
      );
    }

    if (task.actionType === "resolve") {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectTask(task);
          }}
          className="h-8 px-3.5 rounded-lg bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer whitespace-nowrap active:translate-y-px"
        >
          {language === "vi" ? "Xử lý lỗi" : "Resolve"}
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelectTask(task);
        }}
        className="h-8 px-3 rounded-lg border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-blue-600 font-bold text-xs shadow-2xs transition-all cursor-pointer inline-flex items-center gap-1 whitespace-nowrap active:translate-y-px"
      >
        <span>{t.workflows.table.viewDetails}</span>
        <span aria-hidden="true">→</span>
      </button>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* ── Section Header ── */}
      <div className="p-6 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
        <div>
          <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
            {language === "vi" ? "Danh sách tác vụ" : "Tasks"}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === "vi"
              ? "Giám sát từng công việc của các AI Agent trong chiến dịch tăng trưởng."
              : "Monitor individual jobs across your growth operations."}
          </p>
        </div>

        <button
          type="button"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1 self-start sm:self-auto cursor-pointer"
        >
          <span>{language === "vi" ? "Xem toàn bộ tác vụ" : "View all tasks"}</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* ── Filters Bar (All controls exactly 40px height) ── */}
      <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200/70 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Search Input (40px) */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.workflows.table.searchPlaceholder}
            className="w-full h-10 bg-white border border-slate-300 hover:border-slate-400 rounded-xl pl-9 pr-4 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-3 focus:ring-blue-500/15 focus:border-blue-500 transition-all shadow-2xs"
          />
          <svg
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Status Dropdown (40px) */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter tasks by status"
              className="h-10 bg-white border border-slate-300 hover:border-slate-400 rounded-xl pl-3.5 pr-8 text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-3 focus:ring-blue-500/15 focus:border-blue-500 transition-all shadow-2xs cursor-pointer appearance-none"
            >
              <option value="all">{t.workflows.allStatuses}</option>
              <option value="running">{t.workflows.table.statusRunning}</option>
              <option value="completed">{t.workflows.table.statusCompleted}</option>
              <option value="needs-review">{t.workflows.table.statusReview}</option>
              <option value="queued">{t.workflows.table.statusInQueue}</option>
              <option value="blocked">{t.workflows.modal.blocked}</option>
            </select>
            <svg
              className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Agent Dropdown (40px) */}
          <div className="relative">
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              aria-label="Filter tasks by agent"
              className="h-10 bg-white border border-slate-300 hover:border-slate-400 rounded-xl pl-3.5 pr-8 text-xs font-semibold text-slate-700 focus:outline-hidden focus:ring-3 focus:ring-blue-500/15 focus:border-blue-500 transition-all shadow-2xs cursor-pointer appearance-none"
            >
              <option value="all">{t.workflows.allAgents}</option>
              {uniqueAgents.map((ag) => (
                <option key={ag} value={ag}>
                  {ag}
                </option>
              ))}
            </select>
            <svg
              className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Tasks Table (Sticky header, fixed widths, 48-52px row height) ── */}
      <div className="overflow-x-auto max-h-[560px]">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs">
            <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-600">
              <th className="py-3.5 px-6 w-[36%]">{t.workflows.table.task}</th>
              <th className="py-3.5 px-4 w-[16%]">{t.workflows.table.agent}</th>
              <th className="py-3.5 px-4 w-[16%]">{t.workflows.table.status}</th>
              <th className="py-3.5 px-4 w-[12%]">{language === "vi" ? "Lần chạy trước" : "Last run"}</th>
              <th className="py-3.5 px-4 w-[10%]">{language === "vi" ? "Cập nhật" : "Updated"}</th>
              <th className="py-3.5 px-6 w-[10%] text-right">{t.workflows.table.action}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 font-medium bg-white">
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                  {language === "vi" ? "Không tìm thấy tác vụ nào khớp bộ lọc." : "No tasks found matching your filters."}
                </td>
              </tr>
            ) : (
              filteredTasks.map((task) => (
                <tr
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className="h-[52px] hover:bg-blue-50/30 transition-colors cursor-pointer group"
                >
                  {/* Task Column */}
                  <td className="py-3 px-6">
                    <div className="flex items-center gap-2.5">
                      <span className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors text-xs md:text-sm truncate">
                        {task.title}
                      </span>
                      <span className="px-2 py-0.5 rounded-md text-xs font-mono font-semibold bg-slate-100 border border-slate-200 text-slate-600 shrink-0">
                        {task.taskId}
                      </span>
                    </div>
                  </td>

                  {/* AI Agent */}
                  <td className="py-3 px-4 text-slate-600 text-xs font-semibold truncate">
                    {task.agent}
                  </td>

                  {/* Status */}
                  <td className="py-3 px-4 whitespace-nowrap">
                    <StatusPill
                      status={task.status}
                      label={
                        task.status === "Running"
                          ? t.workflows.table.statusRunning
                          : task.status === "Completed"
                          ? t.workflows.table.statusCompleted
                          : task.status === "Needs review"
                          ? t.workflows.table.statusReview
                          : task.status === "Queued"
                          ? t.workflows.table.statusInQueue
                          : t.workflows.modal.blocked
                      }
                    />
                  </td>

                  {/* Last Run */}
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap font-mono text-xs">
                    {task.lastRun}
                  </td>

                  {/* Updated */}
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap text-xs">
                    {task.updated}
                  </td>

                  {/* Action */}
                  <td className="py-3 px-6 text-right whitespace-nowrap">
                    {renderActionButton(task)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
