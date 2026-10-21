"use client";

import React, { useState } from "react";
import { ReviewItem } from "../types";
import JsonPayloadModal from "./JsonPayloadModal";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { StatusPill } from "@/components/ui/StatusPill";

interface ReviewDetailViewProps {
  item: ReviewItem;
  onApprove: (itemId: string) => void;
  onReject: (itemId: string, reason: string) => void;
}

export default function ReviewDetailView({
  item,
  onApprove,
  onReject,
}: ReviewDetailViewProps) {
  const { language, t } = useLanguage();
  const [rejectionReason, setRejectionReason] = useState("");
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handleApproveClick = () => {
    onApprove(item.id);
    setActionNotice(t.reviewQueue.detail.approveSuccess);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleRejectClick = () => {
    onReject(
      item.id,
      rejectionReason || (language === "vi" ? "Phản hồi hiệu chỉnh lại" : "Feedback provided for recalibration")
    );
    setActionNotice(t.reviewQueue.detail.rejectSuccess);
    setTimeout(() => setActionNotice(null), 4000);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col relative">
      {/* ── Document Header ── */}
      <div className="p-6 pb-5 border-b border-slate-100">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                {item.title}
              </h2>
              <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200/80">
                {item.version}
              </span>
              <StatusPill
                size="md"
                status={
                  item.status === "approved"
                    ? "completed"
                    : item.status === "rejected"
                    ? "blocked"
                    : "pending"
                }
                label={
                  item.status === "approved"
                    ? t.reviewQueue.detail.approved
                    : item.status === "rejected"
                    ? `${t.reviewQueue.detail.rejected} (${item.rejectionReason || "Cần hiệu chỉnh"})`
                    : t.reviewQueue.detail.pendingApproval
                }
              />
            </div>

            {/* Meta Row */}
            <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500 mt-3">
              <div className="flex items-center gap-1.5 text-slate-800 font-semibold bg-slate-100/80 px-2.5 py-1 rounded-lg border border-slate-200/60">
                <svg
                  className="w-3.5 h-3.5 text-blue-600"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                  <path d="M10 6.5h4M6.5 10v7.5a1 1 0 001 1H14" />
                </svg>
                <span>{item.agent}</span>
              </div>
              <span className="text-slate-300">•</span>
              <span>
                {language === "vi" ? "Tác vụ: " : "Task: "}
                <strong className="text-slate-700 font-mono font-bold">{item.taskId}</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span>
                Run: <strong className="text-slate-700 font-mono font-semibold">{item.runId}</strong>
              </span>
              <span className="text-slate-300">•</span>
              <span>
                {language === "vi" ? "Tạo lúc: " : "Created: "}
                <span className="text-slate-700 font-medium">{item.createdAt}</span>
              </span>
            </div>
          </div>

          {/* Quick Action Icons: JSON & Expand */}
          <div className="flex items-center gap-2 self-start shrink-0">
            <button
              type="button"
              onClick={() => setIsJsonModalOpen(true)}
              title={t.reviewQueue.detail.viewJson}
              className="h-9 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer font-mono text-xs font-bold shadow-2xs"
            >
              <span>{"{ }"}</span>
              <span className="font-sans font-medium text-xs hidden sm:inline">{t.reviewQueue.detail.viewJson}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsJsonModalOpen(true)}
              title={t.reviewQueue.detail.expandDocument}
              className="w-9 h-9 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Document Body ── */}
      <div className="p-6 space-y-6">
        {/* Toast / Notification feedback banner */}
        {actionNotice && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs md:text-sm px-4 py-3 rounded-xl font-medium flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
              <span>{actionNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="text-emerald-700 hover:text-emerald-950 font-bold cursor-pointer text-sm"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── 4-Stage Stepper: Execution Pipeline & Handoff Card ── */}
        <div className="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between text-xs flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-600">
                {language === "vi" ? "QUY TRÌNH THỰC THI & CHUYỂN GIAO" : "EXECUTION PIPELINE & HANDOFF"}
              </span>
              <span className="text-xs font-mono text-slate-400">
                • {language === "vi" ? "ĐỘ TRỄ: " : "LATENCY: "}<strong className="text-slate-600 font-bold">{item.latency}</strong>
              </span>
            </div>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
              {item.stagesCompletedText}
            </span>
          </div>

          {/* 4 Pipeline Steps (Clear Stepper Layout with vertical/horizontal spacing) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 relative">
            {item.pipelineSteps.map((step, idx) => {
              const isCompleted = step.status === "completed";
              const isPaused = step.status === "paused";

              return (
                <div
                  key={step.stepNumber}
                  className={`relative bg-white rounded-xl p-4 border transition-all duration-150 flex flex-col justify-between ${
                    isPaused
                      ? "border-blue-400 ring-2 ring-blue-500/20 shadow-xs"
                      : "border-slate-200/90 shadow-2xs"
                  }`}
                >
                  <div>
                    {/* Step Number & Status Indicator */}
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center font-mono ${
                          isCompleted
                            ? "bg-emerald-100 text-emerald-800"
                            : isPaused
                            ? "bg-blue-600 text-white"
                            : "bg-slate-100 text-slate-500"
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-900 tracking-tight">
                          {step.name}
                        </span>
                      </div>

                      {isCompleted ? (
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      ) : (
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                          <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                        </span>
                      )}
                    </div>

                    {/* Step Description */}
                    <p className="text-xs text-slate-500 leading-relaxed">
                      {step.description}
                    </p>
                  </div>

                  {/* Step status footnote */}
                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="font-mono text-[11px] text-slate-400 uppercase font-semibold">
                      {isCompleted ? "Giai đoạn xong" : isPaused ? "Chờ duyệt" : "Sắp tới"}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isCompleted ? "bg-emerald-500" : isPaused ? "bg-blue-500" : "bg-slate-300"
                    }`} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Autonomous Pause Notice */}
          <div className="flex items-center gap-2.5 text-xs text-slate-600 bg-blue-50/60 p-3 rounded-xl border border-blue-200/60">
            <svg
              className="w-4 h-4 text-blue-600 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span className="leading-relaxed">
              {language === "vi"
                ? "AI đã tự động hoàn thành giai đoạn 1–3. Quy trình tạm dừng an toàn để chờ quyết định phê duyệt của bạn trước khi đưa vào sản xuất."
                : "AI autonomously executed stages 1–3. Workflow is paused awaiting your executive decision before CMS sync."}
            </span>
          </div>
        </div>

        {/* ── 3 Trust & Safety Validation Badges (Equal-height cards, soft padding) ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {item.validations.map((val) => (
            <div
              key={val.id}
              className="bg-emerald-50/40 border border-emerald-100 hover:border-emerald-200 rounded-2xl p-4.5 flex items-start gap-3.5 shadow-2xs transition-all hover:bg-emerald-50/60"
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 leading-tight">
                  {val.title}
                </p>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {val.subtitle}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Document Content Preview Card ── */}
        <div className="border border-slate-200/90 rounded-2xl overflow-hidden bg-white shadow-2xs">
          {/* Preview Box Header */}
          <div className="px-5 py-4 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200/60 shadow-2xs">
                <svg
                  className="w-4.5 h-4.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 leading-tight">
                  {item.title} — Da Nang &amp; Hoi An
                </h4>
                <p className="text-xs text-slate-500 leading-tight mt-1">
                  {t.reviewQueue.detail.targetCluster}{" "}
                  <span className="font-semibold text-slate-700">{item.targetCluster}</span>
                  {" · "}
                  {t.reviewQueue.detail.targetLocale}{" "}
                  <span className="font-semibold text-slate-700">{item.targetLocale}</span>
                </p>
              </div>
            </div>

            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              Chi tiết bản thảo AI
            </span>
          </div>

          {/* Preview Box Content */}
          <div className="p-5 space-y-6 text-left">
            {/* Section 01: Executive Summary */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
                  01
                </span>
                <h5 className="text-xs font-bold text-slate-900 tracking-tight uppercase">
                  {t.reviewQueue.detail.section1Title}
                </h5>
              </div>
              <p className="text-xs md:text-sm text-slate-700 leading-relaxed bg-slate-50/70 p-4 rounded-xl border border-slate-200/70">
                {item.executiveSummary}
              </p>
            </div>

            {/* Section 02: Topic Clusters (min-h-[56px] and prominent SERP Void badge) */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200/60">
                  02
                </span>
                <h5 className="text-xs font-bold text-slate-900 tracking-tight uppercase">
                  {t.reviewQueue.detail.section2Title}
                </h5>
              </div>

              {/* 3 Clusters */}
              <div className="space-y-3">
                {item.topicClusters.map((cluster) => (
                  <div
                    key={cluster.id}
                    className="min-h-[64px] p-4 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 shadow-2xs hover:shadow-xs group"
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <span className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-black text-xs flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-blue-600 group-hover:text-white transition-colors shadow-2xs">
                        {cluster.letter}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 leading-tight">
                          {cluster.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          {cluster.description}
                        </p>
                      </div>
                    </div>

                    <span className="inline-flex items-center self-start sm:self-center px-3.5 py-1.5 rounded-full text-xs font-mono font-bold text-emerald-800 bg-emerald-100/80 border border-emerald-300 shadow-2xs shrink-0">
                      {cluster.serpVoidBadge}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom Fixed / Gated Action Footer (Sticky at bottom, 44px buttons, proper input) ── */}
      <div className="sticky bottom-0 z-20 p-5 border-t border-slate-200 bg-white/95 backdrop-blur-md shadow-lg space-y-3">
        {/* Human approval notice */}
        <div className="flex items-center gap-2 text-xs text-slate-600 font-medium">
          <svg
            className="w-4 h-4 text-blue-600 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <span>
            {t.reviewQueue.detail.humanApprovalNotice}{" "}
            <strong className="text-slate-900 font-bold">
              {language === "vi"
                ? "Xuất bản CMS tự động & Phân phối đa kênh."
                : "Automated CMS Publishing & Multi-Channel Syndication."}
            </strong>
          </span>
        </div>

        {/* Action Controls: Input + Reject (44px) + Approve (44px) */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder={t.reviewQueue.detail.rejectPlaceholder}
              className="w-full h-11 bg-slate-50/80 hover:bg-white focus:bg-white border border-slate-300 hover:border-slate-400 rounded-xl px-4 text-xs md:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:ring-3 focus:ring-blue-500/15 focus:border-blue-500 transition-all shadow-2xs"
            />
          </div>

          <div className="flex items-center gap-2.5 shrink-0 justify-end">
            <button
              type="button"
              onClick={handleRejectClick}
              className="h-11 px-5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 rounded-xl text-xs md:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-2xs hover:shadow-xs"
            >
              <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>{t.reviewQueue.detail.rejectBtn}</span>
            </button>
            <button
              type="button"
              onClick={handleApproveClick}
              className="h-11 px-6 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 text-white rounded-xl text-xs md:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-blue-500/25 hover:shadow-lg hover:shadow-blue-500/30"
            >
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>{t.reviewQueue.detail.approveBtn}</span>
            </button>
          </div>
        </div>
      </div>

      {/* JSON Payload Modal */}
      <JsonPayloadModal
        isOpen={isJsonModalOpen}
        onClose={() => setIsJsonModalOpen(false)}
        title={item.title}
        payload={item.jsonPayload}
      />
    </div>
  );
}
