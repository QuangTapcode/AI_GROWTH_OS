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

export default function ReviewQueueClientView() {
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
    <div className="min-h-screen bg-[#f8fafc] flex w-full font-sans antialiased text-slate-800">
      {/* ── Left Sidebar (Cobalt Theme) ── */}
      <DashboardSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedWorkspace={currentWorkspace}
        onWorkspaceChange={setCurrentWorkspace}
      />

      {/* ── Right Content Area ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        {/* Top Navbar */}
        <DashboardHeader
          workspaceName={currentWorkspace.name}
          currentPageTitle="Review Queue"
        />

        {/* Main Canvas */}
        <main className="flex-1 p-6 lg:p-8 space-y-6 max-w-[1700px] w-full mx-auto">
          {/* ── Page Header / Operations Title ── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                  Review Queue
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-600 text-white shadow-xs">
                  Tier-1 Gated
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-500 mt-1">
                Review AI-generated outputs that require your approval before autonomous production execution.
              </p>
            </div>

            {/* Right Summary Stats Indicators */}
            <div className="flex items-center gap-4 flex-wrap bg-white border border-slate-200/90 rounded-2xl px-4 py-2 shadow-2xs text-xs font-semibold text-slate-700">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span>{stats.pendingCount} pending</span>
              </div>
              <span className="text-slate-200">|</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>{stats.approvedTodayCount} approved today</span>
              </div>
              <span className="text-slate-200">|</span>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>{stats.rejectedCount} rejected</span>
              </div>
            </div>
          </div>

          {/* ── Main 2-Column Review Interface ── */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Left Column: Artifacts / Review List (approx 35% on large screens) */}
            <div className="xl:col-span-4 w-full">
              <ReviewItemsList
                items={items}
                selectedItemId={selectedItemId}
                onSelectItem={(item) => setSelectedItemId(item.id)}
              />
            </div>

            {/* Right Column: Detailed Document Preview & Approval Panel (approx 65%) */}
            <div className="xl:col-span-8 w-full">
              {selectedItem ? (
                <ReviewDetailView
                  item={selectedItem}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              ) : (
                <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 text-slate-400 text-sm">
                  Select an artifact on the left to begin reviewing.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
