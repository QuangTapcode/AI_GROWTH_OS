"use client";

import React, { useState } from "react";
import { ArtifactDeliverable } from "../types";
import JsonPayloadModal from "@/features/review-queue/components/JsonPayloadModal";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { StatusPill } from "@/components/ui";

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
  const { t } = useLanguage();
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleSendClick = () => {
    onSendForReview(artifact);
    const msg = t.artifacts.sentToReviewToast.replace("{title}", artifact.title);
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const renderBadgeType = (badge: string, type: "intent" | "commercial" | "info") => {
    switch (type) {
      case "intent":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            {badge}
          </span>
        );
      case "commercial":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-blue-50 text-blue-700 border border-blue-200/80">
            {badge}
          </span>
        );
      case "info":
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-slate-100 text-slate-700 border border-slate-200/80">
            {badge}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 w-full">
      {/* Toast Notice */}
      {actionNotice && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-4 py-3 rounded-xl font-medium flex items-center justify-between shadow-xs animate-in fade-in">
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

      {/* ── 1. Top Strategic Report Card (24px padding) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6 md:p-8 space-y-6">
        {/* Top Header Row */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5 pb-5 border-b border-slate-100">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight leading-snug">
                {artifact.title}
              </h2>
              <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {artifact.version}
              </span>
            </div>

            {/* AI Status Badge */}
            <div className="pt-0.5">
              <StatusPill
                status="completed"
                label={artifact.aiStatusBadge}
              />
            </div>

            {/* Workspace Tag & Meta */}
            <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500 pt-1">
              <span className="px-2.5 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs">
                {artifact.workspaceTag}
              </span>
              <span className="text-slate-300">•</span>
              <span className="font-semibold text-slate-700">{artifact.agent}</span>
              <span className="text-slate-300">•</span>
              <span className="font-mono text-slate-500 font-semibold">{artifact.code}</span>
              <span className="text-slate-300">•</span>
              <span className="text-blue-600 font-semibold cursor-pointer hover:underline">
                ↺ {t.common.version} ({artifact.versionsCount})
              </span>
            </div>
          </div>

          {/* Action Buttons: Edit artifact & Send for review (40px height, distinct gap) */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            {/* Edit artifact button */}
            <button
              type="button"
              onClick={onOpenEditModal}
              className="h-10 px-4 rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer select-none active:translate-y-px"
            >
              <svg
                className="w-4 h-4 text-slate-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              <span>{t.artifacts.editArtifact}</span>
            </button>

            {/* Send for review button */}
            <button
              type="button"
              onClick={handleSendClick}
              className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all cursor-pointer select-none active:translate-y-px"
            >
              <svg
                className="w-4 h-4 fill-current"
                viewBox="0 0 24 24"
              >
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
              <span>{t.artifacts.sendForReviewBtn}</span>
            </button>
          </div>
        </div>

        {/* ── Executive Insight Callout (Soft background, 16-20px padding) ── */}
        <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-white border-l-4 border-l-blue-600 border border-blue-200/70 rounded-2xl p-5 text-xs md:text-sm leading-relaxed text-slate-700 shadow-xs">
          <p>
            <strong className="font-bold text-slate-900 block sm:inline mb-1 sm:mb-0 mr-2">
              {t.artifacts.executiveInsight}:
            </strong>
            {artifact.executiveInsight}
          </p>
        </div>

        {/* ── 3 High-Intent Cards Grid (Equal height cards) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {artifact.cards.map((card) => (
            <div
              key={card.number}
              className="bg-white border border-slate-200/90 rounded-2xl p-5 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-slate-300 transition-all group h-full"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono font-bold text-slate-400 group-hover:text-blue-600 transition-colors">
                    {card.number}
                  </span>
                  {renderBadgeType(card.badge, card.badgeType)}
                </div>

                <h4 className="text-sm font-bold text-slate-900 tracking-tight leading-snug">
                  {card.title}
                </h4>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  {card.description}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
                <span className="text-sm font-black text-slate-900">{card.volume}</span>
                <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80">
                  {card.kdText}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. Bottom AI Pipeline Card (Uniform node cards) ── */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Pipeline Header */}
        <div className="p-5 md:p-6 pb-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
              <span>{t.artifacts.aiPipeline}</span>
            </div>

            <StatusPill
              status="completed"
              label={artifact.pipeline.completedStagesText}
              size="sm"
            />

            <span className="text-xs text-slate-500 flex items-center gap-1.5 font-medium">
              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{artifact.pipeline.totalRunTime}</span>
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500">
              {t.artifacts.pipelineIdLabel}{" "}
              <strong className="font-mono text-slate-700">
                {artifact.pipeline.pipelineId}
              </strong>
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>{t.artifacts.deterministic}</span>
            </span>
          </div>
        </div>

        {/* Workflow Execution Node Visual */}
        <div className="p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {t.artifacts.autonomousWorkflow}
            </span>
            <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {t.artifacts.completedByAgent}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                {t.artifacts.activeOutputNode}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {t.artifacts.requiresReview}
              </span>
            </div>
          </div>

          {/* 6 Connected Nodes (Equal height cards, min 12px tags) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5 relative">
            {artifact.pipeline.nodes.map((node) => {
              const isSelected = node.status === "Selected";
              const isRequiresReview = node.status === "Requires Review";

              return (
                <div
                  key={node.nodeId}
                  className={`relative p-4 rounded-2xl border text-center transition-all flex flex-col justify-between h-full ${
                    isSelected
                      ? "bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/25 shadow-xs"
                      : isRequiresReview
                      ? "bg-amber-50/40 border-amber-300 ring-1 ring-amber-200"
                      : "bg-white border-slate-200/90 hover:border-slate-300"
                  }`}
                >
                  <div>
                    {/* Node icon circle */}
                    <div
                      className={`w-9 h-9 rounded-full mx-auto mb-2.5 flex items-center justify-center shadow-xs ${
                        isSelected
                          ? "bg-blue-600 text-white shadow-blue-500/20"
                          : isRequiresReview
                          ? "bg-amber-100 text-amber-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {node.iconType === "sparkles" ? (
                        <span className="text-sm">✦</span>
                      ) : node.iconType === "gavel" ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 13l-7.5 7.5a2.121 2.121 0 01-3-3L11 10" />
                          <path d="M16 16l6-6" />
                          <path d="M8 8l6-6" />
                          <path d="M9 7l8 8" />
                          <path d="M21 11l-8-8" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    <p className="text-xs font-bold text-slate-900 leading-tight">
                      {node.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 leading-tight font-medium">
                      {node.status}
                    </p>
                  </div>

                  {node.tag && (
                    <div className="pt-2">
                      <span className="inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-100 border border-slate-200 text-slate-700">
                        {node.tag}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Node Active Details Strip */}
          <div className="pt-3.5 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-slate-600">
              <span className="font-bold text-slate-800">{artifact.pipeline.activeNodeText}</span>
              <span className="text-slate-300">•</span>
              <span>{t.artifacts.agentLabel} <strong className="text-slate-700">{artifact.pipeline.activeAgent}</strong></span>
            </div>

            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full text-xs">
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span>{artifact.pipeline.activeStatusText}</span>
              </span>
            </div>
          </div>

          {/* Key Output Preview Bar */}
          <div className="bg-slate-50/90 border border-slate-200/80 rounded-xl p-3.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5 text-slate-700 font-medium truncate pr-2">
              <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="truncate">{artifact.pipeline.outputPreviewText}</span>
            </div>

            <button
              type="button"
              onClick={() => setIsJsonModalOpen(true)}
              className="text-blue-600 hover:text-blue-800 font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>{t.artifacts.viewJson}</span>
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
