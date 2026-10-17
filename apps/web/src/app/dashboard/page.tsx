import React from "react";
import type { Metadata } from "next";
import DashboardSidebar from "@/features/dashboard/components/DashboardSidebar";
import DashboardHeader from "@/features/dashboard/components/DashboardHeader";
import KpiMetricsRow from "@/features/dashboard/components/KpiMetricsRow";
import TrafficTrendChart from "@/features/dashboard/components/TrafficTrendChart";
import AgentActivityCard from "@/features/dashboard/components/AgentActivityCard";
import ActionCenterCard from "@/features/dashboard/components/ActionCenterCard";
import GrowthPipelineCard from "@/features/dashboard/components/GrowthPipelineCard";
import RecommendedActionsCard from "@/features/dashboard/components/RecommendedActionsCard";

export const metadata: Metadata = {
  title: "TripC / Overview · AI Growth OS",
  description:
    "Growth Command Center - Monitor growth performance, AI activity, and next actions for TripC.",
};

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] flex w-full font-sans antialiased text-slate-800">
      {/* ── Left Sidebar (Cobalt Theme) ── */}
      <DashboardSidebar activeTab="overview" />

      {/* ── Right Content Area ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        {/* Top Navbar */}
        <DashboardHeader />

        {/* Main Dashboard Canvas */}
        <main className="flex-1 p-6 lg:p-8 space-y-6 max-w-[1600px] w-full mx-auto">
          {/* ── Page Header / Command Center Title ── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-blue-600">
                GROWTH COMMAND CENTER
              </p>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight mt-0.5">
                Overview
              </h1>
              <p className="text-xs md:text-sm text-slate-500 mt-1">
                Monitor growth performance, AI activity, and the next actions for TripC.
              </p>
            </div>

            {/* Right Action Controls */}
            <div className="flex items-center gap-2.5 shrink-0">
              {/* Date Filter Pill */}
              <button
                type="button"
                className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-700 flex items-center gap-2 shadow-xs cursor-pointer transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <span>Last 30 days</span>
                <svg
                  className="w-3 h-3 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {/* Refresh button */}
              <button
                type="button"
                title="Refresh metrics"
                className="bg-white border border-slate-200/90 hover:border-slate-300 p-2 rounded-xl text-slate-600 hover:text-slate-900 shadow-xs cursor-pointer transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>

              {/* Primary CTA: Create growth task */}
              <button
                type="button"
                className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm shadow-blue-500/25 transition-all cursor-pointer"
              >
                <span className="text-base font-bold leading-none">+</span>
                <span>Create growth task</span>
              </button>
            </div>
          </div>

          {/* ── 1. KPI Summary Cards ── */}
          <KpiMetricsRow />

          {/* ── 2. Middle Row: Traffic Chart & AI Agent Activity ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className="lg:col-span-7 flex flex-col">
              <TrafficTrendChart />
            </div>
            <div className="lg:col-span-5 flex flex-col">
              <AgentActivityCard />
            </div>
          </div>

          {/* ── 3. Lower Row: Action Center & Growth Pipeline ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            <ActionCenterCard />
            <GrowthPipelineCard />
          </div>

          {/* ── 4. Bottom Row: Recommended Next Actions ── */}
          <RecommendedActionsCard />
        </main>
      </div>
    </div>
  );
}
