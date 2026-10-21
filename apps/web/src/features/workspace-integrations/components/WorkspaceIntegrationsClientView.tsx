"use client";

import React, { useState } from "react";
import DashboardSidebar, {
  DEFAULT_WORKSPACES,
  type WorkspaceItem,
} from "@/features/dashboard/components/DashboardSidebar";
import DashboardHeader from "@/features/dashboard/components/DashboardHeader";
import {
  MOCK_WORKSPACE_PROFILE,
  MOCK_BRAND_TONES,
  MOCK_BRAND_RULES,
  MOCK_TEAM_MEMBERS,
  MOCK_INTEGRATIONS,
} from "../data/workspaceIntegrationsMockData";
import {
  WorkspaceProfile,
  BrandTone,
  TeamMember,
  WorkspaceIntegrationItem,
} from "../types";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function WorkspaceIntegrationsClientView() {
  const { language, t } = useLanguage();
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceItem>(
    DEFAULT_WORKSPACES[0]
  );
  const [activeTab, setActiveTab] = useState("workspace-integrations");

  // Sub-tab: "workspace" (Profile & Brand Voice) vs "integrations" (Connected Feeds)
  const [currentSubTab, setCurrentSubTab] = useState<"workspace" | "integrations">(
    "workspace"
  );

  // Workspace Profile State
  const [profile, setProfile] = useState<WorkspaceProfile>(
    MOCK_WORKSPACE_PROFILE
  );
  const [tones] = useState<BrandTone[]>(MOCK_BRAND_TONES);
  const [rules] = useState<BrandTone[]>(MOCK_BRAND_RULES);
  const [members, setMembers] = useState<TeamMember[]>(MOCK_TEAM_MEMBERS);
  const [integrations, setIntegrations] =
    useState<WorkspaceIntegrationItem[]>(MOCK_INTEGRATIONS);
  const [integrationFilter, setIntegrationFilter] = useState<string>("all");
  const [integrationSearch, setIntegrationSearch] = useState<string>("");

  // Settings State
  const [settings, setSettings] = useState({
    autonomousMode: true,
    safeModeSocial: true,
    retentionDays: "90 Days",
    telemetryAnonymization: true,
    concurrencyLimit: "5 Concurrent Tasks",
  });

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isBrandVoiceModalOpen, setIsBrandVoiceModalOpen] = useState(false);
  const [detailsModal, setDetailsModal] = useState<{
    title: string;
    subtitle: string;
    items: { label: string; value: string }[];
  } | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"Editor" | "Viewer">("Editor");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSaveChanges = () => {
    showToast(
      language === "vi"
        ? "Đã lưu thành công các cài đặt không gian làm việc và giọng văn thương hiệu!"
        : "Workspace configuration and brand voice settings saved successfully!"
    );
  };

  const handleRoleChange = (
    memberId: string,
    newRole: "Owner" | "Admin" | "Editor" | "Viewer"
  ) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );
    showToast(
      language === "vi"
        ? "Đã cập nhật vai trò thành viên thành công."
        : "Member role updated successfully."
    );
  };

  const handleRemoveMember = (memberId: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
    showToast(
      language === "vi"
        ? "Đã xóa thành viên khỏi không gian."
        : "Member removed from workspace."
    );
  };

  const handleExportConfig = () => {
    const configData = {
      profile,
      tones,
      rules,
      settings,
      membersCount: members.length,
      integrations: integrations.map((i) => ({
        id: i.id,
        name: i.name,
        account: i.account,
        status: i.status,
      })),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(configData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `TripC_Workspace_Config.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(
      language === "vi"
        ? "Đã xuất tệp cấu hình không gian làm việc (.json) thành công!"
        : "Workspace configuration JSON archive exported successfully!"
    );
  };

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    const newMember: TeamMember = {
      id: `mem_${Date.now()}`,
      name: inviteEmail.split("@")[0],
      email: inviteEmail,
      role: inviteRole,
      status: "Invited • Pending",
      avatarClass: "bg-blue-500",
      initials: inviteEmail.charAt(0).toUpperCase(),
    };
    setMembers((prev) => [...prev, newMember]);
    setInviteEmail("");
    setIsInviteModalOpen(false);
    showToast(
      language === "vi"
        ? `Đã gửi lời mời tham gia đến ${inviteEmail}.`
        : `Invitation sent to ${inviteEmail}.`
    );
  };

  const handleToggleIntegration = (id: string) => {
    setIntegrations((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextStatus =
            item.status === "connected" ? "attention" : "connected";
          return {
            ...item,
            status: nextStatus,
            statusLabel: nextStatus === "connected" ? "Connected" : "Action Required",
          };
        }
        return item;
      })
    );
    showToast(
      language === "vi"
        ? "Đã cập nhật trạng thái kết nối tích hợp."
        : "Integration connection state toggled."
    );
  };

  const filteredIntegrations = integrations.filter((item) => {
    if (integrationFilter !== "all" && item.category !== integrationFilter) {
      return false;
    }
    if (
      integrationSearch &&
      !item.name.toLowerCase().includes(integrationSearch.toLowerCase()) &&
      !item.description.toLowerCase().includes(integrationSearch.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const trafficPct = Math.round(
    (profile.currentTraffic / profile.targetTraffic) * 100
  );
  const leadsPct = Math.round(
    (profile.currentLeads / profile.targetLeads) * 100
  );

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
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* ── Left Sidebar ── */}
      <DashboardSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedWorkspace={currentWorkspace}
        onWorkspaceChange={setCurrentWorkspace}
      />

      {/* ── Main Content Area ── */}
      <div className="main-wrapper">
        <DashboardHeader
          workspaceName={currentWorkspace.name}
          currentPageTitle="Workspace & Integrations"
          searchPlaceholder={
            language === "vi"
              ? "Tìm kiếm cài đặt không gian, tích hợp..."
              : "Search workspace configuration, feeds..."
          }
        />

        <main className="content-body">
          {/* 1. PAGE HEADER */}
          <div className="wi-header">
            <div className="wi-header-left">
              <div className="wi-badge-row">
                <span className="wi-eyebrow">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  {t.workspaceIntegrations.eyebrow}
                </span>
                <span className="wi-mock-pill">
                  Production Multi-Tenant Environment
                </span>
              </div>
              <h1 className="wi-title">{t.workspaceIntegrations.pageTitle}</h1>
              <p className="wi-desc">{t.workspaceIntegrations.subtitle}</p>
            </div>

            <div className="wi-header-actions">
              <button
                type="button"
                onClick={handleExportConfig}
                className="btn btn-secondary"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {t.workspaceIntegrations.exportConfig}
              </button>
              <button
                type="button"
                onClick={handleSaveChanges}
                className="btn btn-primary"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                {t.workspaceIntegrations.saveChanges}
              </button>
            </div>
          </div>

          {/* 2. SUB-NAVIGATION TABS BAR */}
          <div className="wi-tabs-bar" role="tablist">
            <button
              type="button"
              onClick={() => setCurrentSubTab("workspace")}
              className={`wi-tab-btn ${
                currentSubTab === "workspace" ? "active" : ""
              }`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>{t.workspaceIntegrations.tabWorkspace}</span>
              <span className="wi-tab-badge">TripC</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentSubTab("integrations")}
              className={`wi-tab-btn ${
                currentSubTab === "integrations" ? "active" : ""
              }`}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span>{t.workspaceIntegrations.tabIntegrations}</span>
              <span
                className="wi-tab-badge"
                style={{ background: "#ECFDF5", color: "#047857" }}
              >
                6 Connected
              </span>
            </button>
          </div>

          {/* 3. TAB 1: WORKSPACE PROFILE & BRAND VOICE (5-CARD BALANCED GRID) */}
          {currentSubTab === "workspace" && (
            <div className="wi-workspace-layout">
              <div className="wi-workspace-grid">
                {/* ── CARD 1: Workspace Overview (Row 1 Left) ── */}
                <div className="wi-card accent-blue" id="wiOverviewCard">
                  <div className="wi-card-header">
                    <div className="wi-card-title-group">
                      <div className="wi-card-icon blue">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                        >
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="wi-card-title">Workspace Overview</h2>
                        <p className="wi-card-subtitle">
                          Operational parameters and verified digital assets
                        </p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() =>
                          setDetailsModal({
                            title: "Workspace Overview Details",
                            subtitle: "Technical multi-tenant operational parameters",
                            items: [
                              { label: "Workspace Name", value: profile.name },
                              { label: "Slug", value: profile.slug },
                              { label: "Primary Website", value: profile.website },
                              { label: "Industry & Vertical", value: profile.industry },
                              { label: "Target Geographies", value: profile.targetMarkets },
                              { label: "Timezone", value: profile.timezone },
                              { label: "Operational Status", value: profile.status },
                            ],
                          })
                        }
                        className="btn btn-sm btn-ghost"
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditModalOpen(true)}
                        className="btn btn-sm btn-ghost"
                      >
                        Edit Overview
                      </button>
                    </div>
                  </div>

                  <div className="wi-card-body">
                    {/* 6 Tinted Information Boxes with Icons */}
                    <div className="wi-meta-grid">
                      {/* 1. Workspace Name */}
                      <div className="wi-meta-item-tinted tint-blue">
                        <div className="wi-meta-icon">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </div>
                        <div className="wi-meta-content">
                          <span className="wi-meta-label">Workspace Name</span>
                          <span className="wi-meta-val">{profile.name}</span>
                        </div>
                      </div>

                      {/* 2. Primary Website */}
                      <div className="wi-meta-item-tinted tint-cyan">
                        <div className="wi-meta-icon">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="2" y1="12" x2="22" y2="12" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                          </svg>
                        </div>
                        <div className="wi-meta-content">
                          <span className="wi-meta-label">Primary Website</span>
                          <span className="wi-meta-val">
                            <a
                              href={profile.website}
                              target="_blank"
                              rel="noopener"
                              style={{
                                color: "var(--brand-accent)",
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              {profile.website.replace("https://", "")}
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                              >
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                <polyline points="15 3 21 3 21 9" />
                                <line x1="10" y1="14" x2="21" y2="3" />
                              </svg>
                            </a>
                          </span>
                        </div>
                      </div>

                      {/* 3. Industry & Vertical */}
                      <div className="wi-meta-item-tinted tint-indigo">
                        <div className="wi-meta-icon">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                          </svg>
                        </div>
                        <div className="wi-meta-content">
                          <span className="wi-meta-label">Industry &amp; Vertical</span>
                          <span className="wi-meta-val">{profile.industry}</span>
                        </div>
                      </div>

                      {/* 4. Target Geographies */}
                      <div className="wi-meta-item-tinted tint-amber">
                        <div className="wi-meta-icon">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                        </div>
                        <div className="wi-meta-content">
                          <span className="wi-meta-label">Target Geographies</span>
                          <span className="wi-meta-val">{profile.targetMarkets}</span>
                        </div>
                      </div>

                      {/* 5. Operational Status */}
                      <div className="wi-meta-item-tinted tint-emerald">
                        <div className="wi-meta-icon">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                          </svg>
                        </div>
                        <div className="wi-meta-content">
                          <span className="wi-meta-label">Operational Status</span>
                          <span className="wi-meta-val">
                            <span className="wi-status-indicator">
                              <span className="wi-status-dot" />
                              {profile.status}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* 6. Workspace Timezone */}
                      <div className="wi-meta-item-tinted tint-violet">
                        <div className="wi-meta-icon">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                        </div>
                        <div className="wi-meta-content">
                          <span className="wi-meta-label">Workspace Timezone</span>
                          <span
                            className="wi-meta-val"
                            style={{ fontFamily: "var(--font-mono)", fontSize: "12px" }}
                          >
                            {profile.timezone}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── CARD 2: Workspace Members (Row 1 Right) ── */}
                <div className="wi-card accent-emerald" id="members">
                  <div className="wi-card-header">
                    <div className="wi-card-title-group">
                      <div className="wi-card-icon emerald">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                        >
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="wi-card-title">Workspace Members</h2>
                        <p className="wi-card-subtitle">
                          Team roles, review authority, and active access
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsInviteModalOpen(true)}
                      className="btn btn-sm btn-outline-blue"
                    >
                      + Invite Member
                    </button>
                  </div>

                  <div className="wi-card-body">
                    <div
                      className="wi-member-list"
                      style={{ display: "flex", flexDirection: "column", gap: "10px" }}
                    >
                      {members.map((m) => {
                        const avatarGradients: Record<string, string> = {
                          Owner: "linear-gradient(135deg, #1D4ED8, #3B82F6)",
                          Editor:
                            m.id === "mem_2"
                              ? "linear-gradient(135deg, #7C3AED, #A78BFA)"
                              : "linear-gradient(135deg, #059669, #34D399)",
                          Viewer: "linear-gradient(135deg, #475569, #94A3B8)",
                        };
                        return (
                          <div
                            key={m.id}
                            className="wi-member-card"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "10px 14px",
                              background: "#F8FAFD",
                              border: "1px solid var(--border-light)",
                              borderRadius: "var(--radius-lg)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                              <div
                                className="wi-avatar"
                                style={{
                                  width: "36px",
                                  height: "36px",
                                  borderRadius: "50%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  color: "#fff",
                                  fontWeight: 800,
                                  fontSize: "12.5px",
                                  background:
                                    avatarGradients[m.role] ||
                                    "linear-gradient(135deg, #2563EB, #1D4ED8)",
                                  flexShrink: 0,
                                }}
                              >
                                {m.initials}
                              </div>
                              <div>
                                <div
                                  style={{
                                    fontWeight: 700,
                                    fontSize: "13px",
                                    color: "var(--brand-navy)",
                                  }}
                                >
                                  {m.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: "11px",
                                    color: "var(--text-secondary)",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "5px",
                                  }}
                                >
                                  <span>{m.email}</span>
                                  <span>•</span>
                                  <span
                                    style={{
                                      color: m.status.includes("now")
                                        ? "#059669"
                                        : "#64748B",
                                      fontWeight: m.status.includes("now") ? 700 : 500,
                                    }}
                                  >
                                    {m.status}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <select
                                className="form-select wi-role-select"
                                value={m.role}
                                onChange={(e) =>
                                  handleRoleChange(
                                    m.id,
                                    e.target.value as "Owner" | "Admin" | "Editor" | "Viewer"
                                  )
                                }
                                style={{
                                  padding: "5px 12px",
                                  fontSize: "11.5px",
                                  fontWeight: 700,
                                  borderRadius: "8px",
                                  border: "1px solid #CBD5E1",
                                  background: "#fff",
                                  cursor: "pointer",
                                  outline: "none",
                                }}
                              >
                                <option value="Owner">Owner</option>
                                <option value="Editor">Editor</option>
                                <option value="Viewer">Viewer</option>
                              </select>
                              {m.role !== "Owner" && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMember(m.id)}
                                  title="Remove member"
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "#94A3B8",
                                    cursor: "pointer",
                                    padding: "4px",
                                    fontSize: "13px",
                                    lineHeight: 1,
                                    borderRadius: "4px",
                                  }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* ── CARD 3: Business Context (Row 2 Left) ── */}
                <div className="wi-card accent-violet" id="knowledge">
                  <div className="wi-card-header">
                    <div className="wi-card-title-group">
                      <div className="wi-card-icon violet">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                        >
                          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="wi-card-title">Business Context</h2>
                        <p className="wi-card-subtitle">
                          Guides autonomous research, SEO strategy, and persona synth...
                        </p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() =>
                          setDetailsModal({
                            title: "Business Context & Growth Lineage",
                            subtitle: "Knowledge graph ground truth for AI synthesis",
                            items: [
                              { label: "Executive Summary", value: profile.summary },
                              { label: "Target Audience", value: profile.targetAudience },
                              { label: "Core Products", value: profile.coreOfferings },
                              {
                                label: "Traffic Target",
                                value: `${profile.currentTraffic.toLocaleString()} / ${profile.targetTraffic.toLocaleString()} visits`,
                              },
                              {
                                label: "Leads Target",
                                value: `${profile.currentLeads} / ${profile.targetLeads} qualified leads`,
                              },
                            ],
                          })
                        }
                        className="btn btn-sm btn-ghost"
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditModalOpen(true)}
                        className="btn btn-sm btn-ghost"
                      >
                        Edit Context
                      </button>
                    </div>
                  </div>

                  <div className="wi-card-body">
                    <div className="wi-context-block">
                      {/* Core Business Summary */}
                      <div className="wi-context-row">
                        <span
                          className="wi-context-lbl"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            color: "var(--wi-indigo)",
                          }}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          Core Business Summary
                        </span>
                        <p className="wi-context-text">{profile.summary}</p>
                      </div>

                      {/* Target Audience & Personas */}
                      <div className="wi-context-row">
                        <span
                          className="wi-context-lbl"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            color: "var(--wi-violet-dark)",
                          }}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                          </svg>
                          Target Audience &amp; Personas
                        </span>
                        <p className="wi-context-text">{profile.targetAudience}</p>
                      </div>

                      {/* Key Products & Content Formats */}
                      <div className="wi-context-row">
                        <span
                          className="wi-context-lbl"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            color: "var(--wi-teal-dark)",
                          }}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                          >
                            <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          </svg>
                          Key Products &amp; Content Formats
                        </span>
                        <p className="wi-context-text">{profile.coreOfferings}</p>
                      </div>

                      {/* Growth Goals Box */}
                      <div className="wi-goal-box">
                        <div className="wi-goal-header">
                          <span style={{ fontWeight: 700, color: "var(--brand-navy)" }}>
                            {profile.growthGoalLabel}
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontWeight: 700,
                              color: "var(--wi-blue)",
                            }}
                          >
                            {profile.currentTraffic.toLocaleString()} /{" "}
                            {profile.targetTraffic.toLocaleString()} visits ({trafficPct}%)
                          </span>
                        </div>
                        <div className="wi-goal-bar-bg">
                          <div
                            className="wi-goal-bar-fill"
                            style={{ width: `${trafficPct}%` }}
                          />
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "11px",
                            color: "var(--text-secondary)",
                            marginTop: "2px",
                          }}
                        >
                          <span>Qualified Leads Conversion Target</span>
                          <strong
                            style={{
                              color: "#047857",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {profile.currentLeads} / {profile.targetLeads} leads ({leadsPct}%)
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── CARD 4: Workspace Settings (Row 2 Right - Balanced Height) ── */}
                <div className="wi-card accent-amber" id="wiSettingsCard">
                  <div className="wi-card-header">
                    <div className="wi-card-title-group">
                      <div className="wi-card-icon amber">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                        >
                          <circle cx="12" cy="12" r="3" />
                          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="wi-card-title">Workspace Settings</h2>
                        <p className="wi-card-subtitle">
                          Autonomous execution and telemetry retention controls
                        </p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() =>
                          setDetailsModal({
                            title: "Workspace Settings Policy",
                            subtitle: "Autonomous safety gates and compliance limits",
                            items: [
                              {
                                label: "Autonomous Engine",
                                value: settings.autonomousMode ? "Active" : "Paused",
                              },
                              {
                                label: "Social Safe Mode",
                                value: settings.safeModeSocial ? "Enforced" : "Disabled",
                              },
                              {
                                label: "Retention Window",
                                value: settings.retentionDays,
                              },
                              {
                                label: "Telemetry Anonymization",
                                value: settings.telemetryAnonymization ? "Active" : "Off",
                              },
                              {
                                label: "Agent Concurrency",
                                value: settings.concurrencyLimit,
                              },
                            ],
                          })
                        }
                        className="btn btn-sm btn-ghost"
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveChanges}
                        className="btn btn-sm btn-ghost"
                      >
                        Save Settings
                      </button>
                    </div>
                  </div>

                  <div className="wi-card-body" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "14px" }}>
                    <div className="wi-settings-list" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {/* Setting 1: Autonomous Execution */}
                      <div
                        className="wi-setting-item"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "11px 14px",
                          background: "#F8FAFD",
                          borderRadius: "10px",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        <div className="wi-setting-details">
                          <span
                            className="wi-setting-title"
                            style={{
                              fontSize: "12.5px",
                              fontWeight: 700,
                              color: "var(--brand-navy)",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            Autonomous Execution Engine
                            <span
                              className="wi-setting-info-badge"
                              style={{
                                fontSize: "10px",
                                color: "var(--brand-accent)",
                                background: "#EFF6FF",
                                padding: "1px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              Details ℹ
                            </span>
                          </span>
                          <span
                            className="wi-setting-sub"
                            style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginTop: "2px" }}
                          >
                            Allow background agents to draft, evaluate, and schedule content.
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.autonomousMode}
                          onChange={(e) =>
                            setSettings({ ...settings, autonomousMode: e.target.checked })
                          }
                          style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#2563EB" }}
                        />
                      </div>

                      {/* Setting 2: Social Safe Mode Gate */}
                      <div
                        className="wi-setting-item"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "11px 14px",
                          background: "#F8FAFD",
                          borderRadius: "10px",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        <div className="wi-setting-details">
                          <span
                            className="wi-setting-title"
                            style={{
                              fontSize: "12.5px",
                              fontWeight: 700,
                              color: "var(--brand-navy)",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            Social Safe Mode Gate
                            <span
                              className="wi-setting-info-badge"
                              style={{
                                fontSize: "10px",
                                color: "var(--brand-accent)",
                                background: "#EFF6FF",
                                padding: "1px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              Details ℹ
                            </span>
                          </span>
                          <span
                            className="wi-setting-sub"
                            style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginTop: "2px" }}
                          >
                            Enforce mandatory human review before publishing to live accounts.
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.safeModeSocial}
                          onChange={(e) =>
                            setSettings({ ...settings, safeModeSocial: e.target.checked })
                          }
                          style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#2563EB" }}
                        />
                      </div>

                      {/* Setting 3: Telemetry Retention Window */}
                      <div
                        className="wi-setting-item"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "11px 14px",
                          background: "#F8FAFD",
                          borderRadius: "10px",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        <div className="wi-setting-details">
                          <span
                            className="wi-setting-title"
                            style={{
                              fontSize: "12.5px",
                              fontWeight: 700,
                              color: "var(--brand-navy)",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            Telemetry Retention Window
                            <span
                              className="wi-setting-info-badge"
                              style={{
                                fontSize: "10px",
                                color: "var(--brand-accent)",
                                background: "#EFF6FF",
                                padding: "1px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              Details ℹ
                            </span>
                          </span>
                          <span
                            className="wi-setting-sub"
                            style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginTop: "2px" }}
                          >
                            Preserve attribution and conversion telemetry data.
                          </span>
                        </div>
                        <select
                          className="form-select wi-role-select"
                          value={settings.retentionDays}
                          onChange={(e) =>
                            setSettings({ ...settings, retentionDays: e.target.value })
                          }
                          style={{
                            padding: "5px 12px",
                            fontSize: "11.5px",
                            fontWeight: 700,
                            borderRadius: "8px",
                            border: "1px solid #CBD5E1",
                            background: "#fff",
                            cursor: "pointer",
                            outline: "none",
                          }}
                        >
                          <option value="90 Days">90 Days (Recommended)</option>
                          <option value="180 Days">180 Days</option>
                          <option value="365 Days">365 Days</option>
                        </select>
                      </div>

                      {/* Setting 4: Telemetry Anonymization & PII Masking */}
                      <div
                        className="wi-setting-item"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "11px 14px",
                          background: "#F8FAFD",
                          borderRadius: "10px",
                          border: "1px solid var(--border-light)",
                        }}
                      >
                        <div className="wi-setting-details">
                          <span
                            className="wi-setting-title"
                            style={{
                              fontSize: "12.5px",
                              fontWeight: 700,
                              color: "var(--brand-navy)",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            Telemetry Anonymization &amp; PII Scrubbing
                            <span
                              className="wi-setting-info-badge"
                              style={{
                                fontSize: "10px",
                                color: "var(--brand-accent)",
                                background: "#EFF6FF",
                                padding: "1px 6px",
                                borderRadius: "4px",
                              }}
                            >
                              Details ℹ
                            </span>
                          </span>
                          <span
                            className="wi-setting-sub"
                            style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginTop: "2px" }}
                          >
                            Anonymize user-identifiable data in prompt logs and external calls.
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.telemetryAnonymization}
                          onChange={(e) =>
                            setSettings({
                              ...settings,
                              telemetryAnonymization: e.target.checked,
                            })
                          }
                          style={{ width: "18px", height: "18px", cursor: "pointer", accentColor: "#2563EB" }}
                        />
                      </div>
                    </div>

                    {/* Operational System Health & Sync Card (Balances Row 2) */}
                    <div
                      style={{
                        padding: "12px 14px",
                        background: "linear-gradient(135deg, #ECFDF5 0%, #EFF6FF 100%)",
                        borderRadius: "10px",
                        border: "1px solid #A7F3D0",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span className="wi-status-dot" style={{ width: "8px", height: "8px" }} />
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#065F46" }}>
                            PostgreSQL v2.4 Engine Active • 100% Nominal
                          </div>
                          <div style={{ fontSize: "10.5px", color: "#047857" }}>
                            Tenant isolation: {profile.slug} • AES-256 encryption at rest
                          </div>
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "999px",
                          background: "#D1FAE5",
                          color: "#065F46",
                        }}
                      >
                        Healthy
                      </span>
                    </div>
                  </div>
                </div>

                {/* ── CARD 5: Brand Voice & Directives (Row 3 Full Width - 2 Column Layout) ── */}
                <div className="wi-card accent-pink wi-card-brand-voice" id="wiBrandVoiceCard">
                  <div className="wi-card-header">
                    <div className="wi-card-title-group">
                      <div className="wi-card-icon pink">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                        >
                          <path d="M12 19l7-7 3 3-7 7-3-3z" />
                          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                          <path d="M2 2l7.586 7.586" />
                          <circle cx="11" cy="11" r="2" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="wi-card-title">Brand Voice &amp; Directives</h2>
                        <p className="wi-card-subtitle">
                          Tone profiles, language preferences, and editorial guardrails
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsBrandVoiceModalOpen(true)}
                      className="btn btn-sm btn-ghost"
                    >
                      Configure Voice
                    </button>
                  </div>

                  <div className="wi-card-body">
                    {/* 2-Column Layout: Left Tones, Right Directives & Languages */}
                    <div className="wi-bv-two-col">
                      {/* Left Column: Tone of Voice Profiles (4 Configured) */}
                      <div className="wi-bv-group">
                        <div className="wi-bv-group-header">
                          <span className="wi-bv-group-title">Tone of Voice Profiles</span>
                          <span className="wi-bv-count-badge">4 Configured</span>
                        </div>
                        <div className="wi-tone-grid">
                          {tones.map((t, idx) => {
                            const toneThemes = [
                              {
                                id: "indigo",
                                cardClass: "wi-tone-indigo",
                                iconBg: "#EEF2FF",
                                iconColor: "#4F46E5",
                                badgeColor: "#3730A3",
                                badgeBg: "#EEF2FF",
                                badgeBorder: "#C7D2FE",
                                barFrom: "#818CF8",
                                barTo: "#4F46E5",
                                iconSvg: (
                                  <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
                                ),
                              },
                              {
                                id: "violet",
                                cardClass: "wi-tone-violet",
                                iconBg: "#F5F3FF",
                                iconColor: "#7C3AED",
                                badgeColor: "#6D28D9",
                                badgeBg: "#F5F3FF",
                                badgeBorder: "#DDD6FE",
                                barFrom: "#A78BFA",
                                barTo: "#7C3AED",
                                iconSvg: (
                                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                                ),
                              },
                              {
                                id: "rose",
                                cardClass: "wi-tone-rose",
                                iconBg: "#FFF1F2",
                                iconColor: "#BE123C",
                                badgeColor: "#9F1239",
                                badgeBg: "#FFF1F2",
                                badgeBorder: "#FECDD3",
                                barFrom: "#FB7185",
                                barTo: "#E11D48",
                                iconSvg: (
                                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                ),
                              },
                              {
                                id: "amber",
                                cardClass: "wi-tone-amber",
                                iconBg: "#FFFBEB",
                                iconColor: "#B45309",
                                badgeColor: "#92400E",
                                badgeBg: "#FFFBEB",
                                badgeBorder: "#FDE68A",
                                barFrom: "#FCD34D",
                                barTo: "#D97706",
                                iconSvg: (
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                ),
                              },
                            ];
                            const theme = toneThemes[idx % toneThemes.length];
                            const pctVal = parseInt(t.weight, 10) || 75;
                            return (
                              <div
                                key={idx}
                                className={`wi-tone-card ${theme.cardClass}`}
                                title={`Tone weight: ${t.weight}`}
                              >
                                <div className="wi-tone-card-top">
                                  <div className="wi-tone-info">
                                    <span
                                      className="wi-tone-icon"
                                      style={{
                                        background: theme.iconBg,
                                        color: theme.iconColor,
                                      }}
                                    >
                                      <svg
                                        width="13"
                                        height="13"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                      >
                                        {theme.iconSvg}
                                      </svg>
                                    </span>
                                    <span className="wi-tone-label">{t.label}</span>
                                  </div>
                                  <span
                                    className="wi-tone-badge"
                                    style={{
                                      color: theme.badgeColor,
                                      background: theme.badgeBg,
                                      borderColor: theme.badgeBorder,
                                    }}
                                  >
                                    {t.weight}
                                  </span>
                                </div>
                                <div className="wi-tone-progress-bg">
                                  <div
                                    className="wi-tone-progress-fill"
                                    style={{
                                      width: `${pctVal}%`,
                                      background: `linear-gradient(90deg, ${theme.barFrom}, ${theme.barTo})`,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Right Column: Editorial Directives (Top) & Operating Languages (Bottom) */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {/* 1. Editorial Directives & Guardrails */}
                        <div className="wi-bv-group">
                          <div className="wi-bv-group-header">
                            <span className="wi-bv-group-title">
                              Editorial Directives &amp; Guardrails
                            </span>
                            <span className="wi-bv-count-badge">4 Enforced</span>
                          </div>
                          <div className="wi-directives-wrap">
                            <div className="wi-directive-pill rule">
                              <span className="wi-directive-check">
                                <svg
                                  width="9"
                                  height="9"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3.5"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                              <span className="wi-directive-label">
                                Zero generic hype or salesy clichés
                              </span>
                            </div>

                            <div className="wi-directive-pill rule">
                              <span className="wi-directive-check">
                                <svg
                                  width="9"
                                  height="9"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3.5"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                              <span className="wi-directive-label">
                                Verify Wi-Fi speeds (&gt;50 Mbps)
                              </span>
                            </div>

                            <div className="wi-directive-pill rule">
                              <span className="wi-directive-check">
                                <svg
                                  width="9"
                                  height="9"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3.5"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                              <span className="wi-directive-label">
                                Highlight architectural &amp; craft details
                              </span>
                            </div>

                            <div className="wi-directive-pill eco">
                              <span className="wi-directive-check">
                                <svg
                                  width="9"
                                  height="9"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3.5"
                                >
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              </span>
                              <span className="wi-directive-label">
                                Eco-certified property priority
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Subtle Divider */}
                        <div style={{ height: "1px", background: "#E2E8F0" }} />

                        {/* 2. Operating Languages (Placed directly UNDER Editorial Directives!) */}
                        <div className="wi-bv-group">
                          <div className="wi-bv-group-header">
                            <span className="wi-bv-group-title">Operating Languages</span>
                            <span className="wi-bv-count-badge">2 Active</span>
                          </div>
                          <div className="wi-lang-grid">
                            <div className="wi-lang-card wi-lang-primary">
                              <div className="wi-lang-icon-wrap">
                                <span className="wi-lang-globe">
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                  >
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="2" y1="12" x2="22" y2="12" />
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                  </svg>
                                </span>
                              </div>
                              <div className="wi-lang-body">
                                <span className="wi-lang-text">English</span>
                                <span className="wi-lang-sub">US Primary</span>
                              </div>
                              <span className="wi-lang-pill wi-lang-pill-primary">
                                Primary
                              </span>
                            </div>

                            <div className="wi-lang-card wi-lang-localization">
                              <div className="wi-lang-icon-wrap">
                                <span className="wi-lang-globe">
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                  >
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="2" y1="12" x2="22" y2="12" />
                                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                                  </svg>
                                </span>
                              </div>
                              <div className="wi-lang-body">
                                <span className="wi-lang-text">Vietnamese</span>
                                <span className="wi-lang-sub">Localization</span>
                              </div>
                              <span className="wi-lang-pill wi-lang-pill-loc">
                                Localization
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. TAB 2: CONNECTED INTEGRATIONS HUB */}
          {currentSubTab === "integrations" && (
            <div className="wi-integrations-layout">
              {/* Summary Strip */}
              <div
                className="wi-summary-strip"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: "14px",
                  padding: "16px 20px",
                  background: "#FFFFFF",
                  border: "1px solid var(--border)",
                  borderRadius: "14px",
                }}
              >
                <div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>
                    TOTAL INTEGRATIONS
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--brand-navy)" }}>
                    {integrations.length} Services
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>
                    ACTIVE &amp; SYNCING
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "#047857" }}>
                    {integrations.filter((i) => i.status === "connected").length} Live Feeds
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>
                    ACTION REQUIRED
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "#B45309" }}>
                    {integrations.filter((i) => i.status === "attention").length} OAuth Refresh
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "var(--text-secondary)", fontWeight: 700 }}>
                    INGESTION LATENCY
                  </div>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--brand-accent)" }}>
                    380ms Avg
                  </div>
                </div>
              </div>

              {/* Filter and Search Bar */}
              <div className="wi-filter-bar">
                <div className="wi-search-box">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#64748B"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={integrationSearch}
                    onChange={(e) => setIntegrationSearch(e.target.value)}
                    placeholder={
                      language === "vi"
                        ? "Lọc theo tên dịch vụ, tài khoản hoặc tính năng..."
                        : "Filter by service name, account, or feature..."
                    }
                  />
                </div>

                <div className="wi-category-pills">
                  {[
                    { id: "all", label: "All Feeds (6)" },
                    { id: "analytics", label: "Analytics & Search (2)" },
                    { id: "social", label: "Social & Distribution (2)" },
                    { id: "cms", label: "CMS & Webhooks (1)" },
                    { id: "ai", label: "AI Engines (1)" },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setIntegrationFilter(cat.id)}
                      className={`wi-cat-btn ${
                        integrationFilter === cat.id ? "active" : ""
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Integrations Grid */}
              <div className="wi-integrations-grid">
                {filteredIntegrations.map((item) => (
                  <div key={item.id} className="wi-int-card">
                    <div className="wi-int-card-header">
                      <div className="wi-int-header-left">
                        <div className="wi-int-icon-box">
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                          </svg>
                        </div>
                        <div>
                          <h3 className="wi-int-name">{item.name}</h3>
                          <span className="wi-int-category">
                            {item.categoryLabel}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`wi-int-badge ${
                          item.status === "connected"
                            ? "status-connected"
                            : "status-attention"
                        }`}
                      >
                        {item.statusLabel}
                      </span>
                    </div>

                    <p className="wi-int-desc">{item.description}</p>

                    <div className="wi-int-meta">
                      <div className="wi-int-account">
                        <span className="wi-meta-label">Account / Resource:</span>
                        <span className="wi-int-acc-val">{item.account}</span>
                      </div>
                      <div className="wi-int-sync">
                        <span className="wi-meta-label">Last Synchronization:</span>
                        <span>{item.lastSync}</span>
                      </div>
                    </div>

                    <div className="wi-int-actions">
                      <button
                        type="button"
                        onClick={() =>
                          showToast(
                            language === "vi"
                              ? `Đang gửi tín hiệu kiểm tra (ping) tới ${item.name}... Phản hồi 200 OK.`
                              : `Ping signal sent to ${item.name}... Response 200 OK.`
                          )
                        }
                        className="btn btn-secondary btn-sm"
                      >
                        Test Ping
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleIntegration(item.id)}
                        className={`btn btn-sm ${
                          item.status === "connected"
                            ? "btn-secondary"
                            : "btn-primary"
                        }`}
                      >
                        {item.status === "connected" ? "Manage API" : "Reconnect"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── MODAL: EDIT WORKSPACE OVERVIEW ── */}
      {isEditModalOpen && (
        <div
          className="modal-overlay active"
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(16, 47, 112, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditModalOpen(false);
          }}
        >
          <div
            className="modal-content"
            style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 40px rgba(16, 47, 112, 0.2)",
              border: "1px solid #DCE6F5",
            }}
          >
            <div
              className="modal-header"
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #DCE6F5",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ fontSize: "17px", fontWeight: 800, margin: 0, color: "var(--brand-navy)" }}>
                Edit Workspace Overview
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "22px",
                  color: "#64748B",
                  cursor: "pointer",
                }}
              >
                &times;
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setIsEditModalOpen(false);
                showToast("Workspace profile updated successfully!");
              }}
            >
              <div
                className="modal-body"
                style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}
              >
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "5px" }}>
                    Workspace Brand Name *
                  </label>
                  <input
                    type="text"
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    required
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      fontSize: "13px",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "5px" }}>
                    Primary Domain / Website
                  </label>
                  <input
                    type="url"
                    value={profile.website}
                    onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      fontSize: "13px",
                    }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "5px" }}>
                      Industry
                    </label>
                    <input
                      type="text"
                      value={profile.industry}
                      onChange={(e) => setProfile({ ...profile, industry: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: "8px",
                        border: "1px solid #CBD5E1",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "5px" }}>
                      Target Geographies
                    </label>
                    <input
                      type="text"
                      value={profile.targetMarkets}
                      onChange={(e) => setProfile({ ...profile, targetMarkets: e.target.value })}
                      style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: "8px",
                        border: "1px solid #CBD5E1",
                        fontSize: "13px",
                      }}
                    />
                  </div>
                </div>
              </div>
              <div
                className="modal-footer"
                style={{
                  padding: "16px 24px",
                  borderTop: "1px solid #DCE6F5",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  background: "#F8FAFC",
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Overview
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: INVITE MEMBER ── */}
      {isInviteModalOpen && (
        <div
          className="modal-overlay active"
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(16, 47, 112, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsInviteModalOpen(false);
          }}
        >
          <div
            className="modal-content"
            style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "480px",
              boxShadow: "0 20px 40px rgba(16, 47, 112, 0.2)",
              border: "1px solid #DCE6F5",
            }}
          >
            <div
              className="modal-header"
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #DCE6F5",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ fontSize: "17px", fontWeight: 800, margin: 0, color: "var(--brand-navy)" }}>
                Invite Team Member
              </h3>
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "22px",
                  color: "#64748B",
                  cursor: "pointer",
                }}
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleInviteSubmit}>
              <div
                className="modal-body"
                style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}
              >
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "5px" }}>
                    Work Email Address *
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    placeholder="e.g. colleague@tripc.ai"
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      fontSize: "13px",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "5px" }}>
                    Assigned Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "Editor" | "Viewer")}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid #CBD5E1",
                      fontSize: "13px",
                      background: "#fff",
                    }}
                  >
                    <option value="Editor">Editor (Can review &amp; edit drafts)</option>
                    <option value="Viewer">Viewer (Read-only analytics access)</option>
                  </select>
                </div>
              </div>
              <div
                className="modal-footer"
                style={{
                  padding: "16px 24px",
                  borderTop: "1px solid #DCE6F5",
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "10px",
                  background: "#F8FAFC",
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsInviteModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: CONFIGURE BRAND VOICE ── */}
      {isBrandVoiceModalOpen && (
        <div
          className="modal-overlay active"
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(16, 47, 112, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsBrandVoiceModalOpen(false);
          }}
        >
          <div
            className="modal-content"
            style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 40px rgba(16, 47, 112, 0.2)",
              border: "1px solid #DCE6F5",
            }}
          >
            <div
              className="modal-header"
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #DCE6F5",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3 style={{ fontSize: "17px", fontWeight: 800, margin: 0, color: "var(--brand-navy)" }}>
                Configure Brand Voice &amp; Guardrails
              </h3>
              <button
                type="button"
                onClick={() => setIsBrandVoiceModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "22px",
                  color: "#64748B",
                  cursor: "pointer",
                }}
              >
                &times;
              </button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginBottom: "14px" }}>
                Brand tones and guardrails are injected into every background LLM prompt to preserve consistent editorial voice across all channels.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                <span className="wi-directive-pill rule">✓ Zero generic hype</span>
                <span className="wi-directive-pill rule">✓ Verify Wi-Fi speeds</span>
                <span className="wi-directive-pill rule">✓ Architectural details</span>
                <span className="wi-directive-pill eco">✓ Eco-certified priority</span>
              </div>
            </div>
            <div
              className="modal-footer"
              style={{
                padding: "16px 24px",
                borderTop: "1px solid #DCE6F5",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                background: "#F8FAFC",
              }}
            >
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setIsBrandVoiceModalOpen(false);
                  showToast("Brand voice weights calibrated successfully!");
                }}
              >
                Close &amp; Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: VIEW DETAILS ── */}
      {detailsModal && (
        <div
          className="modal-overlay active"
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(16, 47, 112, 0.45)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailsModal(null);
          }}
        >
          <div
            className="modal-content"
            style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 40px rgba(16, 47, 112, 0.2)",
              border: "1px solid #DCE6F5",
            }}
          >
            <div
              className="modal-header"
              style={{
                padding: "20px 24px",
                borderBottom: "1px solid #DCE6F5",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div>
                <h3 style={{ fontSize: "17px", fontWeight: 800, margin: 0, color: "var(--brand-navy)" }}>
                  {detailsModal.title}
                </h3>
                <span style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px", display: "block" }}>
                  {detailsModal.subtitle}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailsModal(null)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "22px",
                  color: "#64748B",
                  cursor: "pointer",
                }}
              >
                &times;
              </button>
            </div>
            <div
              className="modal-body"
              style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "10px" }}
            >
              {detailsModal.items.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: "10px 14px",
                    background: "#F8FAFD",
                    borderRadius: "8px",
                    border: "1px solid #E2E8F0",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "12px",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "var(--text-secondary)" }}>{item.label}</span>
                  <span style={{ fontWeight: 700, color: "var(--brand-navy)", textAlign: "right" }}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
            <div
              className="modal-footer"
              style={{
                padding: "16px 24px",
                borderTop: "1px solid #DCE6F5",
                display: "flex",
                justifyContent: "flex-end",
                background: "#F8FAFC",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDetailsModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
