"use client";

import React, { useEffect, useState } from "react";
import { ApiError, growthApi } from "@/lib/api";
import type { AgentRole, WorkflowTask } from "@/lib/apiTypes";
import { AGENT_LABELS, AGENT_OPERATIONS, AGENT_ROLE_ORDER, operationLabel } from "@/lib/format";

export interface TaskDraft {
  role: AgentRole;
  operation: string;
  title: string;
  description: string;
}

interface CreateTaskModalProps {
  isOpen: boolean;
  workspaceId: string;
  canEdit: boolean;
  initialDraft?: Partial<TaskDraft>;
  onClose: () => void;
  onCreated: (task: WorkflowTask) => void;
}

const EMPTY_DRAFT: TaskDraft = { role: "research", operation: "research.run", title: "", description: "" };

/** Tạo workflow task mới qua POST /v1/workspaces/{id}/tasks (owner/editor). */
export default function CreateTaskModal(props: CreateTaskModalProps) {
  // Form mount lại mỗi lần mở nên state luôn bắt đầu từ initialDraft
  return props.isOpen ? <CreateTaskForm {...props} /> : null;
}

function CreateTaskForm({ workspaceId, canEdit, initialDraft, onClose, onCreated }: CreateTaskModalProps) {
  const [draft, setDraft] = useState<TaskDraft>(() => ({ ...EMPTY_DRAFT, ...initialDraft }));
  const [priority, setPriority] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleRoleChange = (role: AgentRole) => {
    setDraft((d) => ({ ...d, role, operation: AGENT_OPERATIONS[role][0] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) {
      setError("Please enter a task title.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const task = await growthApi.createTask(workspaceId, {
        role: draft.role,
        operation: draft.operation,
        priority,
        payload: { title: draft.title.trim(), description: draft.description.trim() },
      });
      onCreated(task);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? `${err.message} (${err.code})` : "Could not create the task.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4"
      >
        <div>
          <h2 className="text-base font-bold text-slate-900">Create growth task</h2>
          <p className="text-xs text-slate-500 mt-0.5">The task is queued for the selected agent and appears in Workflows.</p>
        </div>

        {!canEdit && (
          <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2">
            Your role is viewer. Only owners and editors can create tasks.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Agent</span>
            <select
              className={inputClass}
              value={draft.role}
              onChange={(e) => handleRoleChange(e.target.value as AgentRole)}
            >
              {AGENT_ROLE_ORDER.map((role) => (
                <option key={role} value={role}>
                  {AGENT_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-600">Operation</span>
            <select
              className={inputClass}
              value={draft.operation}
              onChange={(e) => setDraft((d) => ({ ...d, operation: e.target.value }))}
            >
              {AGENT_OPERATIONS[draft.role].map((op) => (
                <option key={op} value={op}>
                  {operationLabel(op)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-slate-600">Title</span>
          <input
            className={inputClass}
            value={draft.title}
            maxLength={200}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="e.g. Research Hoi An long-stay demand"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-slate-600">Description</span>
          <textarea
            className={`${inputClass} min-h-[80px]`}
            value={draft.description}
            maxLength={2000}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="What should the agent do and what does done look like?"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-slate-600">Priority (1 = highest)</span>
          <select className={inputClass} value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((p) => (
              <option key={p} value={p}>
                P{p}
              </option>
            ))}
          </select>
        </label>

        {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs px-4 py-2 rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canEdit || submitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs px-4 py-2 rounded-xl cursor-pointer"
          >
            {submitting ? "Creating…" : "Create task"}
          </button>
        </div>
      </form>
    </div>
  );
}
