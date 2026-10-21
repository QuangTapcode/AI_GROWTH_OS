"use client";

import React, { useState } from "react";
import DashboardSidebar, {
  DEFAULT_WORKSPACES,
  type WorkspaceItem,
} from "@/features/dashboard/components/DashboardSidebar";
import DashboardHeader from "@/features/dashboard/components/DashboardHeader";
import ReviewItemsList from "./ReviewItemsList";
import ReviewDetailView from "./ReviewDetailView";
import { MOCK_REVIEW_ITEMS, MOCK_REVIEW_STATS } from "../data/reviewQueueMockData";
import { ReviewItem, ReviewQueueStats } from "../types";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function ReviewQueueClientView() {
  const { t } = useLanguage();
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceItem>(
    DEFAULT_WORKSPACES[0]
  );
  const [activeTab, setActiveTab] = useState("review-queue");
  const [items, setItems] = useState<ReviewItem[]>(MOCK_REVIEW_ITEMS);
  const [selectedItemId, setSelectedItemId] = useState<string>(MOCK_REVIEW_ITEMS[0].id);
  const [stats, setStats] = useState<ReviewQueueStats>(MOCK_REVIEW_STATS);

  const selectedItem = items.find((i) => i.id === selectedItemId) || items[0];

  const handleApprove = (itemId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, status: "approved", statusTag: "Approved" }
          : item
      )
    );
    setStats((prev) => ({
      ...prev,
      pendingCount: Math.max(0, prev.pendingCount - 1),
      approvedTodayCount: prev.approvedTodayCount + 1,
    }));
  };

  const handleReject = (itemId: string, reason: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: "rejected",
              statusTag: "Rejected",
              rejectionReason: reason,
            }
          : item
      )
    );
    setStats((prev) => ({
      ...prev,
      pendingCount: Math.max(0, prev.pendingCount - 1),
      rejectedCount: prev.rejectedCount + 1,
    }));
  };

  return (
    <div className="app-container">
      {/* ── Left Sidebar (Cobalt Theme) ── */}
      <DashboardSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedWorkspace={currentWorkspace}
        onWorkspaceChange={setCurrentWorkspace}
      />

      {/* ── Right Content Area ── */}
      <div className="main-wrapper">
        {/* Top Navbar */}
        <DashboardHeader
          workspaceName={currentWorkspace.name}
          currentPageTitle={t.sidebar.reviewQueue}
        />

        {/* Main Canvas */}
        <main className="content-body">
          {/* ── Page Header / Operations Title ── */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                  {t.reviewQueue.pageTitle}
                </h1>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-600 text-white shadow-xs">
                  {t.reviewQueue.badge}
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-500 mt-1.5">
                {t.reviewQueue.subtitle}
              </p>
            </div>

            {/* Right Summary Stats Indicators */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>{t.reviewQueue.pendingCount.replace("{count}", String(stats.pendingCount))}</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{t.reviewQueue.approvedToday.replace("{count}", String(stats.approvedTodayCount))}</span>
              </div>
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-200/80 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>{t.reviewQueue.rejectedCount.replace("{count}", String(stats.rejectedCount))}</span>
              </div>
            </div>
          </div>

          {/* ── Main 2-Column Review Interface ── */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left Column: Artifacts / Review List */}
            <div className="xl:col-span-4 w-full">
              <ReviewItemsList
                items={items}
                selectedItemId={selectedItemId}
                onSelectItem={(item) => setSelectedItemId(item.id)}
              />
            </div>

            {/* Right Column: Detailed Document Preview & Approval Panel */}
            <div className="xl:col-span-8 w-full">
              {selectedItem ? (
                <ReviewDetailView
                  item={selectedItem}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              ) : (
                <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400 text-sm">
                  {t.common.loading}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
