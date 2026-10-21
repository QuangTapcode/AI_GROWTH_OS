"use client";

import React, { useState, useMemo } from "react";
import { ArtifactDeliverable } from "../types";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { StatusPill } from "@/components/ui";

interface ArtifactsListProps {
  artifacts: ArtifactDeliverable[];
  selectedArtifactId: string;
  onSelectArtifact: (artifact: ArtifactDeliverable) => void;
}

export default function ArtifactsList({
  artifacts,
  selectedArtifactId,
  onSelectArtifact,
}: ArtifactsListProps) {
  const { t, formatTimeAgo } = useLanguage();
  const [filterQuery, setFilterQuery] = useState("");

  const filteredArtifacts = useMemo(() => {
    return artifacts.filter((art) => {
      return (
        art.title.toLowerCase().includes(filterQuery.toLowerCase()) ||
        art.code.toLowerCase().includes(filterQuery.toLowerCase()) ||
        art.category.toLowerCase().includes(filterQuery.toLowerCase()) ||
        art.status.toLowerCase().includes(filterQuery.toLowerCase())
      );
    });
  }, [artifacts, filterQuery]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-5 space-y-4">
      {/* ── Deliverables Header ── */}
      <div className="flex items-center justify-between pb-1 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
            {t.artifacts.deliverablesTitle}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
            {artifacts.length}
          </span>
        </div>

        <button
          type="button"
          title={t.common.filter}
          className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 10h12M9 16h6" />
          </svg>
        </button>
      </div>

      {/* ── Search Input (40px) ── */}
      <div className="relative">
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder={t.artifacts.filterListPlaceholder}
          className="w-full h-10 bg-slate-50/80 border border-slate-300 hover:border-slate-400 rounded-xl pl-9 pr-3 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-3 focus:ring-blue-500/15 focus:border-blue-500 transition-all shadow-2xs"
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

      {/* ── Deliverables Cards List (16px padding on items, independent scroll) ── */}
      <div className="space-y-3 pt-1 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
        {filteredArtifacts.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            {t.artifacts.noDeliverablesFound}
          </div>
        ) : (
          filteredArtifacts.map((art) => {
            const isSelected = selectedArtifactId === art.id;

            return (
              <button
                key={art.id}
                type="button"
                onClick={() => onSelectArtifact(art)}
                className={`w-full text-left p-4 rounded-xl transition-all duration-150 cursor-pointer border ${
                  isSelected
                    ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                    : "bg-white hover:bg-slate-50 border-slate-200/90 hover:border-slate-300 shadow-2xs hover:shadow-xs"
                }`}
              >
                {/* Category & Status */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span
                    className={`text-xs font-mono font-bold uppercase tracking-wider ${
                      isSelected ? "text-blue-700" : "text-slate-500"
                    }`}
                  >
                    {art.category}
                  </span>
                  <StatusPill
                    size="sm"
                    status={
                      art.status === "Complete" || art.status === "Validated"
                        ? "completed"
                        : art.status === "In progress"
                        ? "running"
                        : "queued"
                    }
                    label={
                      art.status === "Complete"
                        ? t.artifacts.statusComplete
                        : art.status === "Validated"
                        ? t.artifacts.statusValidated
                        : art.status === "In progress"
                        ? t.artifacts.statusInProgress
                        : t.artifacts.statusQueued
                    }
                  />
                </div>

                {/* Title */}
                <h4 className="text-sm font-bold text-slate-900 tracking-tight leading-snug line-clamp-2 mb-2">
                  {art.title}
                </h4>

                {/* Subtitle / Code & Version */}
                <div className="flex items-center gap-2 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
                  <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200">
                    {art.code}
                  </span>
                  <span className="font-medium">{art.version}</span>
                  <span className="text-slate-300">•</span>
                  <span>{formatTimeAgo(art.timeAgo)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
