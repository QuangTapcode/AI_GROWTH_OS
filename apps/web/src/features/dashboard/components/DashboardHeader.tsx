"use client";

import React from "react";
import { initials } from "@/lib/format";

interface DashboardHeaderProps {
  workspaceName: string;
  currentPageTitle?: string;
  searchPlaceholder?: string;
  user?: { name: string; role: string };
  notificationsCount?: number;
}

export default function DashboardHeader({
  workspaceName,
  currentPageTitle = "Overview",
  searchPlaceholder,
  user = { name: "Owner", role: "Owner" },
  notificationsCount = 0,
}: DashboardHeaderProps) {
  const placeholderText =
    searchPlaceholder ||
    (currentPageTitle === "Review Queue"
      ? "Search pipelines, nodes, logs..."
      : "Search anything...");

  return (
    <header className="bg-[#1e40af] text-white px-6 py-3.5 flex items-center justify-between border-b border-blue-600/40 select-none sticky top-0 z-20">
      {/* Left Breadcrumb */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-blue-200/90 font-semibold">{workspaceName}</span>
        <span className="text-blue-300/40">/</span>
        <span className="text-white font-semibold">{currentPageTitle}</span>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Search Bar */}
        <div className="relative">
          <input
            type="text"
            placeholder={placeholderText}
            className="w-56 lg:w-64 pl-8 pr-3 py-1.5 bg-white/10 hover:bg-white/15 focus:bg-white/20 border border-white/15 rounded-xl text-xs text-white placeholder:text-blue-200/60 focus:outline-none focus:ring-1 focus:ring-white/30 transition-all"
          />
          <svg
            className="w-3.5 h-3.5 text-blue-200/70 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Operational Status Pill */}
        <div className="hidden sm:flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-3 py-1 text-xs text-blue-50 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
          <span>API connected</span>
        </div>

        {/* Notification Bell */}
        <button
          type="button"
          className="relative p-2 rounded-xl bg-white/10 hover:bg-white/15 transition-colors cursor-pointer text-white"
          title={`${notificationsCount} items need attention`}
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
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          {notificationsCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white font-bold text-[9px] rounded-full flex items-center justify-center border-2 border-[#1e40af]">
              {notificationsCount > 9 ? "9+" : notificationsCount}
            </span>
          )}
        </button>

        {/* Sliders / Filter tuning icon */}
        <button
          type="button"
          className="p-2 rounded-xl bg-white/10 hover:bg-white/15 transition-colors cursor-pointer text-white hidden md:flex items-center justify-center"
          title="Filter and system settings"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
        </button>

        {/* User Profile Avatar with Name */}
        <div className="flex items-center gap-2 pl-1">
          <div className="w-7 h-7 rounded-full bg-blue-300 text-blue-900 font-bold text-[11px] flex items-center justify-center border border-white/30">
            {initials(user.name)}
          </div>
          <div className="hidden lg:block text-left leading-tight">
            <p className="text-xs font-bold text-white leading-tight">{user.name}</p>
            <p className="text-[10px] text-blue-200/70 leading-tight">{user.role}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
