"use client";

import React, { useState, useMemo } from "react";
import { ReviewItem } from "../types";

interface ReviewItemsListProps {
  items: ReviewItem[];
  selectedItemId: string;
  onSelectItem: (item: ReviewItem) => void;
}

export default function ReviewItemsList({
  items,
  selectedItemId,
  onSelectItem,
}: ReviewItemsListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilterTab, setActiveFilterTab] = useState<"needs_approval" | "all">("needs_approval");

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.taskId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.agent.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());

      if (activeFilterTab === "needs_approval") {
        return matchesSearch && item.status === "pending";
      }
      return matchesSearch;
    });
  }, [items, searchQuery, activeFilterTab]);

  const renderBadge = (tag: ReviewItem["statusTag"]) => {
    if (tag === "Review") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span>Review</span>
        </span>
      );
    }
    if (tag === "Approved") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <span>Approved</span>
        </span>
      );
    }
    if (tag === "Rejected") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
          <span>Rejected</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
        Queued
      </span>
    );
  };

  return (
    <div className="flex flex-col space-y-3.5 w-full">
      {/* ── Search Input ── */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter artifacts..."
          className="w-full bg-white border border-slate-200/90 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
        />
        <svg
          className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* ── Filter Tabs & Sort ── */}
      <div className="flex items-center justify-between pt-0.5">
        <div className="flex items-center gap-1 bg-slate-100/80 p-0.5 rounded-xl border border-slate-200/60">
          <button
            type="button"
            onClick={() => setActiveFilterTab("needs_approval")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeFilterTab === "needs_approval"
                ? "bg-white text-slate-900 shadow-2xs font-bold"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Needs Approval ({items.filter((i) => i.status === "pending").length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilterTab("all")}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeFilterTab === "all"
                ? "bg-white text-slate-900 shadow-2xs font-bold"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            All (16)
          </button>
        </div>

        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          SORT: NEWEST
        </span>
      </div>

      {/* ── Artifacts Card List ── */}
      <div className="space-y-2.5">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 text-center border border-slate-200/80 text-xs text-slate-400">
            No artifacts found matching your filter.
          </div>
        ) : (
          filteredItems.map((item) => {
            const isSelected = selectedItemId === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectItem(item)}
                className={`w-full text-left p-4 rounded-2xl transition-all cursor-pointer border ${
                  isSelected
                    ? "bg-white border-l-4 border-l-blue-600 border-t-slate-200/90 border-r-slate-200/90 border-b-slate-200/90 shadow-sm ring-1 ring-blue-500/10"
                    : "bg-white/80 hover:bg-white border-slate-200/80 hover:border-slate-300 shadow-2xs"
                }`}
              >
                {/* Header: Title, version & badge */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-bold text-slate-900 tracking-tight leading-snug truncate">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-none">
                      <span className="font-semibold text-slate-500">{item.version}</span>
                      {" · "}
                      <span>{item.category}</span>
                      {" · "}
                      <span>{item.timeAgo}</span>
                    </p>
                  </div>
                  <div className="shrink-0">{renderBadge(item.statusTag)}</div>
                </div>

                {/* Snippet */}
                <p className="text-[11px] text-slate-500 mt-2 line-clamp-1 leading-relaxed">
                  {item.executiveSummary}
                </p>

                {/* Footer: Agent & Task ID */}
                <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100 text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-600 font-medium">
                    <svg
                      className="w-3.5 h-3.5 text-blue-600 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="3" width="7" height="7" rx="1" />
                      <rect x="14" y="14" width="7" height="7" rx="1" />
                      <path d="M10 6.5h4M6.5 10v7.5a1 1 0 001 1H14" />
                    </svg>
                    <span className="truncate max-w-[140px]">{item.agent}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 font-medium">
                    {item.taskId}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
