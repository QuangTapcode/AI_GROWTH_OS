"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import UserAvatar from "./UserAvatar";
import { useClickOutside } from "@/hooks/useClickOutside";
import { SAMPLE_WORKSPACES, type WorkspaceItem } from "@/lib/workspaces";
import styles from "./DashboardSidebar.module.css";

interface DashboardSidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  currentWorkspace: WorkspaceItem;
  onSelectWorkspace: (workspace: WorkspaceItem) => void;
  activeMainView?: "dashboard" | "knowledge-base" | "daily-brief" | "docs";
  onSelectMainView?: (view: "dashboard" | "knowledge-base" | "daily-brief" | "docs") => void;
  activeSidebarItem?: string;
  onSelectSidebarItem?: (item: string) => void;
}

export default function DashboardSidebar({
  isCollapsed,
  onToggleCollapse,
  currentWorkspace,
  onSelectWorkspace,
  activeMainView = "dashboard",
  onSelectMainView,
  activeSidebarItem,
  onSelectSidebarItem,
}: DashboardSidebarProps) {
  const router = useRouter();

  // Workspace Switcher Dropdown State
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const workspaceBoxRef = useRef<HTMLDivElement>(null);

  useClickOutside(
    workspaceBoxRef,
    () => setIsWorkspaceDropdownOpen(false),
    isWorkspaceDropdownOpen
  );

  // Accordions state: strategy open by default, content open, community collapsed
  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    strategy: true,
    content: true,
    community: false,
  });

  const [internalActiveItem, setInternalActiveItem] = useState("growth-goals");
  const currentActiveItem = activeSidebarItem ?? internalActiveItem;

  const handleSelectItem = (itemKey: string) => {
    setInternalActiveItem(itemKey);
    onSelectSidebarItem?.(itemKey);
  };

  const isStrategyActive =
    currentActiveItem === "growth-goals" ||
    currentActiveItem === "market-intel" ||
    currentActiveItem === "opportunities";

  const toggleSection = (sectionKey: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }));
  };

  const handleLogout = () => {
    router.push("/login");
  };

  const handleWorkspaceChange = (ws: WorkspaceItem) => {
    onSelectWorkspace(ws);
    setIsWorkspaceDropdownOpen(false);
  };

  return (
    <aside className={`${styles.sidebar} ${isCollapsed ? styles.sidebarCollapsed : ""}`}>
      {/* ── Top Header / Logo ── */}
      <div className={styles.topHeader}>
        <div className={styles.logoRow}>
          <div className={styles.logoBadge}>AG</div>
          {!isCollapsed && <span className={styles.logoTitle}>AI Growth OS</span>}
        </div>
        {!isCollapsed && (
          <button
            type="button"
            className={styles.collapseToggleBtn}
            onClick={onToggleCollapse}
            title="Thu gọn sidebar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Workspace Switcher Box ── */}
      {!isCollapsed ? (
        <div className={styles.workspaceWrapper} ref={workspaceBoxRef}>
          <div
            className={styles.workspaceBox}
            onClick={() => setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen)}
            title="Nhấn để đổi workspace"
          >
            <div className={styles.workspaceInfo}>
              <span className={styles.workspaceName}>{currentWorkspace.name}</span>
              <span className={styles.workspaceType}>{currentWorkspace.type}</span>
            </div>
            <button
              type="button"
              className={styles.workspaceSwitchBtn}
              title="Chuyển đổi workspace"
              onClick={(e) => {
                e.stopPropagation();
                setIsWorkspaceDropdownOpen(!isWorkspaceDropdownOpen);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 7h12m0 0l-4-4m4 4l-4 4m-4 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </button>
          </div>

          {/* Workspace Dropdown Menu */}
          {isWorkspaceDropdownOpen && (
            <div className={styles.workspaceDropdown}>
              <div className={styles.workspaceDropdownHeader}>
                <span>Danh sách Workspaces</span>
                <span className={styles.wsCountBadge}>{SAMPLE_WORKSPACES.length}</span>
              </div>
              <div className={styles.workspaceList}>
                {SAMPLE_WORKSPACES.map((ws) => {
                  const isCurrent = ws.id === currentWorkspace.id;
                  return (
                    <div
                      key={ws.id}
                      className={`${styles.workspaceItem} ${isCurrent ? styles.workspaceItemActive : ""}`}
                      onClick={() => handleWorkspaceChange(ws)}
                    >
                      <div className={styles.wsItemAvatar}>
                        {ws.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className={styles.wsItemDetails}>
                        <span className={styles.wsItemName}>{ws.name}</span>
                        <span className={styles.wsItemSub}>{ws.industry}</span>
                      </div>
                      {isCurrent && (
                        <div className={styles.wsCheckIcon}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add Workspace Action */}
              <div className={styles.workspaceDropdownFooter}>
                <button
                  type="button"
                  className={styles.addWorkspaceBtn}
                  onClick={() => {
                    alert("Tính năng tạo workspace mới (Sẽ có trong Sprint tiếp theo)");
                    setIsWorkspaceDropdownOpen(false);
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Thêm workspace mới</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          className={styles.workspaceCollapsedBadge}
          title={`${currentWorkspace.name} (Nhấn để mở rộng)`}
          onClick={onToggleCollapse}
        >
          {currentWorkspace.name.substring(0, 2).toUpperCase()}
        </div>
      )}

      {/* ── Navigation Menu Items ── */}
      <nav className={styles.navMenu}>
        {/* DASHBOARD */}
        <div
          className={`${styles.navItem} ${activeMainView === "dashboard" && currentActiveItem === "dashboard" ? styles.navItemActive : ""}`}
          onClick={() => {
            handleSelectItem("dashboard");
            onSelectMainView?.("dashboard");
          }}
          title="DASHBOARD"
        >
          <div className={styles.itemIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#3b82f6">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
          </div>
          {!isCollapsed && <span className={styles.itemLabel}>DASHBOARD</span>}
        </div>

        {/* ── SECTION: STRATEGY & GOALS (White Active Card in screenshot) ── */}
        <div className={`${styles.sectionGroup} ${isStrategyActive ? styles.strategyCardActive : ""}`}>
          <div
            className={styles.sectionHeader}
            onClick={() => toggleSection("strategy")}
            title="STRATEGY & GOALS"
          >
            <div className={styles.sectionTitleWrap}>
              <div className={styles.itemIcon}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#3b82f6" strokeWidth="2" />
                  <circle cx="12" cy="12" r="6" stroke="#ef4444" strokeWidth="2" />
                  <circle cx="12" cy="12" r="2.5" fill="#ef4444" />
                </svg>
              </div>
              {!isCollapsed && (
                <span className={`${styles.sectionTitle} ${isStrategyActive ? styles.strategyActiveTitle : ""}`}>
                  STRATEGY & GOALS
                </span>
              )}
            </div>
            {!isCollapsed && (
              <svg
                className={`${styles.chevron} ${openSections.strategy ? styles.chevronOpen : ""}`}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={isStrategyActive ? "#2563eb" : "#64748b"}
                strokeWidth="2.5"
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            )}
          </div>

          {(!isCollapsed && openSections.strategy) && (
            <div className={styles.subList}>
              <button
                type="button"
                className={`${styles.subItem} ${currentActiveItem === "growth-goals" ? styles.subItemActivePill : ""}`}
                onClick={() => {
                  handleSelectItem("growth-goals");
                  onSelectMainView?.("dashboard");
                }}
              >
                Growth Goals
              </button>
              <button
                type="button"
                className={`${styles.subItem} ${currentActiveItem === "market-intel" ? styles.subItemActivePill : ""}`}
                onClick={() => {
                  handleSelectItem("market-intel");
                  onSelectMainView?.("dashboard");
                }}
              >
                Market Intel
              </button>
              <button
                type="button"
                className={`${styles.subItem} ${currentActiveItem === "opportunities" ? styles.subItemActivePill : ""}`}
                onClick={() => {
                  handleSelectItem("opportunities");
                  onSelectMainView?.("dashboard");
                }}
              >
                Opportunities
              </button>
            </div>
          )}
        </div>

        {/* ── SECTION: CONTENT FACTORY ── */}
        <div className={styles.sectionGroup}>
          <div
            className={styles.sectionHeader}
            onClick={() => toggleSection("content")}
            title="CONTENT FACTORY"
          >
            <div className={styles.sectionTitleWrap}>
              <div className={styles.itemIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="3" width="16" height="18" rx="2" stroke="#2563eb" strokeWidth="2" />
                  <path d="M8 3v6l3-2 3 2V3" fill="#2563eb" />
                </svg>
              </div>
              {!isCollapsed && <span className={styles.sectionTitle}>CONTENT FACTORY</span>}
            </div>
            {!isCollapsed && (
              <svg
                className={`${styles.chevron} ${openSections.content ? styles.chevronOpen : ""}`}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#64748b"
                strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </div>

          {(!isCollapsed && openSections.content) && (
            <div className={styles.subList}>
              <button
                type="button"
                className={`${styles.subItem} ${currentActiveItem === "strategy" ? styles.subItemActivePill : ""}`}
                onClick={() => handleSelectItem("strategy")}
              >
                Strategy
              </button>
              <button
                type="button"
                className={`${styles.subItem} ${currentActiveItem === "content-briefs" ? styles.subItemActivePill : ""}`}
                onClick={() => handleSelectItem("content-briefs")}
              >
                Content Briefs
              </button>
              <button
                type="button"
                className={`${styles.subItem} ${currentActiveItem === "ai-factory" ? styles.subItemActivePill : ""}`}
                onClick={() => handleSelectItem("ai-factory")}
              >
                AI Factory
              </button>
              <button
                type="button"
                className={`${styles.subItem} ${currentActiveItem === "distribution" ? styles.subItemActivePill : ""}`}
                onClick={() => handleSelectItem("distribution")}
              >
                Distribution
              </button>
            </div>
          )}
        </div>

        {/* ── SECTION: SEO & Clusters ── */}
        <div
          className={`${styles.navItem} ${currentActiveItem === "seo-clusters" ? styles.navItemActive : ""}`}
          onClick={() => handleSelectItem("seo-clusters")}
          title="SEO & Clusters"
        >
          <div className={styles.itemIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2" stroke="#eab308" strokeWidth="2" />
              <line x1="3" y1="10" x2="21" y2="10" stroke="#eab308" strokeWidth="1.5" />
              <line x1="8" y1="14" x2="16" y2="14" stroke="#eab308" strokeWidth="2" strokeLinecap="round" />
              <line x1="8" y1="17" x2="13" y2="17" stroke="#eab308" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          {!isCollapsed && <span className={styles.itemLabel}>SEO & Clusters</span>}
        </div>

        {/* ── SECTION: COMMUNITY & GROWTH ── */}
        <div className={styles.sectionGroup}>
          <div
            className={styles.sectionHeader}
            onClick={() => toggleSection("community")}
            title="COMMUNITY & GROWTH"
          >
            <div className={styles.sectionTitleWrap}>
              <div className={styles.itemIcon}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              {!isCollapsed && <span className={styles.sectionTitle}>COMMUNITY & GROWTH</span>}
            </div>
            {!isCollapsed && (
              <svg
                className={`${styles.chevron} ${openSections.community ? styles.chevronOpen : ""}`}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#64748b"
                strokeWidth="2.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </div>

          {(!isCollapsed && openSections.community) && (
            <div className={styles.subList}>
              <button
                type="button"
                className={`${styles.subItem} ${currentActiveItem === "community" ? styles.subItemActivePill : ""}`}
                onClick={() => handleSelectItem("community")}
              >
                Community
              </button>
              <button
                type="button"
                className={`${styles.subItem} ${currentActiveItem === "experiments" ? styles.subItemActivePill : ""}`}
                onClick={() => handleSelectItem("experiments")}
              >
                Experiments
              </button>
              <button
                type="button"
                className={`${styles.subItem} ${currentActiveItem === "learning-engine" ? styles.subItemActivePill : ""}`}
                onClick={() => handleSelectItem("learning-engine")}
              >
                Learning Engine
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ── Bottom User Profile Card ── */}
      <div className={styles.bottomCard}>
        <div className={styles.userProfile}>
          <UserAvatar size={36} />
          {!isCollapsed && (
            <div className={styles.userInfo}>
              <div className={styles.userName}>Quang Quang</div>
              <div className={styles.userRole}>Owner</div>
            </div>
          )}
        </div>
        {!isCollapsed && (
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={handleLogout}
            title="Đăng xuất"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
          </button>
        )}
      </div>
    </aside>
  );
}
