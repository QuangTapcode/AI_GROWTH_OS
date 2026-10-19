"use client";

import React, { useState } from "react";
import type { ContentArtifact } from "@/lib/apiTypes";
import { payloadArray, shortCode, timeAgo } from "@/lib/format";
import type { TaskDraft } from "@/features/workflows/components/CreateTaskModal";

interface Opportunity {
  topic?: string;
  keyword?: string;
  priority?: string;
  hypothesis?: string;
  confidence?: number;
}

interface RecommendedActionsCardProps {
  artifacts: ContentArtifact[];
  canEdit: boolean;
  onCreateTask: (draft: Partial<TaskDraft>) => void;
}

/** Đề xuất lấy từ artifact opportunity.score mới nhất của Growth Lead Agent. */
export default function RecommendedActionsCard({ artifacts, canEdit, onCreateTask }: RecommendedActionsCardProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const source = artifacts
    .filter((a) => a.operation === "opportunity.score")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const recommendations = source
    ? payloadArray<Opportunity>(source.payload, "opportunities")
        .filter((o) => o.topic)
        .sort((a, b) => (a.priority ?? "P9").localeCompare(b.priority ?? "P9"))
        .slice(0, 3)
    : [];

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-blue-600 text-base">✦</span>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight">Recommended next actions</h2>
          {source && (
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full">
              From {shortCode("ART", source.id)} · {timeAgo(source.created_at)}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer flex items-center gap-1"
        >
          Dismiss recommendations ✕
        </button>
      </div>

      {recommendations.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-4">
          No scored opportunities yet. Run the Growth Lead Agent&apos;s opportunity scoring to get recommendations.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {recommendations.map((rec, index) => (
            <div
              key={`${rec.topic}-${index}`}
              className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/30 hover:bg-white hover:border-blue-200 hover:shadow-xs transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                    {rec.priority ?? "—"}
                  </span>
                  {rec.keyword && <span className="text-[10px] text-slate-400 truncate pl-2">{rec.keyword}</span>}
                </div>
                <h3 className="text-xs font-bold text-slate-900 leading-snug mb-2">{rec.topic}</h3>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
                  <strong className="text-slate-700">Hypothesis:</strong> {rec.hypothesis ?? "Not provided."}
                </p>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-blue-600 font-semibold">
                  Confidence: {typeof rec.confidence === "number" ? `${Math.round(rec.confidence * 100)}%` : "—"}
                </span>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    onCreateTask({
                      role: "growth_lead",
                      operation: "brief.generate",
                      title: `Brief: ${rec.topic}`,
                      description: rec.hypothesis ?? "",
                    })
                  }
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create brief task
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
