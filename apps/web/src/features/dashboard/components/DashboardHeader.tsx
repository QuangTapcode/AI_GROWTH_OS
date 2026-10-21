"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import LanguageSwitcher from "@/lib/i18n/LanguageSwitcher";

interface DashboardHeaderProps {
  workspaceName?: string;
  currentPageTitle?: string;
  searchPlaceholder?: string;
}

export default function DashboardHeader({
  workspaceName = "TripC",
  currentPageTitle = "Overview",
  searchPlaceholder,
}: DashboardHeaderProps) {
  const router = useRouter();
  const { language, t } = useLanguage();
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close notif dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Map known page titles to localized titles
  const getLocalizedTitle = (title: string) => {
    switch (title) {
      case "Overview":
        return t.sidebar.overview;
      case "Workflows & Tasks":
        return t.sidebar.workflows;
      case "Review Queue":
        return t.sidebar.reviewQueue;
      case "Artifacts":
        return t.sidebar.artifacts;
      case "Distribution":
        return t.sidebar.distribution;
      case "Growth Results":
        return t.sidebar.growthResults;
      case "Workspace & Integrations":
        return t.sidebar.workspaceIntegrations;
      default:
        return title;
    }
  };

  const localizedPageTitle = getLocalizedTitle(currentPageTitle);

  const placeholderText =
    searchPlaceholder ||
    (currentPageTitle === "Review Queue"
      ? t.header.searchPlaceholderReview
      : t.header.searchPlaceholderOverview);

  return (
    <header className="topbar">
      {/* Left Breadcrumb */}
      <div className="breadcrumbs">
        <span className="breadcrumb-root">{workspaceName}</span>
        <span className="breadcrumb-separator">/</span>
        <span className="breadcrumb-current">{localizedPageTitle}</span>
      </div>

      {/* Right Controls */}
      <div className="topbar-actions">
        {/* Search Bar */}
        <div className="topbar-search">
          <span className="search-icon-pos">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            placeholder={placeholderText}
            className="search-input"
          />
        </div>

        {/* Operational Status Pill */}
        <div className="system-status-pill hidden sm:flex">
          <span className="status-beacon" />
          <span className="status-text">{t.header.allSystemsOperational}</span>
        </div>

        {/* Language Switcher */}
        <LanguageSwitcher variant="header" />

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="notification-btn"
            title={t.header.notifications}
            style={{
              background: "rgba(255, 255, 255, 0.14)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "#FFFFFF",
              cursor: "pointer",
              position: "relative",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="notification-badge">3</span>
          </button>

          {/* Notification Dropdown Menu */}
          {isNotifOpen && (
            <div
              className="dropdown-menu active"
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: "8px",
                width: "320px",
                background: "#FFFFFF",
                borderRadius: "12px",
                border: "1px solid var(--border)",
                boxShadow: "0 10px 25px rgba(0,0,0,0.15)",
                zIndex: 300,
                padding: "8px 0",
              }}
            >
              <div
                style={{
                  padding: "8px 14px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                  {t.header.notifications}
                </strong>
                <span
                  style={{
                    fontSize: "11px",
                    color: "var(--brand-accent)",
                    cursor: "pointer",
                  }}
                  onClick={() => setIsNotifOpen(false)}
                >
                  Mark all read
                </span>
              </div>

              <div style={{ maxHeight: "240px", overflowY: "auto" }}>
                <div
                  onClick={() => {
                    router.push("/review-queue");
                    setIsNotifOpen(false);
                  }}
                  style={{
                    padding: "10px 14px",
                    display: "flex",
                    gap: "10px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border-light)",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#F8FAFC")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#059669",
                      marginTop: "5px",
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                      Content Agent finished Da Nang draft
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      Ready for review • 12m ago
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => {
                    router.push("/distribution");
                    setIsNotifOpen(false);
                  }}
                  style={{
                    padding: "10px 14px",
                    display: "flex",
                    gap: "10px",
                    cursor: "pointer",
                    borderBottom: "1px solid var(--border-light)",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#F8FAFC")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#E11D48",
                      marginTop: "5px",
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                      LinkedIn OAuth token expired
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      Attention required • 2d ago
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => {
                    router.push("/workflows");
                    setIsNotifOpen(false);
                  }}
                  style={{
                    padding: "10px 14px",
                    display: "flex",
                    gap: "10px",
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#F8FAFC")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#3B82F6",
                      marginTop: "5px",
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                      SEO keyword cluster updated
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                      growth_opportunities refreshed • 1d ago
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar Link (Name retained in sidebar footer) */}
        <Link
          href="/workspace-integrations"
          title={`${t.header.profileAndSettings} (Alex Morgan)`}
          aria-label="Alex Morgan - Profile and Settings"
          className="flex items-center gap-2 cursor-pointer no-underline hover:opacity-90 transition-opacity"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-xs ring-2 ring-white/20"
            style={{
              background: "linear-gradient(135deg, #2563EB 0%, #38BDF8 100%)",
            }}
          >
            AM
          </div>
        </Link>
      </div>
    </header>
  );
}
