"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { initials } from "@/lib/format";

export interface WorkspaceItem {
  id: string;
  name: string;
  subtitle: string;
  initials: string;
  avatarBg: string;
  tag?: string;
  members?: number;
}

/** Fallback workspace used by standalone visual views from the Tien UI branch. */
export const DEFAULT_WORKSPACES: WorkspaceItem[] = [
  { id: "tripc", name: "TripC", subtitle: "Growth workspace", initials: "T", avatarBg: "bg-blue-500", tag: "Active", members: 3 },
];

interface DashboardSidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  workspaces?: WorkspaceItem[];
  selectedWorkspace?: WorkspaceItem;
  onWorkspaceChange?: (workspace: WorkspaceItem) => void;
  reviewBadge?: number;
  user?: { name: string; role: string };
  onLogout?: () => void;
}

export default function DashboardSidebar({
  activeTab = "overview",
  onTabChange,
  workspaces = DEFAULT_WORKSPACES,
  selectedWorkspace = DEFAULT_WORKSPACES[0],
  onWorkspaceChange,
  reviewBadge,
  user = { name: "Owner", role: "Owner" },
  onLogout = () => undefined,
}: DashboardSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Tab đang chọn suy ra từ đường dẫn; trang không nằm trong menu thì dùng activeTab
  const TAB_BY_PATH: Record<string, string> = {
    "/agents": "agents",
    "/dashboard": "overview",
    "/workflows": "workflows",
    "/review-queue": "review-queue",
    "/artifacts": "artifacts",
    "/distribution": "distribution",
    "/growth-results": "growth-results",
    "/workspace": "workspace-integrations",
  };
  const currentTab = TAB_BY_PATH[pathname.replace(/\/$/, "")] ?? activeTab;

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleNav = (tabId: string, href?: string) => {
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

  const navItems = [
    { id: "agents", label: "Agent Operations", href: "/agents", icon: <span className="text-lg" aria-hidden="true">↗</span> },
    {
      id: "overview",
      label: "Overview",
      href: "/dashboard",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4 4h7v7H4V4zm0 9h7v7H4v-7zm9-9h7v7h-7V4zm0 9h7v7h-7v-7z" />
        </svg>
      ),
    },
    {
      id: "workflows",
      label: "Workflows & Tasks",
      href: "/workflows",
      icon: (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <path d="M10 6.5h4M6.5 10v7.5a1 1 0 001 1H14" />
        </svg>
      ),
    },
    {
      id: "artifacts",
      label: "Artifacts",
      href: "/artifacts",
      icon: (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
    },
    {
      id: "review-queue",
      label: "Review Queue",
      href: "/review-queue",
      badge: reviewBadge && reviewBadge > 0 ? reviewBadge : undefined,
      badgeColor: "red",
      icon: (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      ),
    },
    {
      id: "distribution",
      label: "Distribution",
      href: "/distribution",
      icon: (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="22" y1="2" x2="11" y2="13" />
          <polygon points="22 2 15 22 11 13 2 9 22 2" />
        </svg>
      ),
    },
    {
      id: "growth-results",
      label: "Growth Results",
      href: "/growth-results",
      icon: (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      ),
    },
    {
      id: "workspace-integrations",
      label: "Workspace & Integrations",
      href: "/workspace",
      icon: (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      ),
    },
  ];

  return (
    <aside className="w-64 shrink-0 bg-[#1d4ed8] text-white flex flex-col justify-between min-h-screen sticky top-0 h-screen select-none z-30">
      {/* Top Header & Workspace Switcher */}
      <div className="p-4 space-y-4">
        {/* Brand Logo */}
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-inner">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <span className="font-bold text-white tracking-tight text-base block leading-tight">
              AI Growth OS
            </span>
            <span className="text-[11px] text-blue-200/80 block leading-tight">
              Growth operating system
            </span>
          </div>
        </div>

        {/* Workspace Switcher Pill with Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`w-full bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl p-2.5 flex items-center justify-between cursor-pointer transition-all ${
              isDropdownOpen ? "ring-2 ring-white/30 bg-white/15" : ""
            }`}
          >
            <div className="flex items-center gap-2.5 text-left min-w-0">
              <div
                className={`w-7 h-7 rounded-lg ${selectedWorkspace.avatarBg} text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0`}
              >
                {selectedWorkspace.initials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white leading-none truncate">
                  {selectedWorkspace.name}
                </p>
                <p className="text-[10px] text-blue-200/80 mt-0.5 leading-none truncate">
                  {selectedWorkspace.subtitle}
                </p>
              </div>
            </div>
            <svg
              className={`w-4 h-4 text-blue-200/80 shrink-0 transition-transform duration-200 ${
                isDropdownOpen ? "rotate-180" : ""
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 9l4-4 4 4m0 6l-4 4-4-4"
              />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-slate-900/95 backdrop-blur-xl border border-blue-400/30 rounded-2xl p-2 shadow-2xl z-50 text-white animate-in fade-in duration-150">
              <div className="px-2 py-1.5 flex items-center justify-between text-[10px] uppercase font-bold text-blue-300/70">
                <span>Select Workspace</span>
                <span>{workspaces.length} total</span>
              </div>

              <div className="space-y-1 mt-1">
                {workspaces.map((ws) => {
                  const isSelected = selectedWorkspace.id === ws.id;
                  return (
                    <button
                      key={ws.id}
                      type="button"
                      onClick={() => handleSelectWorkspace(ws)}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all cursor-pointer ${
                        isSelected
                          ? "bg-blue-600 text-white font-semibold shadow-xs"
                          : "text-slate-200 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg ${ws.avatarBg} text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs`}
                        >
                          {ws.initials}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold leading-tight truncate">
                            {ws.name}
                          </p>
                          <p className="text-[10px] text-blue-200/70 truncate leading-tight">
                            {ws.subtitle}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pl-2">
                        {ws.tag && (
                          <span
                            className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                              isSelected
                                ? "bg-white/20 text-white"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {ws.tag}
                          </span>
                        )}
                        {isSelected && (
                          <svg
                            className="w-3.5 h-3.5 text-white"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

            </div>
          )}
        </div>

        {/* Navigation List */}
        <nav className="space-y-1 pt-2">
          {navItems.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id, item.href)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? "bg-white text-[#1d4ed8] font-bold shadow-sm"
                    : "text-blue-100/90 hover:bg-white/10 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={isActive ? "text-[#1d4ed8]" : "text-blue-200"}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      item.badgeColor === "red"
                        ? "bg-rose-500 text-white"
                        : isActive
                        ? "bg-blue-100 text-[#1d4ed8]"
                        : "bg-blue-500 text-white"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Workspace Intelligence & User Profile */}
      <div className="p-4 border-t border-blue-600/60 space-y-3">
        <div className="px-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-200/60">
            Workspace Intelligence
          </p>
        </div>

        <div className="space-y-1">
          <div role="link" tabIndex={0} onClick={() => router.push("/workspace#profile")} className="px-3 py-2 rounded-xl text-blue-100 hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg
                className="w-4 h-4 text-blue-200"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
              <div>
                <p className="text-xs font-medium text-white leading-tight">
                  Growth Knowledge
                </p>
                <p className="text-[10px] text-blue-200/70">
                  Business context & voice
                </p>
              </div>
            </div>
          </div>

          <div role="link" tabIndex={0} onClick={() => router.push("/workspace#integrations")} className="px-3 py-2 rounded-xl text-blue-100 hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <svg
                className="w-4 h-4 text-blue-200"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              <div>
                <p className="text-xs font-medium text-white leading-tight">
                  Connection status
                </p>
                <p className="text-[10px] text-blue-200/70">
                  Connected channels
                </p>
              </div>
            </div>
          </div>

          <div className="px-3 py-1.5 rounded-xl text-blue-100 hover:bg-white/10 transition-colors cursor-pointer flex items-center gap-2.5">
            <svg
              className="w-4 h-4 text-blue-200"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-xs font-medium text-white">
              Help & documentation
            </span>
          </div>
        </div>

        {/* User Profile Footer */}
        <div className="pt-2 border-t border-blue-600/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-300 text-blue-900 font-bold text-xs flex items-center justify-center">
              {initials(user.name)}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white leading-tight truncate">
                {user.name}
              </p>
              <p className="text-[10px] text-blue-200/70 leading-tight">
                {user.role}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            title="Logout"
            className="text-blue-200 hover:text-white transition-colors p-1 cursor-pointer"
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
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
