"use client";

import React from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { WorkspaceItem } from "./DashboardSidebar";

interface WorkspaceContextBannerProps {
  workspace: WorkspaceItem;
}

export default function WorkspaceContextBanner({
  workspace,
}: WorkspaceContextBannerProps) {
  const { language } = useLanguage();

  return (
    <section aria-label="Workspace Context">
      <div className="workspace-context-banner" id="workspaceContextBanner">
        {/* Left: Identity + Details */}
        <div className="wcb-left">
          <div className="wcb-identity">
            <div className="wcb-avatar" id="wcbAvatar">
              {workspace.name.charAt(0).toUpperCase()}
            </div>
            <div className="wcb-text">
              <div className="wcb-workspace-name" id="wcbWorkspaceName">
                {workspace.name}
              </div>
              <div className="wcb-meta-row">
                <span className="wcb-tag" id="wcbIndustryTag">
                  {workspace.tag}
                </span>
                <span className="wcb-tag" id="wcbSlugTag">
                  slug: {workspace.id.replace("ws_", "").replace("_01", "")}
                </span>
                <span className="wcb-tag">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="8" r="4" />
                    <path d="M20 21a8 8 0 1 0-16 0" />
                  </svg>
                  {language === "vi" ? "Chủ sở hữu" : "Owner"}
                </span>
              </div>
            </div>
          </div>

          {/* Business profile quick details (4 balanced cells, 16px padding, clear gap) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 mt-2">
            <div className="bg-white/10 hover:bg-white/15 border border-white/15 hover:border-white/25 rounded-xl p-4 backdrop-blur-md transition-all flex flex-col justify-between gap-2.5">
              <div className="text-sky-200 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>{language === "vi" ? "Khách hàng mục tiêu" : "Target Audience"}</span>
              </div>
              <div className="text-white text-sm font-bold leading-snug" id="wcbDetailAudience">
                {language === "vi"
                  ? "Du khách Millennial & Gen Z"
                  : "Millennial & Gen Z travellers"}
              </div>
            </div>

            <div className="bg-white/10 hover:bg-white/15 border border-white/15 hover:border-white/25 rounded-xl p-4 backdrop-blur-md transition-all flex flex-col justify-between gap-2.5">
              <div className="text-sky-200 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span>{language === "vi" ? "Thị trường trọng điểm" : "Target Locations"}</span>
              </div>
              <div className="text-white text-sm font-bold leading-snug" id="wcbDetailLocations">
                {language === "vi"
                  ? "Việt Nam, Đông Nam Á"
                  : "Vietnam, Southeast Asia"}
              </div>
            </div>

            <div className="bg-white/10 hover:bg-white/15 border border-white/15 hover:border-white/25 rounded-xl p-4 backdrop-blur-md transition-all flex flex-col justify-between gap-2.5">
              <div className="text-sky-200 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
                <span>{language === "vi" ? "Mục tiêu chuyển đổi" : "Conversion Goal"}</span>
              </div>
              <div className="text-white text-sm font-bold leading-snug" id="wcbDetailConversion">
                {language === "vi"
                  ? "Đăng ký nhận tin & đặt tour"
                  : "Newsletter signup & booking referral"}
              </div>
            </div>

            <div className="bg-white/10 hover:bg-white/15 border border-white/15 hover:border-white/25 rounded-xl p-4 backdrop-blur-md transition-all flex flex-col justify-between gap-2.5">
              <div className="text-sky-200 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                  <path d="M2 12h20" />
                </svg>
                <span>{language === "vi" ? "Kênh hoạt động" : "Active Channels"}</span>
              </div>
              <div className="text-white text-sm font-bold leading-snug" id="wcbDetailChannels">
                Blog, LinkedIn, Instagram
              </div>
            </div>
          </div>
        </div>

        {/* Right: Members + Goal KPI */}
        <div className="wcb-right">
          <div className="wcb-members-strip">
            <div className="text-sky-200/90 text-xs font-bold uppercase tracking-wider">
              <span id="wcbMembersCount">{workspace.members ?? 3}</span>{" "}
              {language === "vi" ? "Thành viên" : "Members"}
            </div>
            <div className="wcb-members-list mt-1" id="wcbMembersList">
              <div className="wcb-member-avatar role-owner" title="Alex Morgan (Owner)">
                AM
              </div>
              <div className="wcb-member-avatar role-editor" title="Sophie Chen (Editor)">
                SC
              </div>
              <div className="wcb-member-avatar role-viewer" title="Jin Park (Viewer)">
                JP
              </div>
            </div>
          </div>

          <div className="wcb-goal-kpi">
            <div className="text-sky-200/90 text-xs font-bold uppercase tracking-wider mb-1" id="wcbGoalLabel">
              {language === "vi" ? "Mục tiêu truy cập chuẩn" : "Qualified Traffic Goal"}
            </div>
            <div className="wcb-goal-progress-row">
              <div className="wcb-goal-value" id="wcbGoalValue">
                12,480
              </div>
              <div className="wcb-goal-target" id="wcbGoalTarget">
                / 20,000 {language === "vi" ? "mục tiêu" : "target"}
              </div>
            </div>
            <div className="wcb-goal-bar">
              <div
                className="wcb-goal-bar-fill"
                id="wcbGoalBarFill"
                style={{ width: "62%" }}
              />
            </div>
          </div>

          <Link
            href="/workspace-integrations"
            className="h-10 px-4 rounded-xl bg-white/15 hover:bg-white/20 border border-white/25 text-white text-xs font-semibold inline-flex items-center gap-2 transition-all shadow-xs"
            title={language === "vi" ? "Mở Cài đặt Không gian" : "Open Workspace Settings"}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>{language === "vi" ? "Cài đặt Không gian" : "Workspace Settings"}</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
