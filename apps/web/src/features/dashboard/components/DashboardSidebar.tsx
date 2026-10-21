"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import DatabaseSchemaModal from "./DatabaseSchemaModal";

export interface WorkspaceItem {
  id: string;
  name: string;
  subtitle: string;
  initials: string;
  avatarBg: string;
  tag?: string;
  members?: number;
}

export const DEFAULT_WORKSPACES: WorkspaceItem[] = [
  {
    id: "tripc",
    name: "TripC",
    subtitle: "Growth workspace",
    initials: "T",
    avatarBg: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
    tag: "Active",
    members: 3,
  },
  {
    id: "ecotravel",
    name: "EcoTravel Vietnam",
    subtitle: "Ecotourism & Local Tours",
    initials: "E",
    avatarBg: "linear-gradient(135deg, #059669 0%, #047857 100%)",
    tag: "Production",
    members: 5,
  },
  {
    id: "danang-gourmet",
    name: "Danang Gourmet Hub",
    subtitle: "Culinary & Food Tourism",
    initials: "D",
    avatarBg: "linear-gradient(135deg, #D97706 0%, #B45309 100%)",
    tag: "Staging",
    members: 2,
  },
];

interface DashboardSidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  selectedWorkspace?: WorkspaceItem;
  onWorkspaceChange?: (workspace: WorkspaceItem) => void;
}

export default function DashboardSidebar({
  activeTab = "overview",
  onTabChange,
  selectedWorkspace = DEFAULT_WORKSPACES[0],
  onWorkspaceChange,
}: DashboardSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { language, t } = useLanguage();
  const [currentTab, setCurrentTab] = useState(activeTab);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Sync activeTab when prop or pathname changes
  useEffect(() => {
    if (activeTab) {
      setCurrentTab(activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    if (pathname.startsWith("/workflows")) {
      setCurrentTab("workflows");
    } else if (pathname.startsWith("/review-queue")) {
      setCurrentTab("review-queue");
    } else if (pathname.startsWith("/artifacts")) {
      setCurrentTab("artifacts");
    } else if (pathname.startsWith("/distribution")) {
      setCurrentTab("distribution");
    } else if (pathname.startsWith("/growth-results")) {
      setCurrentTab("growth-results");
    } else if (pathname.startsWith("/workspace-integrations")) {
      setCurrentTab("workspace-integrations");
    } else {
      setCurrentTab("overview");
    }
  }, [pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleNav = (tabId: string, href?: string) => {
    setCurrentTab(tabId);
    if (onTabChange) onTabChange(tabId);
    if (href && pathname !== href) {
      router.push(href);
    }
  };

  const handleSelectWorkspace = (ws: WorkspaceItem) => {
    if (onWorkspaceChange) {
      onWorkspaceChange(ws);
    }
    setIsDropdownOpen(false);
  };

  const getLocalizedWorkspaceSubtitle = (ws: WorkspaceItem) => {
    if (ws.id === "tripc") return t.sidebar.growthWorkspace;
    if (ws.id === "ecotravel") return t.sidebar.ecotourismLocalTours;
    if (ws.id === "danang-gourmet") return t.sidebar.culinaryFoodTourism;
    return ws.subtitle;
  };

  const navItems = [
    {
      id: "overview",
      label: t.sidebar.overview,
      href: "/dashboard",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
    },
    {
      id: "workflows",
      label: t.sidebar.workflows,
      href: "/workflows",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      id: "artifacts",
      label: t.sidebar.artifacts,
      href: "/artifacts",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      ),
    },
    {
      id: "review-queue",
      label: t.sidebar.reviewQueue,
      href: "/review-queue",
      badge: 3,
      badgeColor: "var(--brand-accent)",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      ),
    },
    {
      id: "distribution",
      label: t.sidebar.distribution,
      href: "/distribution",
      badge: 1,
      badgeColor: "#E11D48",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      ),
    },
    {
      id: "growth-results",
      label: t.sidebar.growthResults,
      href: "/growth-results",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      ),
    },
    {
      id: "workspace-integrations",
      label: t.sidebar.workspaceIntegrations,
      href: "/workspace-integrations",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
  ];

  return (
    <>
      <aside className="sidebar" id="appSidebar" aria-label="Main Navigation">
        <div className="sidebar-top-section">
          {/* Brand Header */}
          <div className="sidebar-header">
            <Link href="/dashboard" className="brand-wrapper" title="AI Growth OS">
              <div className="brand-icon">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <div className="brand-info">
                <span className="brand-title">AI Growth OS</span>
                <span className="brand-subtitle">
                  {language === "vi"
                    ? "Hệ điều hành tăng trưởng"
                    : "Growth operating system"}
                </span>
              </div>
            </Link>

            {/* Workspace Selector */}
            <div className="relative" ref={dropdownRef}>
              <div
                className="workspace-selector"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                role="button"
                tabIndex={0}
                title="Switch Workspace"
              >
                <div className="workspace-left">
                  <div
                    className="workspace-avatar"
                    style={{ background: selectedWorkspace.avatarBg }}
                  >
                    {selectedWorkspace.initials}
                  </div>
                  <div className="workspace-details">
                    <span className="workspace-name">
                      {selectedWorkspace.name}
                    </span>
                    <span className="workspace-tag">
                      {getLocalizedWorkspaceSubtitle(selectedWorkspace)}
                    </span>
                  </div>
                </div>
                <div
                  className="workspace-chevron"
                  style={{
                    transform: isDropdownOpen ? "rotate(180deg)" : "none",
                    transition: "transform 0.2s ease",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              {/* Workspace Dropdown Menu */}
              {isDropdownOpen && (
                <div
                  className="dropdown-menu active"
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: "6px",
                    background: "#0F172A",
                    border: "1px solid rgba(147, 197, 253, 0.25)",
                    borderRadius: "12px",
                    padding: "8px",
                    zIndex: 200,
                    boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
                  }}
                >
                  <div
                    style={{
                      padding: "4px 8px",
                      fontSize: "10px",
                      fontWeight: 700,
                      color: "rgba(147, 197, 253, 0.7)",
                      textTransform: "uppercase",
                    }}
                  >
                    {language === "vi" ? "Không gian làm việc" : "Workspaces"}
                  </div>
                  {DEFAULT_WORKSPACES.map((ws) => (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={() => handleSelectWorkspace(ws)}
                      style={{
                        width: "100%",
                        padding: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        borderRadius: "8px",
                        border: "none",
                        background:
                          selectedWorkspace.id === ws.id
                            ? "rgba(37, 99, 235, 0.3)"
                            : "transparent",
                        cursor: "pointer",
                        color: "#FFFFFF",
                        textAlign: "left",
                      }}
                    >
                      <div
                        style={{
                          width: "24px",
                          height: "24px",
                          borderRadius: "6px",
                          background: ws.avatarBg,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "11px",
                          fontWeight: 700,
                        }}
                      >
                        {ws.initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {ws.name}
                        </div>
                        <div
                          style={{
                            fontSize: "10px",
                            color: "rgba(147, 197, 253, 0.7)",
                          }}
                        >
                          {getLocalizedWorkspaceSubtitle(ws)}
                        </div>
                      </div>
                      {selectedWorkspace.id === ws.id && (
                        <span style={{ color: "#60A5FA", fontSize: "14px" }}>
                          ✓
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Navigation Tabs (Exact 7 tabs in order) */}
          <nav className="sidebar-nav" aria-label="Primary">
            {navItems.map((item) => {
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNav(item.id, item.href)}
                  className={`nav-link ${isActive ? "active" : ""}`}
                  style={{
                    width: "100%",
                    cursor: "pointer",
                    border: "none",
                    textAlign: "left",
                  }}
                >
                  <div className="nav-link-content">
                    <span className="nav-icon">{item.icon}</span>
                    <span className="nav-text">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span
                      className="nav-badge"
                      style={{ background: item.badgeColor }}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Lower Utilities & Intelligence */}
        <div className="sidebar-footer">
          <div className="section-label">WORKSPACE INTELLIGENCE</div>
          <div className="sidebar-util-nav">
            {/* Growth Knowledge */}
            <Link
              href="/workspace-integrations"
              className="util-link"
              title="Business profiles & Brand Voice"
            >
              <div className="util-left">
                <span className="util-icon">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </span>
                <div className="util-texts">
                  <span className="util-title">{t.sidebar.growthKnowledge}</span>
                  <span className="util-sub">
                    {language === "vi"
                      ? "Bối cảnh doanh nghiệp & giọng văn"
                      : "Business context & voice"}
                  </span>
                </div>
              </div>
            </Link>

            {/* Connection Status */}
            <Link
              href="/distribution"
              className="util-link"
              title="Connected channels status"
            >
              <div className="util-left">
                <span className="util-icon">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                    <line x1="6" y1="6" x2="6.01" y2="6" />
                    <line x1="6" y1="18" x2="6.01" y2="18" />
                  </svg>
                </span>
                <div className="util-texts">
                  <span className="util-title">
                    {t.sidebar.connectionStatus}
                  </span>
                  <span className="util-sub">
                    {t.sidebar.connectedChannels}
                  </span>
                </div>
              </div>
              <span className="status-dot-pulse" title="Channels Active" />
            </Link>
          </div>

          <div className="sidebar-divider" />

          {/* Database Schema Map Trigger */}
          <div className="sidebar-util-nav">
            <button
              type="button"
              onClick={() => setIsSchemaModalOpen(true)}
              className="util-link"
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
              }}
              title="Inspect Database Schema Mapping"
            >
              <div className="util-left">
                <span className="util-icon">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <ellipse cx="12" cy="5" rx="9" ry="3" />
                    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                  </svg>
                </span>
                <span
                  className="util-title"
                  style={{ color: "#93C5FD", fontWeight: 600 }}
                >
                  Database Schema Map
                </span>
              </div>
            </button>
          </div>

          {/* User Profile Pill */}
          <div className="relative" ref={userMenuRef}>
            <div
              className="sidebar-user"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              role="button"
              tabIndex={0}
              title="User Account"
            >
              <div className="user-info-group">
                <div className="user-avatar-pill">AM</div>
                <div className="user-text-details">
                  <span className="user-name">Alex Morgan</span>
                  <span className="user-role">{t.header.owner}</span>
                </div>
              </div>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#93C5FD"
                strokeWidth="2.5"
                style={{
                  transform: isUserMenuOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s ease",
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>

            {/* User Dropdown Menu */}
            {isUserMenuOpen && (
              <div
                className="dropdown-menu active"
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: "8px",
                  right: "8px",
                  marginBottom: "8px",
                  background: "#0F172A",
                  border: "1px solid rgba(147, 197, 253, 0.25)",
                  borderRadius: "12px",
                  padding: "6px",
                  zIndex: 200,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
                }}
              >
                <div
                  style={{
                    padding: "6px 10px",
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "rgba(147, 197, 253, 0.7)",
                  }}
                >
                  alex@tripc.ai
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/workspace-integrations")}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "12px",
                    border: "none",
                    background: "transparent",
                    color: "#FFFFFF",
                    textAlign: "left",
                    cursor: "pointer",
                    borderRadius: "6px",
                  }}
                >
                  {language === "vi" ? "Cài đặt tài khoản" : "Account Settings"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    fontSize: "12px",
                    border: "none",
                    background: "transparent",
                    color: "#F87171",
                    textAlign: "left",
                    cursor: "pointer",
                    borderRadius: "6px",
                  }}
                >
                  {t.sidebar.logout}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Database Schema Map Modal */}
      <DatabaseSchemaModal
        isOpen={isSchemaModalOpen}
        onClose={() => setIsSchemaModalOpen(false)}
      />
    </>
  );
}
