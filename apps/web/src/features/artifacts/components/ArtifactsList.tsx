"use client";

import React, { useState, useMemo } from "react";
import { ArtifactDeliverable } from "../types";

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

  const renderStatusDot = (status: ArtifactDeliverable["status"]) => {
    switch (status) {
      case "Complete":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
            <span>Complete</span>
          </span>
        );
      case "In progress":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            <span>In progress</span>
          </span>
        );
      case "Validated":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Validated</span>
          </span>
        );
      case "Queued":
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>Queued</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 space-y-3.5">
      {/* ── Deliverables Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            DELIVERABLES
          </span>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
            {artifacts.length}
          </span>
        </div>

        <button
          type="button"
          title="Filter and sort"
          className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M6 10h12M9 16h6" />
          </svg>
        </button>
      </div>

      {/* ── Search Input ── */}
      <div className="relative">
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Filter list..."
          className="w-full bg-slate-50/80 border border-slate-200/90 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
        />
        <svg
          className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* ── Deliverables Cards List ── */}
      <div className="space-y-2 pt-1">
        {filteredArtifacts.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">
            No deliverables found.
          </div>
        ) : (
          filteredArtifacts.map((art) => {
            const isSelected = selectedArtifactId === art.id;

            return (
              <button
                key={art.id}
                type="button"
                onClick={() => onSelectArtifact(art)}
                className={`w-full text-left p-3.5 rounded-xl transition-all cursor-pointer border ${
                  isSelected
                    ? "bg-[#eff6ff] border-blue-300 ring-1 ring-blue-500/20 shadow-xs"
                    : "bg-white hover:bg-slate-50/70 border-slate-200/80 hover:border-slate-300"
                }`}
              >
                {/* Category & Status */}
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      isSelected ? "text-blue-700" : "text-slate-400"
                    }`}
                  >
                    {art.category}
                  </span>
                  <div>{renderStatusDot(art.status)}</div>
                </div>

                {/* Title */}
                <h4 className="text-xs font-bold text-slate-900 tracking-tight leading-snug line-clamp-2">
                  {art.title}
                </h4>

                {/* Subtitle / Code & Version */}
                <p className="text-[11px] text-slate-400 mt-1 leading-tight">
                  <span className="font-mono font-medium text-slate-500">{art.code}</span>
                  {" · "}
                  <span>{art.version}</span>
                  {" · "}
                  <span>{art.timeAgo}</span>
                </p>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
