"use client";

import React, { useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface CreateGrowthTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (task: {
    title: string;
    agent: string;
    priority: string;
    instructions: string;
  }) => void;
}

export default function CreateGrowthTaskModal({
  isOpen,
  onClose,
  onCreated,
}: CreateGrowthTaskModalProps) {
  const { language } = useLanguage();
  const [title, setTitle] = useState("");
  const [agent, setAgent] = useState("Content");
  const [priority, setPriority] = useState("MEDIUM");
  const [instructions, setInstructions] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onCreated({
      title: title.trim(),
      agent,
      priority,
      instructions: instructions.trim(),
    });

    setTitle("");
    setInstructions("");
    onClose();
  };

  return (
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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-content"
        style={{
          background: "#FFFFFF",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "540px",
          boxShadow: "0 20px 40px rgba(16, 47, 112, 0.2)",
          overflow: "hidden",
          border: "1px solid #DCE6F5",
        }}
      >
        <div
          className="modal-header"
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #DCE6F5",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h3
              className="modal-title"
              style={{
                fontSize: "18px",
                fontWeight: 800,
                color: "var(--brand-navy)",
                margin: 0,
              }}
            >
              {language === "vi" ? "Tạo tác vụ tăng trưởng" : "Create Growth Task"}
            </h3>
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
                display: "block",
                marginTop: "4px",
              }}
            >
              Maps to table <code>agent_tasks (task_code, action_type, status)</code>
            </span>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              background: "none",
              border: "none",
              fontSize: "24px",
              lineHeight: 1,
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div
            className="modal-body"
            style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}
          >
            <div className="form-group">
              <label
                className="form-label"
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: "6px",
                }}
              >
                {language === "vi" ? "Mục tiêu / Tiêu đề tác vụ" : "Task Objective / Title"}
              </label>
              <input
                type="text"
                className="form-control"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  language === "vi"
                    ? "VD: Soạn hướng dẫn eco-resort tại Phú Quốc..."
                    : "e.g., Draft curated guide for eco-resorts in Phu Quoc"
                }
                required
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #BFDBFE",
                  fontSize: "13px",
                  outline: "none",
                }}
              />
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--text-muted)",
                  marginTop: "4px",
                  display: "block",
                }}
              >
                Stored as <code>agent_tasks.action_type</code> and task metadata.
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div className="form-group">
                <label
                  className="form-label"
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    marginBottom: "6px",
                  }}
                >
                  {language === "vi" ? "Agent đích" : "Target Agent"}
                </label>
                <select
                  className="form-control"
                  value={agent}
                  onChange={(e) => setAgent(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #BFDBFE",
                    fontSize: "13px",
                    outline: "none",
                    background: "#fff",
                  }}
                >
                  <option value="Content">Content Agent</option>
                  <option value="SEO">SEO Agent</option>
                  <option value="Research">Research Agent</option>
                  <option value="Distribution">Distribution Agent</option>
                </select>
              </div>

              <div className="form-group">
                <label
                  className="form-label"
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--text-primary)",
                    marginBottom: "6px",
                  }}
                >
                  {language === "vi" ? "Mức độ ưu tiên" : "Priority"}
                </label>
                <select
                  className="form-control"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #BFDBFE",
                    fontSize: "13px",
                    outline: "none",
                    background: "#fff",
                  }}
                >
                  <option value="HIGH">
                    {language === "vi" ? "Ưu tiên cao" : "High Priority"}
                  </option>
                  <option value="MEDIUM">
                    {language === "vi" ? "Ưu tiên trung bình" : "Medium Priority"}
                  </option>
                  <option value="LOW">
                    {language === "vi" ? "Ưu tiên thấp" : "Low Priority"}
                  </option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label
                className="form-label"
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: "6px",
                }}
              >
                {language === "vi"
                  ? "Ngữ cảnh & Hướng dẫn (business_profiles)"
                  : "Context & Guidelines (business_profiles)"}
              </label>
              <textarea
                className="form-control"
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={
                  language === "vi"
                    ? "Cung cấp từ khóa mục tiêu, văn phong hoặc nguồn dữ liệu cho không gian..."
                    : "Provide target keywords, tone of voice, or data sources for the TripC workspace..."
                }
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #BFDBFE",
                  fontSize: "13px",
                  outline: "none",
                  resize: "vertical",
                }}
              />
            </div>

            <div
              style={{
                padding: "10px 14px",
                background: "#F8FAFC",
                border: "1px solid #DCE6F5",
                borderRadius: "10px",
                fontSize: "11.5px",
                color: "var(--text-secondary)",
              }}
            >
              <strong>{language === "vi" ? "Ghi chú Prototype:" : "Prototype Note:"}</strong>{" "}
              {language === "vi"
                ? "Gửi biểu mẫu sẽ đưa tác vụ vào hàng đợi trạng thái UI cục bộ."
                : "Submitting will queue the task in local UI state. No write operation is made to PostgreSQL."}
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
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: "10px",
                fontSize: "12.5px",
                fontWeight: 600,
                border: "1px solid #DCE6F5",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              {language === "vi" ? "Hủy" : "Cancel"}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                padding: "8px 18px",
                borderRadius: "10px",
                fontSize: "12.5px",
                fontWeight: 700,
                background: "var(--brand-accent)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              {language === "vi" ? "Giao việc cho Agent" : "Dispatch to Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
