"use client";

import React, { useState } from "react";
import DashboardNavbar from "./DashboardNavbar";
import DashboardSidebar from "./DashboardSidebar";
import WorkspaceTab from "./WorkspaceTab";
import AiContextTab from "./AiContextTab";
import MembersTab from "./MembersTab";
import KnowledgeBaseView from "./KnowledgeBaseView";
import GrowthGoalsView from "@/features/growth-goals/GrowthGoalsView";
import { SAMPLE_WORKSPACES, type WorkspaceItem } from "@/lib/workspaces";
import styles from "./DashboardView.module.css";

interface DashboardViewProps {
  initialTab?: "workspace" | "ai-context" | "members";
  initialMainView?: "dashboard" | "knowledge-base" | "daily-brief" | "docs";
  initialSidebarItem?: string;
}

export default function DashboardView({
  initialTab = "members",
  initialMainView = "dashboard",
  initialSidebarItem = "growth-goals",
}: DashboardViewProps) {
  // Main navbar view state (defaults to dashboard so growth goals is shown)
  const [mainView, setMainView] = useState<"dashboard" | "knowledge-base" | "daily-brief" | "docs">(
    initialMainView
  );

  // Left sidebar collapse state
  const [isLeftSidebarCollapsed, setIsLeftSidebarCollapsed] = useState(false);

  // Active workspace state (default: TripC Da Nang)
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceItem>(SAMPLE_WORKSPACES[0]);

  // Active sidebar item (defaults to growth-goals to match user screenshot)
  const [activeSidebarItem, setActiveSidebarItem] = useState<string>(initialSidebarItem);

  // Tabs state: workspace | ai-context | members
  const [activeTab, setActiveTab] = useState<"workspace" | "ai-context" | "members">(initialTab);

  return (
    <div className={styles.appShell}>
      {/* ── Top Navbar ── */}
      <DashboardNavbar
        onToggleLeftSidebar={() => setIsLeftSidebarCollapsed(!isLeftSidebarCollapsed)}
        isLeftSidebarCollapsed={isLeftSidebarCollapsed}
        activeMainView={mainView}
        onSelectMainView={setMainView}
      />

      {/* ── Main Application Body ── */}
      <div className={styles.bodyLayout}>
        {/* Left Sidebar */}
        <DashboardSidebar
          isCollapsed={isLeftSidebarCollapsed}
          onToggleCollapse={() => setIsLeftSidebarCollapsed(!isLeftSidebarCollapsed)}
          currentWorkspace={currentWorkspace}
          onSelectWorkspace={setCurrentWorkspace}
          activeMainView={mainView}
          onSelectMainView={setMainView}
          activeSidebarItem={activeSidebarItem}
          onSelectSidebarItem={setActiveSidebarItem}
        />

        {/* Center Main Scrollable Content */}
        <main className={styles.mainContainer}>
          <div className={styles.contentWrapper}>
            {mainView === "knowledge-base" ? (
              <KnowledgeBaseView />
            ) : activeSidebarItem === "growth-goals" ? (
              <GrowthGoalsView />
            ) : (
              <>
                {/* ── Dashboard Page Header ── */}
                <div className={styles.pageHeader}>
                  <div className={styles.pageTitleBlock}>
                    <h1 className={styles.pageTitle}>Dashboard</h1>
                    <p className={styles.pageSubtitle}>
                      Manage your workspace, business context and team permissions.
                    </p>
                  </div>

                  {/* Status Badge */}
                  <div className={styles.syncedBadge}>
                    <span className={styles.syncedDot} />
                    <span>AI Context Synced</span>
                  </div>
                </div>

                {/* ── Navigation Tabs ── */}
                <div className={styles.tabList} role="tablist">
                  {/* Workspace Tab */}
                  <button
                    type="button"
                    className={`${styles.tabItem} ${activeTab === "workspace" ? styles.tabItemActive : ""}`}
                    onClick={() => setActiveTab("workspace")}
                    role="tab"
                    aria-selected={activeTab === "workspace"}
                  >
                    <div className={styles.tabIcon}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                      </svg>
                    </div>
                    <span>Workspace</span>
                  </button>

                  {/* AI Context Tab */}
                  <button
                    type="button"
                    className={`${styles.tabItem} ${activeTab === "ai-context" ? styles.tabItemActive : ""}`}
                    onClick={() => setActiveTab("ai-context")}
                    role="tab"
                    aria-selected={activeTab === "ai-context"}
                  >
                    <div className={styles.tabIcon}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </div>
                    <span>AI context</span>
                  </button>

                  {/* Members Tab */}
                  <button
                    type="button"
                    className={`${styles.tabItem} ${activeTab === "members" ? styles.tabItemActive : ""}`}
                    onClick={() => setActiveTab("members")}
                    role="tab"
                    aria-selected={activeTab === "members"}
                  >
                    <div className={styles.tabIcon}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <span>Members</span>
                    <span className={styles.memberCountBadge}>4</span>
                  </button>
                </div>

                {/* ── Active Tab Content Area ── */}
                <div className={styles.tabContentArea}>
                  {activeTab === "workspace" && <WorkspaceTab key={currentWorkspace.id} workspace={currentWorkspace} />}
                  {activeTab === "ai-context" && <AiContextTab />}
                  {activeTab === "members" && <MembersTab />}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
