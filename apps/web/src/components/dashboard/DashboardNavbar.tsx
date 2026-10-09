"use client";

import React, { useState, useRef } from "react";
import UserAvatar from "./UserAvatar";
import { useClickOutside } from "@/hooks/useClickOutside";
import styles from "./DashboardNavbar.module.css";

interface DashboardNavbarProps {
  onToggleLeftSidebar: () => void;
  isLeftSidebarCollapsed: boolean;
  activeMainView?: "dashboard" | "knowledge-base" | "daily-brief" | "docs";
  onSelectMainView?: (view: "dashboard" | "knowledge-base" | "daily-brief" | "docs") => void;
}

export default function DashboardNavbar({
  onToggleLeftSidebar,
  isLeftSidebarCollapsed,
  activeMainView = "dashboard",
  onSelectMainView,
}: DashboardNavbarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAiDropdownOpen, setIsAiDropdownOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const aiDropdownRef = useRef<HTMLDivElement>(null);
  useClickOutside(aiDropdownRef, () => setIsAiDropdownOpen(false), isAiDropdownOpen);

  return (
    <header className={styles.navbar}>
      {/* ── Left Area: Sidebar Toggle & Search & Nav Links ── */}
      <div className={styles.leftSection}>
        {/* Sidebar Hamburger Toggle */}
        <button
          type="button"
          className={styles.hamburgerBtn}
          onClick={onToggleLeftSidebar}
          title={isLeftSidebarCollapsed ? "Mở rộng sidebar" : "Thu gọn sidebar"}
          aria-label="Toggle Left Sidebar"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2.4" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        {/* Search Bar */}
        <div className={styles.searchContainer}>
          <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* AI Systems Dropdown */}
        <div className={styles.dropdownWrapper} ref={aiDropdownRef}>
          <button
            type="button"
            className={styles.aiSystemsBtn}
            onClick={() => setIsAiDropdownOpen(!isAiDropdownOpen)}
          >
            <span>Al Systems</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {isAiDropdownOpen && (
            <div className={styles.dropdownMenu}>
              <button type="button" className={styles.dropdownItem} onClick={() => setIsAiDropdownOpen(false)}>
                <span className={styles.dotOnline} /> Gemini 2.5 Flash (Active)
              </button>
              <button type="button" className={styles.dropdownItem} onClick={() => setIsAiDropdownOpen(false)}>
                <span className={styles.dotOnline} /> Content Generation Engine
              </button>
              <button type="button" className={styles.dropdownItem} onClick={() => setIsAiDropdownOpen(false)}>
                <span className={styles.dotOnline} /> SEO & Keyword Cluster Agent
              </button>
            </div>
          )}
        </div>

        {/* Quick Nav Links */}
        <nav className={styles.navLinks}>
          <button
            type="button"
            className={`${styles.navLink} ${activeMainView === "knowledge-base" ? styles.navLinkActive : ""}`}
            onClick={() => onSelectMainView?.("knowledge-base")}
          >
            Knowledge Base
          </button>
          <button
            type="button"
            className={`${styles.navLink} ${activeMainView === "daily-brief" ? styles.navLinkActive : ""}`}
            onClick={() => onSelectMainView?.("daily-brief")}
          >
            Daily Brief
          </button>
          <button
            type="button"
            className={`${styles.navLink} ${activeMainView === "docs" ? styles.navLinkActive : ""}`}
            onClick={() => onSelectMainView?.("docs")}
          >
            Docs
          </button>
        </nav>
      </div>

      {/* ── Right Area: Tools, Themes, Profile ── */}
      <div className={styles.rightSection}>
        {/* Dark Mode Moon */}
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => setIsDarkMode(!isDarkMode)}
          title="Dark Mode"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>

        {/* Language Globe */}
        <button type="button" className={styles.iconBtn} title="Language">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </button>

        {/* Notifications Bell */}
        <button type="button" className={styles.iconBtn} title="Notifications">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className={styles.notificationDot} />
        </button>

        {/* User Profile Avatar */}
        <div className={styles.avatarWrapper} title="Quang Quang - Owner">
          <UserAvatar size={34} />
        </div>
      </div>
    </header>
  );
}
