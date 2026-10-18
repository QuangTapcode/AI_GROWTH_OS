"use client";

import React, { useState } from "react";
import { ArtifactDeliverable } from "../types";
import JsonPayloadModal from "@/features/review-queue/components/JsonPayloadModal";

interface ArtifactDetailCanvasProps {
  artifact: ArtifactDeliverable;
  onOpenEditModal: () => void;
  onSendForReview: (artifact: ArtifactDeliverable) => void;
}

export default function ArtifactDetailCanvas({
  artifact,
  onOpenEditModal,
  onSendForReview,
}: ArtifactDetailCanvasProps) {
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleSendClick = () => {
    onSendForReview(artifact);
    setActionNotice("Artifact sent to Review Queue successfully! Human approval gate activated.");
    setTimeout(() => setActionNotice(null), 4000);
  };

  const renderBadgeType = (badge: string, type: "intent" | "commercial" | "info") => {
    switch (type) {
      case "intent":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
            {badge}
          </span>
        );
      case "commercial":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-blue-50 text-blue-700 border border-blue-200">
            {badge}
          </span>
        );
      case "info":
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-slate-100 text-slate-700 border border-slate-200">
            {badge}
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 w-full">
      {/* Toast Notice */}
      {actionNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-2.5 rounded-xl font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>{actionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-emerald-600 hover:text-emerald-900 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── 1. Top Strategic Report Card ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-5">
        {/* Top Header Row */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                {artifact.title}
              </h2>
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {artifact.version}
              </span>
            </div>

            {/* AI Status Badge */}
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>{artifact.aiStatusBadge}</span>
              </span>
            </div>

            {/* Workspace Tag & Meta */}
            <div className="flex items-center gap-2.5 flex-wrap text-xs text-slate-500 pt-1">
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium text-[11px]">
                {artifact.workspaceTag}
              </span>
              <span className="text-slate-300">•</span>
              <span className="font-semibold text-slate-700">{artifact.agent}</span>
              <span className="text-slate-300">•</span>
              <span className="font-mono text-slate-500">{artifact.code}</span>
              <span className="text-slate-300">•</span>
              <span className="text-blue-600 font-medium cursor-pointer hover:underline">
                ↺ Versions ({artifact.versionsCount})
              </span>
            </div>
          </div>

          {/* Action Buttons: Edit artifact & Send for review */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Edit artifact button -> Triggers Image 2 Modal */}
            <button
              type="button"
              onClick={onOpenEditModal}
              className="bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-200/90 text-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5 text-slate-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>Edit artifact</span>
            </button>

            {/* Send for review button */}
            <button
              type="button"
              onClick={handleSendClick}
              className="bg-[#1e3a8a] hover:bg-[#1e40af] active:bg-blue-900 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm shadow-blue-900/20 transition-all cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5 fill-current"
                viewBox="0 0 24 24"
              >
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
              <span>Send for review</span>
            </button>
          </div>
        </div>

        {/* ── Executive Insight Callout ── */}
        <div className="bg-blue-50/40 border-l-4 border-l-blue-600 border-t border-r border-b border-blue-100 rounded-r-xl p-4 text-xs leading-relaxed text-slate-700">
          <p>
            <strong className="font-bold text-slate-900">Executive Insight:</strong>{" "}
            {artifact.executiveInsight}
          </p>
        </div>

        {/* ── 3 High-Intent Cards Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
          {artifact.cards.map((card) => (
            <div
              key={card.number}
              className="bg-white border border-slate-200/90 rounded-2xl p-4 flex flex-col justify-between shadow-2xs hover:border-slate-300 transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono font-bold text-slate-400">
                    {card.number}
                  </span>
                  {renderBadgeType(card.badge, card.badgeType)}
                </div>

                <h4 className="text-xs font-bold text-slate-900 tracking-tight leading-snug">
                  {card.title}
                </h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  {card.description}
                </p>
              </div>

              <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-100 text-[11px]">
                <span className="font-bold text-slate-900">{card.volume}</span>
                <span className="font-semibold text-blue-600">{card.kdText}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. Bottom AI Pipeline Card ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        {/* Pipeline Header */}
        <div className="p-5 pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-blue-600 font-bold text-sm">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <path d="M10 6.5h4M6.5 10v7.5a1 1 0 001 1H14" />
              </svg>
              <span>AI Pipeline</span>
            </div>

            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              {artifact.pipeline.completedStagesText}
            </span>

            <span className="text-xs text-slate-500 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{artifact.pipeline.totalRunTime}</span>
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400">
              Pipeline ID:{" "}
              <strong className="font-mono text-slate-700">
                {artifact.pipeline.pipelineId}
              </strong>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>Deterministic</span>
            </span>
          </div>
        </div>

        {/* Workflow Execution Node Visual */}
        <div className="p-5 pb-4 space-y-4">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              AUTONOMOUS EXECUTION WORKFLOW
            </span>
            <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Completed by Agent
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                Active Output Node
              </span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Requires Review
              </span>
            </div>
          </div>

          {/* 6 Connected Nodes */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 relative">
            {artifact.pipeline.nodes.map((node) => {
              const isSelected = node.status === "Selected";
              const isRequiresReview = node.status === "Requires Review";

              return (
                <div
                  key={node.nodeId}
                  className={`relative p-3 rounded-xl border text-center transition-all ${
                    isSelected
                      ? "bg-blue-50/50 border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                      : isRequiresReview
                      ? "bg-amber-50/30 border-amber-300"
                      : "bg-white border-slate-200"
                  }`}
                >
                  {/* Node icon circle */}
                  <div
                    className={`w-7 h-7 rounded-full mx-auto mb-2 flex items-center justify-center ${
                      isSelected
                        ? "bg-blue-600 text-white"
                        : isRequiresReview
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {node.iconType === "sparkles" ? (
                      <span className="text-xs">✦</span>
                    ) : node.iconType === "gavel" ? (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 13l-7.5 7.5a2.121 2.121 0 01-3-3L11 10" />
                        <path d="M16 16l6-6" />
                        <path d="M8 8l6-6" />
                        <path d="M9 7l8 8" />
                        <path d="M21 11l-8-8" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>

                  <p className="text-xs font-bold text-slate-900 leading-tight">
                    {node.name}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                    {node.status}
                  </p>

                  {node.tag && (
                    <span className="inline-block mt-1.5 px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold bg-slate-100 text-slate-600">
                      {node.tag}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Node Active Details Strip */}
          <div className="pt-3 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <span className="font-bold text-slate-800">{artifact.pipeline.activeNodeText}</span>
              <span className="text-slate-300">•</span>
              <span>Agent: <strong className="text-slate-700">{artifact.pipeline.activeAgent}</strong></span>
            </div>

            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full text-[11px]">
                <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>{artifact.pipeline.activeStatusText}</span>
              </span>
            </div>
          </div>

          {/* Key Output Preview Bar */}
          <div className="bg-slate-50/80 border border-slate-200/80 rounded-xl p-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-slate-700 font-medium">
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span>{artifact.pipeline.outputPreviewText}</span>
            </div>

            <button
              type="button"
              onClick={() => setIsJsonModalOpen(true)}
              className="text-blue-600 hover:text-blue-800 font-semibold text-xs flex items-center gap-1 cursor-pointer"
            >
              <span>View JSON</span>
              <span aria-hidden="true">⤢</span>
            </button>
          </div>
        </div>
      </div>

      {/* JSON Payload Inspector Modal */}
      {artifact.jsonPayload && (
        <JsonPayloadModal
          isOpen={isJsonModalOpen}
          onClose={() => setIsJsonModalOpen(false)}
          title={artifact.title}
          payload={artifact.jsonPayload}
        />
      )}
    </div>
  );
}
