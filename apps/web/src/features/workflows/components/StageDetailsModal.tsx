"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { PipelineStage, GrowthTask } from "../types";

interface StageDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  stage?: PipelineStage | null;
  task?: GrowthTask | null;
}

export default function StageDetailsModal({
  isOpen,
  onClose,
  stage,
  task,
}: StageDetailsModalProps) {
  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || (!stage && !task)) return null;

  // Determine displayed fields based on whether a stage or task was selected
  const title = stage ? stage.title : task ? `${task.taskId} · ${task.title}` : "";
  const status = stage ? stage.status : task ? task.status : "";
  const progressPercent = stage ? stage.progressPercent : task ? task.progressPercent : null;
  const description = (stage ? stage.description : task?.description) || "No description provided.";
  const logs = stage?.logs || task?.logs || [];
  const needsReview = status === "Needs review" || status === "Approval required";

  // Status badge styling helper matching the mockup
  const getStatusBadge = (st: string) => {
    switch (st) {
      case "Completed":
        return {
          bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
          text: "Completed",
        };
      case "Running":
        return {
          bg: "bg-blue-50 text-blue-700 border-blue-200",
          text: "Running",
        };
      case "Needs review":
      case "Approval required":
        return {
          bg: "bg-amber-50 text-amber-700 border-amber-200",
          text: st,
        };
      case "Blocked":
      case "Failed":
        return {
          bg: "bg-rose-50 text-rose-700 border-rose-200",
          text: st,
        };
      default:
        return {
          bg: "bg-slate-100 text-slate-700 border-slate-200",
          text: st,
        };
    }
  };

  const statusStyle = getStatusBadge(status);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-2xs transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-[440px] overflow-hidden transform transition-all duration-200 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2 text-blue-600">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <path d="M10 6.5h4M6.5 10v7.5a1 1 0 001 1H14" />
            </svg>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight line-clamp-2">
              {title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
            title="Close dialog"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-left">
          {/* Section 1: STATUS & PROGRESS */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              STATUS &amp; PROGRESS
            </p>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusStyle.bg}`}
              >
                {statusStyle.text}
              </span>
              {progressPercent !== null && (
                <span className="text-xs text-slate-600 font-medium font-mono">{progressPercent}%</span>
              )}
            </div>
          </div>

          {/* Section 2: DESCRIPTION */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              DESCRIPTION
            </p>
            <p className="text-xs text-slate-600 leading-relaxed">
              {description}
            </p>
          </div>

          {/* Section 3: LIVE TRACE LOGS */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              EXECUTION TRACE
            </p>
            <div className="bg-[#f0fdf4] border border-emerald-200/60 rounded-xl p-3 font-mono text-[11px] text-emerald-800 space-y-1.5 shadow-inner select-text">
              {logs.length === 0 ? (
                <div className="text-slate-400">No events recorded yet.</div>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className="leading-relaxed break-all">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-white border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer transition-colors shadow-2xs"
          >
            Close
          </button>
          {needsReview && (
            <Link
              href="/review-queue"
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold rounded-xl cursor-pointer transition-all shadow-sm shadow-blue-500/25"
            >
              Inspect in Review Queue
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
