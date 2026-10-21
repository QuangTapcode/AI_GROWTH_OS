"use client";

import React from "react";

interface DatabaseSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DatabaseSchemaModal({
  isOpen,
  onClose,
}: DatabaseSchemaModalProps) {
  if (!isOpen) return null;

  const tables = [
    {
      name: "workspaces",
      desc: "Core multi-tenant workspace entity (id, name, slug, industry, default_language, timezone, created_at)",
      columns: ["id (UUID)", "name (VARCHAR)", "slug (VARCHAR)", "industry (VARCHAR)", "timezone (VARCHAR)"],
    },
    {
      name: "users & memberships",
      desc: "Identity & RBAC access mapping (roles: owner, admin, editor, viewer)",
      columns: ["user_id (UUID)", "workspace_id (UUID)", "role (ENUM)", "status (VARCHAR)", "joined_at (TIMESTAMPTZ)"],
    },
    {
      name: "business_profiles",
      desc: "Brand context, target audience, brand voice rules, conversion goals",
      columns: ["workspace_id (UUID)", "target_audience (TEXT)", "target_locations (TEXT)", "brand_voice_rules (JSONB)"],
    },
    {
      name: "agent_task_runs",
      desc: "Autonomous workflow executions, step logs, latency telemetry, model IDs",
      columns: ["id (VARCHAR)", "task_title (VARCHAR)", "agent_type (ENUM)", "status (ENUM)", "llm_model (VARCHAR)", "latency_ms (INT)"],
    },
    {
      name: "artifacts",
      desc: "Content deliverables, SEO dossiers, version snapshot history",
      columns: ["id (VARCHAR)", "title (VARCHAR)", "artifact_type (ENUM)", "content (TEXT)", "version (INT)", "status (ENUM)"],
    },
    {
      name: "review_items",
      desc: "Human-in-the-loop quality gate, confidence scores, approval signatures",
      columns: ["id (VARCHAR)", "artifact_id (VARCHAR)", "confidence_score (INT)", "human_decision (ENUM)", "rejection_reason (TEXT)"],
    },
    {
      name: "channels & publishing_jobs",
      desc: "Omnichannel endpoints, OAuth credentials, cron syndication dispatch queue",
      columns: ["channel_id (VARCHAR)", "platform_type (ENUM)", "token_expiry (TIMESTAMPTZ)", "job_status (ENUM)", "remote_permalink (TEXT)"],
    },
    {
      name: "analytics_telemetry",
      desc: "GA4 sessions, GSC organic clicks, attribution funnels, SERP rankings",
      columns: ["timestamp (TIMESTAMPTZ)", "qualified_visits (INT)", "organic_clicks (INT)", "conversions (INT)", "keyword_positions (JSONB)"],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200/70 text-blue-600 flex items-center justify-center shrink-0 shadow-2xs">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="5" rx="9" ry="3" />
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold text-blue-600 uppercase tracking-wider">
                DATA INTEGRITY &amp; MAPPING
              </div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight leading-tight mt-0.5">
                Database Schema Map (PostgreSQL Core)
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Body list of tables */}
        <div className="p-6 overflow-y-auto space-y-4 text-left">
          <p className="text-xs text-slate-500 leading-relaxed bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/70">
            The AI Growth OS user interface is mapped to the relational schema
            defined in <code className="font-mono text-blue-700 font-semibold">001_initial_core_schema.sql</code>. Each UI widget
            traces to strict production columns or simulated telemetry aggregations.
          </p>

          <div className="space-y-3">
            {tables.map((table, idx) => (
              <div
                key={idx}
                className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-2xs hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800">
                  <span className="text-slate-400">TABLE:</span>
                  <span className="text-blue-600">{table.name}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1 leading-snug">
                  {table.desc}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {table.columns.map((col, cIdx) => (
                    <span
                      key={cIdx}
                      className="px-2 py-0.5 bg-blue-50/80 border border-blue-200/60 text-blue-700 rounded-md text-[10px] font-mono font-medium"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs rounded-xl shadow-sm shadow-blue-500/25 cursor-pointer transition-all"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}
