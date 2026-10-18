"use client";

import React, { useState, useMemo } from "react";
import { GrowthTask } from "../types";

interface TasksTableProps {
  tasks: GrowthTask[];
  onSelectTask: (task: GrowthTask) => void;
}

export default function TasksTable({ tasks, onSelectTask }: TasksTableProps) {
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

  const renderStatusPill = (status: GrowthTask["status"]) => {
    switch (status) {
      case "Running":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            <span>Running</span>
          </span>
        );
      case "Completed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span>Completed</span>
          </span>
        );
      case "Needs review":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>Needs review</span>
          </span>
        );
      case "Queued":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>Queued</span>
          </span>
        );
      case "Blocked":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span>Blocked</span>
          </span>
        );
    }
  };

  const renderActionButton = (task: GrowthTask) => {
    if (task.actionType === "review") {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectTask(task);
          }}
          className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold text-xs px-3 py-1 rounded-lg shadow-2xs transition-colors cursor-pointer"
        >
          Review
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
          className="border border-rose-300 hover:bg-rose-50 text-rose-600 font-semibold text-xs px-3 py-1 rounded-lg transition-colors cursor-pointer"
        >
          Resolve
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
        className="text-blue-600 hover:text-blue-800 font-semibold text-xs cursor-pointer hover:underline"
      >
        View
      </button>
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
      {/* ── Section Header ── */}
      <div className="p-6 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100">
        <div>
          <h3 className="text-xl font-bold text-slate-900 tracking-tight">
            Tasks
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor individual jobs across your growth operations.
          </p>
        </div>

        <button
          type="button"
          className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center gap-1 self-start sm:self-auto cursor-pointer"
        >
          <span>View all tasks</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>

      {/* ── Filters Bar ── */}
      <div className="px-6 py-3.5 bg-slate-50/70 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full bg-white border border-slate-200/90 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
          />
          <svg
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Status Dropdown */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter tasks by status"
              className="bg-white border border-slate-200/90 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs cursor-pointer appearance-none"
            >
              <option value="all">All statuses</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="needs-review">Needs review</option>
              <option value="queued">Queued</option>
              <option value="blocked">Blocked</option>
            </select>
            <svg
              className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Agent Dropdown */}
          <div className="relative">
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              aria-label="Filter tasks by agent"
              className="bg-white border border-slate-200/90 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-700 pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs cursor-pointer appearance-none"
            >
              <option value="all">All agents</option>
              {uniqueAgents.map((ag) => (
                <option key={ag} value={ag}>
                  {ag}
                </option>
              ))}
            </select>
            <svg
              className="w-3 h-3 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      </div>

      {/* ── Tasks Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-white">
              <th className="py-3 px-6">TASK</th>
              <th className="py-3 px-4">AI AGENT</th>
              <th className="py-3 px-4">STATUS</th>
              <th className="py-3 px-4">LAST RUN</th>
              <th className="py-3 px-4">UPDATED</th>
              <th className="py-3 px-6 text-right">ACTION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                  No tasks found matching your filters.
                </td>
              </tr>
            ) : (
              filteredTasks.map((task) => (
                <tr
                  key={task.id}
                  onClick={() => onSelectTask(task)}
                  className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                >
                  {/* Task Column */}
                  <td className="py-3.5 px-6">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                        {task.title}
                      </span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 border border-slate-200 text-slate-600 shrink-0">
                        {task.taskId}
                      </span>
                    </div>
                  </td>

                  {/* AI Agent */}
                  <td className="py-3.5 px-4 text-slate-600">
                    {task.agent}
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {renderStatusPill(task.status)}
                  </td>

                  {/* Last Run */}
                  <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                    {task.lastRun}
                  </td>

                  {/* Updated */}
                  <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                    {task.updated}
                  </td>

                  {/* Action */}
                  <td className="py-3.5 px-6 text-right whitespace-nowrap">
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
