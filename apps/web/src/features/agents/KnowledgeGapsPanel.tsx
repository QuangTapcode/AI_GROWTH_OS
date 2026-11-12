"use client";

import { useState } from "react";
import { apiRequest } from "@/lib/api";

export type KnowledgeGapSource = { source_id: string; url: string; title: string; status: string; version: number | null };
export type KnowledgeGap = {
  id: string;
  question: string;
  ask_count: number;
  status: "open" | "proposed" | "resolved" | "no_source";
  topic: string | null;
  reopened: number;
  last_asked_at: string;
  sources: KnowledgeGapSource[];
};

const STATUS: Record<KnowledgeGap["status"], { label: string; className: string }> = {
  open: { label: "Đang tìm nguồn", className: "bg-amber-100 text-amber-900" },
  proposed: { label: "Chờ bạn duyệt nguồn", className: "bg-blue-100 text-blue-900" },
  resolved: { label: "Đã có nguồn — bot trả lời được", className: "bg-emerald-100 text-emerald-900" },
  no_source: { label: "Không tìm được nguồn tự động", className: "bg-slate-200 text-slate-800" },
};

const SOURCE_STATUS: Record<string, string> = {
  imported: "đang tải…",
  processing: "đang chia đoạn…",
  needs_review: "chờ duyệt",
  approved: "đã duyệt",
  rejected: "đã bỏ",
  revoked: "đã thu hồi",
  failed: "tải lỗi",
};

/** Questions the Community bot could not answer, and the sources found for them, waiting for the owner's approval. */
export default function KnowledgeGapsPanel({ workspaceId, gaps, canEdit, onChanged }: {
  workspaceId: string;
  gaps: KnowledgeGap[] | undefined;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!gaps?.length) return null;
  const open = gaps.filter((g) => g.status !== "resolved").length;

  async function review(source: KnowledgeGapSource, decision: "approved" | "rejected") {
    if (source.version == null) return;
    setBusy(source.source_id);
    setError(null);
    try {
      await apiRequest(`/workspaces/${workspaceId}/sources/${source.source_id}/review`, {
        method: "POST",
        body: { decision, expected_version: source.version, review_reason: "Nguồn cho câu hỏi cộng đồng chưa trả lời được" },
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không duyệt được nguồn (chỉ Owner được duyệt).");
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4" open={open > 0}>
      <summary className="cursor-pointer text-sm font-bold text-amber-950">
        ❓ Câu hỏi bot chưa trả lời được — {open} đang mở / {gaps.length}
      </summary>
      <p className="mt-2 text-xs text-slate-700">
        Mỗi câu bot phải trả lời thay thế được ghi lại. Hệ thống tự tìm trang liên quan trên Wikivoyage/Wikipedia và nạp thành
        nguồn; bạn duyệt nguồn đúng thì lần sau bot trả lời được.
      </p>
      {error && <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>}
      <ul className="mt-3 space-y-2">
        {gaps.map((gap) => (
          <li key={gap.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">“{gap.question}”</span>
              <span className="flex items-center gap-2">
                <span className="text-slate-500">hỏi {gap.ask_count} lần{gap.reopened ? ` · mở lại ${gap.reopened}` : ""}</span>
                <span className={`rounded px-1.5 py-0.5 font-bold ${STATUS[gap.status].className}`}>{STATUS[gap.status].label}</span>
              </span>
            </div>
            {gap.topic && <p className="mt-1 text-slate-500">Tìm theo: {gap.topic}</p>}
            {gap.status === "no_source" && (
              <p className="mt-1 text-slate-600">Các trang được phép không viết về chủ đề này; hệ thống thử lại sau 7 ngày.</p>
            )}
            {gap.sources.length > 0 && (
              <ul className="mt-2 space-y-1">
                {gap.sources.map((source) => (
                  <li key={source.source_id} className="flex flex-wrap items-center justify-between gap-2">
                    <a href={source.url} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">
                      {source.title} ↗
                    </a>
                    <span className="flex items-center gap-1.5">
                      <span className="text-slate-500">{SOURCE_STATUS[source.status] ?? source.status}</span>
                      {source.status === "needs_review" && canEdit && (
                        <>
                          <button type="button" disabled={busy === source.source_id} onClick={() => review(source, "approved")}
                            className="rounded bg-emerald-700 px-2 py-0.5 font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                            Duyệt
                          </button>
                          <button type="button" disabled={busy === source.source_id} onClick={() => review(source, "rejected")}
                            className="rounded border border-slate-300 px-2 py-0.5 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
                            Bỏ
                          </button>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
