"use client";

import React, { useState, useMemo } from "react";
import { ReviewItem } from "../types";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { StatusPill } from "@/components/ui/StatusPill";

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
  const { language, formatTimeAgo } = useLanguage();
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

  const renderStatusPill = (tag: ReviewItem["statusTag"]) => {
    if (tag === "Review") {
      return (
        <StatusPill
          size="sm"
          status="pending"
          label={language === "vi" ? "Chờ duyệt" : "Review"}
        />
      );
    }
    if (tag === "Approved") {
      return (
        <StatusPill
          size="sm"
          status="completed"
          label={language === "vi" ? "Đã duyệt" : "Approved"}
        />
      );
    }
    if (tag === "Rejected") {
      return (
        <StatusPill
          size="sm"
          status="blocked"
          label={language === "vi" ? "Đã từ chối" : "Rejected"}
        />
      );
    }
    return (
      <StatusPill
        size="sm"
        status="queued"
        label={language === "vi" ? "Trong hàng đợi" : "Queued"}
      />
    );
  };

  return (
    <div className="flex flex-col space-y-3.5 w-full">
      {/* ── Search Input (40px height) ── */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={language === "vi" ? "Lọc tài nguyên cần duyệt..." : "Filter artifacts..."}
          className="w-full h-10 bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-300 hover:border-slate-400 rounded-xl pl-9 pr-4 text-xs md:text-sm font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-3 focus:ring-blue-500/15 focus:border-blue-500 transition-all shadow-2xs"
        />
        <svg
          className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
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
        <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveFilterTab("needs_approval")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeFilterTab === "needs_approval"
                ? "bg-white text-slate-900 shadow-2xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {language === "vi" ? "Cần phê duyệt" : "Needs Approval"} ({items.filter((i) => i.status === "pending").length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilterTab("all")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              activeFilterTab === "all"
                ? "bg-white text-slate-900 shadow-2xs font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {language === "vi" ? "Tất cả" : "All"} ({items.length})
          </button>
        </div>

        <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">
          {language === "vi" ? "MỚI NHẤT" : "NEWEST"}
        </span>
      </div>

      {/* ── Artifacts Card List (p-4 = 16px padding, independent scroll) ── */}
      <div className="space-y-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200/80 text-xs md:text-sm text-slate-400">
            {language === "vi" ? "Không tìm thấy nội dung phù hợp." : "No artifacts found matching your filter."}
          </div>
        ) : (
          filteredItems.map((item) => {
            const isSelected = selectedItemId === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectItem(item)}
                className={`w-full text-left p-4 rounded-xl transition-all duration-150 cursor-pointer border ${
                  isSelected
                    ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 shadow-xs"
                    : "bg-white hover:bg-slate-50 border-slate-200/90 hover:border-slate-300 shadow-2xs hover:shadow-xs"
                }`}
              >
                {/* Header: Title, version & badge */}
                <div className="flex items-start justify-between gap-2.5 mb-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-slate-900 tracking-tight leading-snug line-clamp-1">
                      {item.title}
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-blue-700 font-mono bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/60">
                        {item.version}
                      </span>
                      <span>•</span>
                      <span className="font-medium text-slate-600">{item.category}</span>
                      <span>•</span>
                      <span>{formatTimeAgo(item.timeAgo)}</span>
                    </p>
                  </div>
                  <div className="shrink-0 pt-0.5">{renderStatusPill(item.statusTag)}</div>
                </div>

                {/* Snippet */}
                <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                  {item.executiveSummary}
                </p>

                {/* Footer: Agent & Task ID */}
                <div className="flex items-center justify-between mt-3.5 pt-2.5 border-t border-slate-100 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                    <svg
                      className="w-4 h-4 text-blue-600 shrink-0"
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
                    <span className="truncate max-w-[150px] font-semibold">{item.agent}</span>
                  </div>
                  <span className="font-mono text-xs text-slate-600 font-bold bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/70">
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
