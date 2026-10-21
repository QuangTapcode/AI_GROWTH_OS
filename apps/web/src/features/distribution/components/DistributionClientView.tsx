"use client";

import React, { useState } from "react";
import DashboardSidebar, {
  DEFAULT_WORKSPACES,
  type WorkspaceItem,
} from "@/features/dashboard/components/DashboardSidebar";
import DashboardHeader from "@/features/dashboard/components/DashboardHeader";
import {
  MOCK_CHANNELS,
  MOCK_PIPELINE_STAGES,
  MOCK_TASKS,
} from "../data/distributionMockData";
import { ChannelEndpoint, PipelineStageInfo, SyndicationTask } from "../types";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function DistributionClientView() {
  const { language, t } = useLanguage();
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceItem>(
    DEFAULT_WORKSPACES[0]
  );
  const [activeTab, setActiveTab] = useState("distribution");

  // State
  const [channels, setChannels] = useState<ChannelEndpoint[]>(MOCK_CHANNELS);
  const [stages] = useState<PipelineStageInfo[]>(MOCK_PIPELINE_STAGES);
  const [selectedStage, setSelectedStage] = useState<PipelineStageInfo>(
    MOCK_PIPELINE_STAGES[2] // Channel Auth
  );
  const [tasks, setTasks] = useState<SyndicationTask[]>(MOCK_TASKS);
  const [taskFilter, setTaskFilter] = useState<string>("all");
  const [taskSearch, setTaskSearch] = useState<string>("");
  const [killSwitchEngaged, setKillSwitchEngaged] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{
    title: string;
    msg: string;
    type: "success" | "warning" | "info";
  } | null>(null);

  // Modals state
  const [reconnectModalChannel, setReconnectModalChannel] =
    useState<ChannelEndpoint | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedTaskDetail, setSelectedTaskDetail] =
    useState<SyndicationTask | null>(null);

  const showToast = (
    title: string,
    msg: string,
    type: "success" | "warning" | "info" = "success"
  ) => {
    setToastMessage({ title, msg, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const toggleKillSwitch = () => {
    const next = !killSwitchEngaged;
    setKillSwitchEngaged(next);
    if (next) {
      showToast(
        language === "vi" ? "Ngắt khẩn cấp đã bật" : "Emergency Kill-Switch Engaged",
        language === "vi"
          ? "Đã tạm dừng toàn bộ các tiến trình xuất bản tự động trên hệ thống."
          : "All autonomous syndication dispatches have been paused.",
        "warning"
      );
    } else {
      showToast(
        language === "vi" ? "Ngắt khẩn cấp đã tắt" : "Emergency Kill-Switch Disengaged",
        language === "vi"
          ? "Hệ thống tiếp tục thực thi các tiến trình xuất bản theo lịch trình."
          : "Normal scheduled syndication operations have resumed.",
        "success"
      );
    }
  };

  const handleAuditFleet = () => {
    setIsAuditModalOpen(true);
  };

  const handleReconnectSubmit = () => {
    if (reconnectModalChannel) {
      setChannels((prev) =>
        prev.map((c) =>
          c.id === reconnectModalChannel.id
            ? {
                ...c,
                status: "connected",
                statusLabel: "Connected",
                healthMeta: "OAuth 2.0 Token renewed successfully",
                tokenExpiry: "Expires in 60 days",
                error: null,
              }
            : c
        )
      );
      showToast(
        language === "vi" ? "Đã kết nối lại kênh" : "Channel Reconnected",
        language === "vi"
          ? `Đã làm mới mã ủy quyền OAuth cho ${reconnectModalChannel.name}.`
          : `OAuth token refreshed for ${reconnectModalChannel.name}.`,
        "success"
      );
      setReconnectModalChannel(null);
    }
  };

  const filteredTasks = tasks.filter((task) => {
    if (taskFilter === "scheduled" && task.status !== "scheduled") return false;
    if (taskFilter === "in_flight" && task.status !== "in_flight") return false;
    if (taskFilter === "failed" && task.status !== "failed") return false;
    if (taskFilter === "completed" && task.status !== "completed") return false;
    if (
      taskSearch &&
      !task.title.toLowerCase().includes(taskSearch.toLowerCase()) &&
      !task.id.toLowerCase().includes(taskSearch.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const attentionChannels = channels.filter((c) => c.status === "attention");

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`toast-notification active ${
            toastMessage.type === "warning" ? "toast-warning" : "toast-success"
          }`}
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            background: toastMessage.type === "warning" ? "#FFFBEB" : "#ECFDF5",
            border: `1px solid ${
              toastMessage.type === "warning" ? "#FDE68A" : "#A7F3D0"
            }`,
            color: toastMessage.type === "warning" ? "#92400E" : "#065F46",
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
          currentPageTitle="Distribution"
          searchPlaceholder={
            language === "vi"
              ? "Tìm kiếm tác vụ phân phối, kênh xuất bản..."
              : "Search syndication jobs, post IDs..."
          }
        />

        <main className="content-body">
          {/* 1. CONTROL CENTER HEADER */}
          <div className="dct-header-row">
            <div className="dct-header-left">
              <div className="dct-eyebrow">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                {t.distribution.eyebrow}
              </div>
              <h1 className="dct-title">{t.distribution.pageTitle}</h1>
              <p className="dct-subtitle">{t.distribution.subtitle}</p>
            </div>

            <div className="dct-header-controls">
              {/* System State Badge */}
              <div
                className={`dct-system-badge ${
                  attentionChannels.length > 0 ? "attention" : "nominal"
                }`}
                style={{
                  padding: "6px 12px",
                  borderRadius: "9999px",
                  fontSize: "12px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background:
                    attentionChannels.length > 0 ? "#FFF1F2" : "#ECFDF5",
                  color: attentionChannels.length > 0 ? "#BE123C" : "#065F46",
                  border: `1px solid ${
                    attentionChannels.length > 0 ? "#FECDD3" : "#A7F3D0"
                  }`,
                }}
              >
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background:
                      attentionChannels.length > 0 ? "#E11D48" : "#10B981",
                  }}
                />
                <span>
                  {attentionChannels.length > 0
                    ? `${attentionChannels.length} ${t.distribution.attentionRequired}`
                    : t.distribution.allOperational}
                </span>
              </div>

              {/* Emergency Kill-Switch Toggle */}
              <button
                type="button"
                onClick={toggleKillSwitch}
                className={`btn ${
                  killSwitchEngaged ? "btn-danger" : "btn-secondary"
                }`}
                style={{
                  border: killSwitchEngaged
                    ? "1px solid #E11D48"
                    : "1px solid var(--border)",
                  background: killSwitchEngaged ? "#FFF1F2" : "var(--surface)",
                  color: killSwitchEngaged ? "#BE123C" : "var(--text-primary)",
                  cursor: "pointer",
                }}
                title="Emergency Administrative Circuit Breaker"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <span>
                  {killSwitchEngaged
                    ? t.distribution.killSwitchEngaged
                    : t.distribution.killSwitchDisengaged}
                </span>
              </button>

              {/* Audit Endpoints Button */}
              <button
                type="button"
                onClick={handleAuditFleet}
                className="btn btn-secondary"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
                {t.distribution.auditEndpoints}
              </button>
            </div>
          </div>

          {/* 2. UNIFIED PANEL: PUBLISHING PIPELINE & EXECUTION QUEUE */}
          <div className="dct-unified-pipeline-card">
            {/* Header */}
            <div className="dct-pipeline-header">
              <div className="dct-pipeline-title-group">
                <h2 className="dct-pipeline-title">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                  >
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  {t.distribution.pipelineTitle}
                </h2>
                <p className="dct-pipeline-subtitle">
                  {t.distribution.pipelineSubtitle}
                </p>
              </div>

              <div
                className="dct-pipeline-active-job"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                }}
              >
                <span>{t.distribution.activeWorker}</span>
                <strong style={{ color: "var(--brand-accent)" }}>
                  {selectedStage.workerName}
                </strong>
                <span>•</span>
                <span>{selectedStage.workerRole}</span>
              </div>
            </div>

            {/* 7-Stage Horizontal Pipeline Track */}
            <div
              className="dct-pipeline-track"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: "8px",
                marginTop: "16px",
                overflowX: "auto",
              }}
            >
              {stages.map((stage) => {
                const isSelected = selectedStage.id === stage.id;
                return (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => setSelectedStage(stage)}
                    style={{
                      padding: "12px 10px",
                      borderRadius: "10px",
                      textAlign: "left",
                      cursor: "pointer",
                      border: isSelected
                        ? "2px solid var(--brand-accent)"
                        : "1px solid var(--border)",
                      background: isSelected
                        ? "#EFF6FF"
                        : "var(--surface-subtle)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "10px",
                        fontWeight: 700,
                        color: isSelected
                          ? "var(--brand-accent)"
                          : "var(--text-secondary)",
                      }}
                    >
                      <span>STAGE {stage.id}</span>
                      <span
                        style={{
                          background: isSelected ? "#BFDBFE" : "#E2E8F0",
                          color: isSelected ? "#1D4ED8" : "#475569",
                          padding: "1px 6px",
                          borderRadius: "999px",
                        }}
                      >
                        {stage.count}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        marginTop: "4px",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {stage.name.replace(/^\d+\.\s*/, "")}
                    </div>
                    <div
                      style={{
                        fontSize: "10.5px",
                        color:
                          stage.status === "completed"
                            ? "#047857"
                            : stage.status === "active"
                            ? "#2563EB"
                            : "#64748B",
                        marginTop: "2px",
                      }}
                    >
                      {stage.status === "completed"
                        ? "✓ Verified"
                        : stage.status === "active"
                        ? "● In Progress"
                        : "○ Queued"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Contextual Stage Ribbon */}
            <div
              className="dct-stage-detail-ribbon"
              style={{
                marginTop: "16px",
                padding: "12px 16px",
                background: "#F8FAFC",
                borderRadius: "8px",
                border: "1px solid var(--border)",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                fontSize: "12px",
              }}
            >
              <div>
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                  {selectedStage.name}:
                </span>{" "}
                <span style={{ color: "var(--text-secondary)" }}>
                  {selectedStage.description}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "#047857",
                  fontWeight: 600,
                  fontSize: "11px",
                }}
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>{selectedStage.validationGate}</span>
              </div>
            </div>

            {/* Internal Divider */}
            <div
              style={{
                height: "1px",
                background: "var(--border)",
                margin: "24px 0",
              }}
            />

            {/* Task Execution Schedule Area */}
            <div className="dct-tasks-inner">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <div>
                  <h3
                    style={{
                      fontSize: "15px",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
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
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                      <polyline points="10 9 9 9 8 9" />
                    </svg>
                    {t.distribution.tasksTitle}
                  </h3>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "var(--text-secondary)",
                      marginTop: "2px",
                    }}
                  >
                    {t.distribution.tasksSubtitle}
                  </p>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  {/* Search Input */}
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      value={taskSearch}
                      onChange={(e) => setTaskSearch(e.target.value)}
                      placeholder={
                        language === "vi" ? "Lọc tác vụ..." : "Filter tasks..."
                      }
                      style={{
                        padding: "6px 10px 6px 30px",
                        fontSize: "12px",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        background: "var(--surface)",
                        outline: "none",
                        width: "160px",
                      }}
                    />
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      style={{
                        position: "absolute",
                        left: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--text-muted)",
                      }}
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </div>

                  {/* Filter Pills */}
                  <div
                    style={{
                      display: "flex",
                      gap: "4px",
                      background: "var(--surface-subtle)",
                      padding: "3px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {[
                      { id: "all", label: language === "vi" ? "Tất cả" : "All" },
                      {
                        id: "scheduled",
                        label: language === "vi" ? "Đã lên lịch" : "Scheduled",
                      },
                      {
                        id: "in_flight",
                        label: language === "vi" ? "Đang xử lý" : "In-Flight",
                      },
                      {
                        id: "failed",
                        label: language === "vi" ? "Cần chú ý" : "Attention",
                      },
                      {
                        id: "completed",
                        label: language === "vi" ? "Hoàn thành" : "Completed",
                      },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setTaskFilter(tab.id)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "6px",
                          fontSize: "11px",
                          fontWeight: 600,
                          cursor: "pointer",
                          border: "none",
                          background:
                            taskFilter === tab.id ? "#FFFFFF" : "transparent",
                          color:
                            taskFilter === tab.id
                              ? "var(--brand-accent)"
                              : "var(--text-secondary)",
                          boxShadow:
                            taskFilter === tab.id
                              ? "0 1px 3px rgba(0,0,0,0.08)"
                              : "none",
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* New Schedule Button */}
                  <button
                    type="button"
                    onClick={() => setIsScheduleModalOpen(true)}
                    className="btn btn-primary btn-sm"
                  >
                    {t.distribution.schedulePost}
                  </button>
                </div>
              </div>

              {/* Tasks Table */}
              <div
                style={{
                  overflowX: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  background: "var(--surface)",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "12px",
                    textAlign: "left",
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        background: "var(--surface-subtle)",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                        fontWeight: 600,
                      }}
                    >
                      <th style={{ padding: "10px 14px" }}>TASK ID &amp; TITLE</th>
                      <th style={{ padding: "10px 14px" }}>TARGET CHANNEL</th>
                      <th style={{ padding: "10px 14px" }}>DISPATCH SCHEDULE</th>
                      <th style={{ padding: "10px 14px" }}>ASSIGNED AGENT</th>
                      <th style={{ padding: "10px 14px" }}>STATUS</th>
                      <th style={{ padding: "10px 14px", textAlign: "right" }}>
                        ACTIONS
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            padding: "32px",
                            textAlign: "center",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {language === "vi"
                            ? "Không có tác vụ xuất bản nào phù hợp với bộ lọc."
                            : "No syndication tasks match the current filter."}
                        </td>
                      </tr>
                    ) : (
                      filteredTasks.map((task) => (
                        <tr
                          key={task.id}
                          style={{
                            borderBottom: "1px solid var(--border-light)",
                            transition: "background 0.15s ease",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "var(--surface-hover)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          <td style={{ padding: "12px 14px" }}>
                            <div
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontSize: "11px",
                                color: "var(--brand-accent)",
                                fontWeight: 700,
                              }}
                            >
                              {task.id}
                            </div>
                            <div
                              style={{
                                fontWeight: 600,
                                color: "var(--text-primary)",
                                marginTop: "2px",
                              }}
                            >
                              {task.title}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              {task.payloadTitle}
                            </div>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "3px 8px",
                                borderRadius: "6px",
                                background: "#F1F5F9",
                                fontSize: "11px",
                                fontWeight: 600,
                              }}
                            >
                              <span>{task.channelName}</span>
                            </div>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ color: "var(--text-primary)" }}>
                              {task.scheduledTime}
                            </div>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "var(--text-secondary)",
                              }}
                            >
                              Est. {task.estimatedReach}
                            </div>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span
                              style={{
                                padding: "2px 8px",
                                borderRadius: "4px",
                                background: "#EFF6FF",
                                color: "#1D4ED8",
                                fontSize: "11px",
                                fontWeight: 600,
                              }}
                            >
                              {task.agent}
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px" }}>
                            <span
                              style={{
                                padding: "3px 8px",
                                borderRadius: "999px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background:
                                  task.status === "completed"
                                    ? "#ECFDF5"
                                    : task.status === "in_flight"
                                    ? "#EFF6FF"
                                    : task.status === "failed"
                                    ? "#FFF1F2"
                                    : "#FFFBEB",
                                color:
                                  task.status === "completed"
                                    ? "#047857"
                                    : task.status === "in_flight"
                                    ? "#1D4ED8"
                                    : task.status === "failed"
                                    ? "#E11D48"
                                    : "#B45309",
                              }}
                            >
                              {task.statusLabel}
                            </span>
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "right" }}>
                            <button
                              type="button"
                              onClick={() => setSelectedTaskDetail(task)}
                              className="btn btn-secondary btn-sm"
                            >
                              {language === "vi" ? "Chi tiết" : "Inspect"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* 3. CHANNEL FLEET & CREDENTIAL SENTINEL */}
          <div style={{ marginTop: "16px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: "17px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                  }}
                >
                  {t.distribution.endpointsTitle}
                </h3>
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    marginTop: "2px",
                  }}
                >
                  {t.distribution.endpointsSubtitle}
                </p>
              </div>

              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  display: "flex",
                  gap: "12px",
                }}
              >
                <span>
                  <strong>6</strong> Total Connected Endpoints
                </span>
                <span>•</span>
                <span style={{ color: "#047857" }}>
                  <strong>5</strong> Nominal
                </span>
                <span>•</span>
                <span style={{ color: "#E11D48" }}>
                  <strong>1</strong> Needs Token Renewal
                </span>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: "16px",
              }}
            >
              {channels.map((channel) => (
                <div
                  key={channel.id}
                  style={{
                    background: "var(--surface)",
                    borderRadius: "12px",
                    border:
                      channel.status === "attention"
                        ? "1px solid #FECDD3"
                        : "1px solid var(--border)",
                    boxShadow: "var(--shadow-card)",
                    padding: "18px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: "14px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <div
                          style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "10px",
                            background: `${channel.color}15`,
                            color: channel.color,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "16px",
                            fontWeight: 700,
                          }}
                        >
                          {channel.name.charAt(0)}
                        </div>
                        <div>
                          <h4
                            style={{
                              fontSize: "14px",
                              fontWeight: 700,
                              color: "var(--text-primary)",
                            }}
                          >
                            {channel.name}
                          </h4>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {channel.handle}
                          </div>
                        </div>
                      </div>

                      <span
                        style={{
                          padding: "3px 8px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                          background:
                            channel.status === "connected"
                              ? "#ECFDF5"
                              : "#FFF1F2",
                          color:
                            channel.status === "connected"
                              ? "#047857"
                              : "#E11D48",
                        }}
                      >
                        {channel.statusLabel}
                      </span>
                    </div>

                    {channel.error && (
                      <div
                        style={{
                          marginTop: "10px",
                          padding: "8px 10px",
                          borderRadius: "6px",
                          background: "#FFF1F2",
                          border: "1px solid #FECDD3",
                          color: "#BE123C",
                          fontSize: "11.5px",
                        }}
                      >
                        {channel.error}
                      </div>
                    )}

                    <div
                      style={{
                        marginTop: "12px",
                        fontSize: "11.5px",
                        color: "var(--text-secondary)",
                        lineHeight: 1.6,
                      }}
                    >
                      <div>
                        <strong>Auth:</strong> {channel.tokenExpiry}
                      </div>
                      <div>
                        <strong>Protocol:</strong> {channel.protocol}
                      </div>
                      <div>
                        <strong>Last Audit:</strong> {channel.lastAudit}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      borderTop: "1px solid var(--border-light)",
                      paddingTop: "12px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {channel.queuedCount} queued • {channel.blockedCount} blocked
                    </div>

                    {channel.status === "attention" ? (
                      <button
                        type="button"
                        onClick={() => setReconnectModalChannel(channel)}
                        className="btn btn-primary btn-sm"
                        style={{ background: "#E11D48", borderColor: "#BE123C" }}
                      >
                        {t.distribution.reconnect}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          showToast(
                            channel.name,
                            language === "vi"
                              ? "Kênh đã được kiểm tra và hoạt động bình thường."
                              : "Endpoint health verified and operational."
                          )
                        }
                        className="btn btn-secondary btn-sm"
                      >
                        {language === "vi" ? "Kiểm tra" : "Ping"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* ── Reconnect Modal ── */}
      {reconnectModalChannel && (
        <div
          className="modal-overlay active"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            className="modal-card"
            style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              maxWidth: "500px",
              width: "100%",
              padding: "24px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <h3
                style={{
                  fontSize: "17px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                Reconnect {reconnectModalChannel.name}
              </h3>
              <button
                type="button"
                onClick={() => setReconnectModalChannel(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                }}
              >
                ✕
              </button>
            </div>

            <p
              style={{
                fontSize: "13px",
                color: "var(--text-secondary)",
                lineHeight: 1.5,
              }}
            >
              The OAuth access token for this channel expired. Re-authenticate to
              resume scheduled syndication and clear the execution gate block.
            </p>

            <div
              style={{
                marginTop: "16px",
                padding: "12px",
                background: "#F8FAFC",
                borderRadius: "8px",
                fontSize: "12px",
                lineHeight: 1.6,
              }}
            >
              <div>
                <strong>Endpoint:</strong> {reconnectModalChannel.endpoint}
              </div>
              <div>
                <strong>Account Scope:</strong> {reconnectModalChannel.handle}
              </div>
            </div>

            <div
              style={{
                marginTop: "20px",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() => setReconnectModalChannel(null)}
                className="btn btn-secondary"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={handleReconnectSubmit}
                className="btn btn-primary"
              >
                {language === "vi" ? "Xác nhận kết nối lại" : "Renew OAuth Token"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule Post Modal ── */}
      {isScheduleModalOpen && (
        <div
          className="modal-overlay active"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            className="modal-card"
            style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              maxWidth: "540px",
              width: "100%",
              padding: "24px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <h3
                style={{
                  fontSize: "17px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                {t.distribution.schedulePost}
              </h3>
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Deliverable Artifact
                </label>
                <select
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                  }}
                >
                  <option>
                    ART-101: Top 10 Boutique Hotels in Da Nang Beachfront
                  </option>
                  <option>
                    ART-102: Vietnam Digital Nomad Visa 2026 Guidelines
                  </option>
                  <option>ART-103: Hoi An Ancient Town Gourmet Trail</option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Target Channels
                </label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  {["TripC Headless CMS", "LinkedIn", "Twitter / X", "Substack"].map(
                    (name) => (
                      <label
                        key={name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        <input type="checkbox" defaultChecked />
                        <span>{name}</span>
                      </label>
                    )
                  )}
                </div>
              </div>

              <div>
                <label
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    display: "block",
                    marginBottom: "4px",
                  }}
                >
                  Dispatch Slot (ICT Timezone)
                </label>
                <input
                  type="datetime-local"
                  defaultValue="2026-10-22T14:00"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    fontSize: "12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: "20px",
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(false)}
                className="btn btn-secondary"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsScheduleModalOpen(false);
                  showToast(
                    "Syndication Scheduled",
                    "New post added to cron queue for Da Nang Luxury Boutique Stays."
                  );
                }}
                className="btn btn-primary"
              >
                Confirm Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inspect Task Detail Modal ── */}
      {selectedTaskDetail && (
        <div
          className="modal-overlay active"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            className="modal-card"
            style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              maxWidth: "560px",
              width: "100%",
              padding: "24px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
              }}
            >
              <div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "11px",
                    color: "var(--brand-accent)",
                    fontWeight: 700,
                  }}
                >
                  {selectedTaskDetail.id}
                </span>
                <h3
                  style={{
                    fontSize: "16px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    marginTop: "2px",
                  }}
                >
                  {selectedTaskDetail.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTaskDetail(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "var(--text-secondary)",
                }}
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                padding: "14px",
                background: "#F8FAFC",
                borderRadius: "8px",
                fontSize: "12px",
                marginBottom: "14px",
              }}
            >
              <div>
                <strong>Target Channel:</strong> {selectedTaskDetail.channelName}
              </div>
              <div>
                <strong>Assigned Agent:</strong> {selectedTaskDetail.agent}
              </div>
              <div>
                <strong>Status:</strong> {selectedTaskDetail.statusLabel}
              </div>
              <div>
                <strong>Estimated Reach:</strong>{" "}
                {selectedTaskDetail.estimatedReach}
              </div>
            </div>

            <div>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  marginBottom: "6px",
                }}
              >
                Execution Trace &amp; Audit Log
              </div>
              <pre
                style={{
                  background: "#0F172A",
                  color: "#94A3B8",
                  padding: "12px",
                  borderRadius: "8px",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  maxHeight: "140px",
                  overflowY: "auto",
                }}
              >
                {`[09:12:00] Worker initialized for ${selectedTaskDetail.id}
[09:12:04] Pre-flight policy gate: PASS (Word count, toxic terms 0)
[09:12:08] Token verification: 200 OK (${selectedTaskDetail.channelName})
[09:12:12] Payload formatted with native social card containers
[09:12:15] Cron trigger registered for ${selectedTaskDetail.scheduledTime}`}
              </pre>
            </div>

            <div
              style={{
                marginTop: "16px",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedTaskDetail(null)}
                className="btn btn-secondary btn-sm"
              >
                {t.common.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Audit Fleet Modal ── */}
      {isAuditModalOpen && (
        <div
          className="modal-overlay active"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            className="modal-card"
            style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              maxWidth: "500px",
              width: "100%",
              padding: "24px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
          >
            <h3
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: "8px",
              }}
            >
              Fleet Health Audit Complete
            </h3>
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-secondary)",
                lineHeight: 1.5,
              }}
            >
              Scanned 6 remote distribution endpoints. Average round-trip latency:
              164ms. 5 endpoints responding with HTTP 200. Instagram Graph API
              failed authorization (Token expired).
            </p>

            <div
              style={{
                marginTop: "20px",
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="btn btn-primary"
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
