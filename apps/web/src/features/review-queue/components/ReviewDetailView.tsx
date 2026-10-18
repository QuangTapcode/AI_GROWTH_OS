"use client";

import React, { useState } from "react";
import { ReviewItem } from "../types";
import JsonPayloadModal from "./JsonPayloadModal";

interface ReviewDetailViewProps {
  item: ReviewItem;
  canApprove: boolean;
  onApprove: (itemId: string, note: string) => Promise<void>;
  onReject: (itemId: string, reason: string) => Promise<void>;
}

export default function ReviewDetailView({
  item,
  canApprove,
  onApprove,
  onReject,
}: ReviewDetailViewProps) {
  const [rejectionReason, setRejectionReason] = useState("");
  const [isJsonModalOpen, setIsJsonModalOpen] = useState(false);
  const [actionNotice, setActionNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const runDecision = async (action: () => Promise<void>, successText: string) => {
    setSubmitting(true);
    setActionNotice(null);
    try {
      await action();
      setRejectionReason("");
      setActionNotice({ tone: "success", text: successText });
    } catch (err) {
      setActionNotice({ tone: "error", text: err instanceof Error ? err.message : "The decision could not be saved." });
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveClick = () =>
    runDecision(() => onApprove(item.id, rejectionReason.trim()), "Approved. The decision is recorded in the approval ledger.");

  const handleRejectClick = () =>
    runDecision(
      () => onReject(item.id, rejectionReason.trim() || "Rejected without a note"),
      "Rejected. Your feedback is saved with the approval."
    );

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col justify-between">
      {/* ── Document Header ── */}
      <div className="p-6 pb-5 border-b border-slate-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
                {item.title}
              </h2>
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {item.version}
              </span>
            </div>

            {/* Status Pill */}
            <div className="mt-2">
              {item.status === "pending" ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-amber-50 text-amber-700 border border-amber-200">
                  <svg
                    className="w-3.5 h-3.5 text-amber-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span>Awaiting Human Approval</span>
                </span>
              ) : item.status === "approved" ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <svg className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span>Approved</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase bg-rose-50 text-rose-700 border border-rose-200">
                  <span>{item.statusTag} ({item.rejectionReason || "no note"})</span>
                </span>
              )}
            </div>

            {/* Meta Row */}
            <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500 mt-2.5">
              <div className="flex items-center gap-1.5 text-slate-700 font-semibold">
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
              <span>Task: <strong className="text-slate-700 font-medium">{item.taskId}</strong></span>
              <span className="text-slate-300">•</span>
              <span>Approval: <strong className="text-slate-700 font-medium">{item.runId}</strong></span>
              <span className="text-slate-300">•</span>
              <span>Created {item.createdAt}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Document Body ── */}
      <div className="p-6 space-y-5">
        {/* Toast / Notification feedback banner */}
        {actionNotice && (
          <div
            className={`${
              actionNotice.tone === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            } border text-xs px-4 py-2.5 rounded-xl font-medium flex items-center justify-between animate-in fade-in`}
          >
            <span>{actionNotice.text}</span>
            <button type="button" onClick={() => setActionNotice(null)} className="font-bold opacity-70 hover:opacity-100 pl-3">
              ✕
            </button>
          </div>
        )}

        {/* ── Execution Pipeline & Handoff Card ── */}
        <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-4 space-y-3.5">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                EXECUTION PIPELINE &amp; HANDOFF
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                LATENCY: {item.latency}
              </span>
            </div>
            <span className="text-xs font-semibold text-slate-600">
              {item.stagesCompletedText}
            </span>
          </div>

          {/* 4 Pipeline Steps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {item.pipelineSteps.map((step) => {
              const isCompleted = step.status === "completed";
              const isPaused = step.status === "paused";

              return (
                <div
                  key={step.stepNumber}
                  className={`bg-white rounded-xl p-3 border transition-all ${
                    isPaused
                      ? "border-blue-400 ring-2 ring-blue-500/10 shadow-xs"
                      : "border-slate-200/80"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-slate-900">
                      {step.name}
                    </span>
                    {isCompleted ? (
                      <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                        <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-snug">
                    {step.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Autonomous Pause Notice */}
          <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
            <svg
              className="w-4 h-4 text-blue-500 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>{item.pipelineNotice}</span>
          </div>
        </div>

        {/* ── 3 Trust & Safety Validation Badges ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {item.validations.map((val) => (
            <div
              key={val.id}
              className="bg-white border border-slate-200/80 rounded-xl p-3 flex items-start gap-2.5 shadow-2xs"
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                  val.passed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                }`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d={val.passed ? "M5 13l4 4L19 7" : "M6 18L18 6M6 6l12 12"} />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 leading-tight">
                  {val.title}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                  {val.subtitle}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Document Content Preview Card ── */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
          {/* Preview Box Header */}
          <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200/60">
                <svg
                  className="w-4 h-4"
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
                <h4 className="text-xs font-bold text-slate-900 leading-tight">
                  {item.title}
                </h4>
                <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                  Target Cluster: <span className="font-semibold text-slate-700">{item.targetCluster}</span>
                  {" · "}
                  Target Locale: <span className="font-semibold text-slate-700">{item.targetLocale}</span>
                </p>
              </div>
            </div>

            {/* Quick Action Icons: { } and Expand */}
            <div className="flex items-center gap-1.5 text-slate-400">
              <button
                type="button"
                onClick={() => setIsJsonModalOpen(true)}
                title="View JSON Payload"
                className="w-7 h-7 rounded-lg hover:bg-slate-200/70 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer font-mono text-xs font-bold"
              >
                {"{ }"}
              </button>
              <button
                type="button"
                onClick={() => setIsJsonModalOpen(true)}
                title="Expand Full Document"
                className="w-7 h-7 rounded-lg hover:bg-slate-200/70 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>
          </div>

          {/* Preview Box Content */}
          <div className="p-5 space-y-5 text-left">
            {/* Section 01 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                  01
                </span>
                <h5 className="text-xs font-bold text-slate-900 tracking-tight">
                  Executive Summary
                </h5>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed bg-slate-50/50 p-3.5 rounded-xl border border-slate-100">
                {item.executiveSummary}
              </p>
            </div>

            {/* Section 02 */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                  02
                </span>
                <h5 className="text-xs font-bold text-slate-900 tracking-tight">
                  Topic Clusters &amp; Key Points
                </h5>
              </div>

              <div className="space-y-2.5">
                {item.topicClusters.length === 0 && (
                  <p className="text-xs text-slate-400">The agent did not return topic clusters for this output.</p>
                )}
                {item.topicClusters.map((cluster) => (
                  <div
                    key={cluster.id}
                    className="p-3.5 rounded-xl border border-slate-200/80 bg-white hover:border-slate-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                        {cluster.letter}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 leading-tight">
                          {cluster.title}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                          {cluster.description}
                        </p>
                      </div>
                    </div>

                    {cluster.serpVoidBadge && (
                      <span className="inline-flex items-center self-start sm:self-center px-2.5 py-1 rounded-full text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 shrink-0">
                        {cluster.serpVoidBadge}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {item.documentContent && (
              <div>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">03</span>
                  <h5 className="text-xs font-bold text-slate-900 tracking-tight">Document</h5>
                </div>
                <pre className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-sans bg-slate-50/50 p-3.5 rounded-xl border border-slate-100 max-h-[360px] overflow-y-auto">
                  {item.documentContent}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom Fixed / Gated Action Footer ── */}
      <div className="p-6 pt-4 border-t border-slate-100 bg-slate-50/60 space-y-3">
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
            {item.status !== "pending"
              ? "This approval has been decided. Request a new review from Artifacts to change it."
              : canApprove
              ? "Approval pins this exact version and content hash before it can be handed off for publishing."
              : "Only workspace owners can approve or reject AI outputs."}
          </span>
        </div>

        {/* Action Controls: Input + Reject + Approve */}
        {item.status === "pending" && canApprove && (
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input
              type="text"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              maxLength={1000}
              placeholder="Review note (required context for rejections, saved with the decision)..."
              className="flex-1 w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
            />

            <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0 justify-end">
              <button
                type="button"
                onClick={handleRejectClick}
                disabled={submitting}
                className="flex-1 sm:flex-initial px-4 py-2.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200/90 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-60"
              >
                <span>✕ Reject</span>
              </button>
              <button
                type="button"
                onClick={handleApproveClick}
                disabled={submitting}
                className="flex-1 sm:flex-initial px-5 py-2.5 bg-[#1d4ed8] hover:bg-[#1e40af] active:bg-blue-900 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/30 disabled:opacity-60"
              >
                <span>{submitting ? "Saving…" : "✓ Approve"}</span>
              </button>
            </div>
          </div>
        )}
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
