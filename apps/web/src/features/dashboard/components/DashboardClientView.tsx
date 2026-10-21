"use client";

import React, { useState } from "react";
import DashboardSidebar, {
  DEFAULT_WORKSPACES,
  type WorkspaceItem,
} from "./DashboardSidebar";
import DashboardHeader from "./DashboardHeader";
import WorkspaceContextBanner from "./WorkspaceContextBanner";
import CreateGrowthTaskModal from "./CreateGrowthTaskModal";
import KpiMetricsRow from "./KpiMetricsRow";
import TrafficTrendChart from "./TrafficTrendChart";
import AgentActivityCard from "./AgentActivityCard";
import ActionCenterCard from "./ActionCenterCard";
import GrowthPipelineCard from "./GrowthPipelineCard";
import RecommendedActionsCard from "./RecommendedActionsCard";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function DashboardClientView() {
  const { language, t } = useLanguage();
  const [activeTab, setActiveTab] = useState("overview");
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceItem>(
    DEFAULT_WORKSPACES[0]
  );

  // Date range dropdown
  const [dateRange, setDateRange] = useState("30d");
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);

  // Modal & Toast
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    title: string;
    msg: string;
  } | null>(null);

  const showToast = (title: string, msg: string) => {
    setToastMessage({ title, msg });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleTaskCreated = (task: {
    title: string;
    agent: string;
    priority: string;
    instructions: string;
  }) => {
    showToast(
      language === "vi" ? "Đã giao tác vụ" : "Task Dispatched",
      language === "vi"
        ? `Tác vụ "${task.title}" đã được đưa vào hàng đợi cho ${task.agent} Agent (${task.priority}).`
        : `Task "${task.title}" queued for ${task.agent} Agent (${task.priority}).`
    );
  };

  const handleRefresh = () => {
    showToast(
      language === "vi" ? "Làm mới chỉ số" : "Dashboard Refreshed",
      language === "vi"
        ? "Đã cập nhật dữ liệu telemetry thời gian thực cho " + currentWorkspace.name
        : "Real-time telemetry refreshed for " + currentWorkspace.name
    );
  };

  const dateRangeLabels: Record<string, { en: string; vi: string }> = {
    "7d": { en: "Last 7 days", vi: "7 ngày qua" },
    "14d": { en: "Last 14 days", vi: "14 ngày qua" },
    "30d": { en: "Last 30 days (Default)", vi: "30 ngày qua (Mặc định)" },
    "90d": { en: "Last 90 days", vi: "90 ngày qua" },
    ytd: { en: "Year to date", vi: "Từ đầu năm" },
  };

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className="toast-notification active toast-success"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            background: "#ECFDF5",
            border: "1px solid #A7F3D0",
            color: "#065F46",
            padding: "14px 20px",
            borderRadius: "12px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "13px" }}>
            {toastMessage.title}:
          </div>
          <div style={{ fontSize: "12.5px" }}>{toastMessage.msg}</div>
        </div>
      )}

      {/* ── Left Sidebar (Cobalt Gradient Theme) ── */}
      <DashboardSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedWorkspace={currentWorkspace}
        onWorkspaceChange={setCurrentWorkspace}
      />

      {/* ── Right Content Area ── */}
      <div className="main-wrapper">
        {/* Top Navbar with dynamic workspace name */}
        <DashboardHeader
          workspaceName={currentWorkspace.name}
          currentPageTitle="Overview"
        />

        {/* Main Dashboard Canvas */}
        <main className="content-body">
          {/* ── Page Header / Command Center Title ── */}
          <section className="page-header" aria-label="Page Header">
            <div className="header-left">
              <span className="header-eyebrow">
                {t.dashboard.commandCenter}
              </span>
              <h1 className="header-title">
                {t.dashboard.overviewTitle}
              </h1>
              <p className="header-description">
                {language === "vi" ? (
                  <>
                    Theo dõi hiệu suất tăng trưởng, hoạt động AI và các tác vụ tiếp theo cho{" "}
                    <span className="font-semibold text-slate-700">{currentWorkspace.name}</span>.
                  </>
                ) : (
                  <>
                    Monitor growth performance, AI agent activity, and next actions for{" "}
                    <span className="font-semibold text-slate-700">{currentWorkspace.name}</span>.
                  </>
                )}
              </p>
            </div>

            {/* Right Action Controls */}
            <div className="header-controls">
              {/* Date Filter Dropdown */}
              <div className="dropdown" style={{ position: "relative" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)}
                  aria-haspopup="true"
                  aria-expanded={isDateDropdownOpen}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--brand-accent)"
                    strokeWidth="2"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span>
                    {language === "vi"
                      ? dateRangeLabels[dateRange]?.vi
                      : dateRangeLabels[dateRange]?.en}
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isDateDropdownOpen && (
                  <div
                    className="dropdown-menu active"
                    role="menu"
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      right: 0,
                      zIndex: 100,
                      background: "#fff",
                      border: "1px solid #DCE6F5",
                      borderRadius: "12px",
                      boxShadow: "0 10px 25px -5px rgba(16, 47, 112, 0.15)",
                      minWidth: "190px",
                      padding: "6px",
                    }}
                  >
                    {Object.entries(dateRangeLabels).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={`dropdown-item ${dateRange === key ? "active" : ""}`}
                        role="menuitem"
                        onClick={() => {
                          setDateRange(key);
                          setIsDateDropdownOpen(false);
                        }}
                      >
                        {language === "vi" ? label.vi : label.en}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Refresh button */}
              <button
                type="button"
                title={t.dashboard.refreshMetrics}
                className="btn btn-secondary btn-icon"
                onClick={handleRefresh}
                aria-label="Refresh UI"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--text-secondary)"
                  strokeWidth="2.5"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>

              {/* Primary CTA: Create growth task */}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsCreateTaskOpen(true)}
                title="Queue an autonomous agent task"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {language === "vi" ? "Tạo tác vụ tăng trưởng" : "Create growth task"}
              </button>
            </div>
          </section>

          {/* ── Workspace Context Banner ── */}
          <WorkspaceContextBanner workspace={currentWorkspace} />

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

      {/* ── Create Growth Task Modal ── */}
      <CreateGrowthTaskModal
        isOpen={isCreateTaskOpen}
        onClose={() => setIsCreateTaskOpen(false)}
        onCreated={handleTaskCreated}
      />
    </div>
  );
}
