"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { merchantApi, type DailyReport } from "@/lib/merchantApi";
import { Button, Notice, Stat, errorMessage, useAction } from "@/features/merchant/ui";

interface DailyExecutiveReportModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
}

function deliveryLabel(value: DailyReport["delivery"][string]): string {
  if (!value || typeof value === "string") return "—";
  if (value.status === "sent") return "Đã gửi";
  if (value.status === "not_configured") return `Chưa cấu hình (${value.detail ?? ""})`;
  return `Lỗi: ${value.detail ?? "không rõ"}`;
}

/** Nội dung báo cáo ngày (dùng chung cho modal và trang /reports/daily). Số liệu đếm thật từ DB. */
export function DailyReportView({ workspaceId, compact = false }: { workspaceId: string; compact?: boolean }) {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { busy, notice, setNotice, run } = useAction();

  useEffect(() => {
    merchantApi
      .dailyReport(workspaceId)
      .then((r) => {
        setReport(r.report);
        setPreview(r.preview);
        setError(null);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [workspaceId]);

  if (error) return <Notice notice={{ kind: "error", text: error }} />;
  if (!report) return <div className="h-40 rounded-xl bg-slate-100 animate-pulse" aria-busy="true" />;
  const m = report.metrics;

  return (
    <div className="space-y-4">
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Bài đã đăng" value={m.posts_published} hint={m.posts_awaiting_approval ? `${m.posts_awaiting_approval} bài chờ duyệt` : undefined} />
        <Stat label="Bình luận đã trả lời" value={`${m.comments_replied}/${m.comments_received}`} hint={m.comment_median_reply_minutes !== null ? `trung vị ${m.comment_median_reply_minutes} phút` : undefined} />
        <Stat label="Đặt bàn mới" value={m.booking_requests_new} hint={`${m.booking_guests_new} khách · ${m.bookings_pending_confirmation} chờ xác nhận`} />
        <Stat label="Review Maps đã trả lời" value={m.gmaps_replies_published} hint={m.gmaps_average_rating !== null ? `${m.gmaps_average_rating}★` : "chưa đồng bộ"} />
        <Stat label="Ảnh mới từ Drive" value={m.drive_assets_ingested} hint={`${m.drive_assets_ready} ảnh sẵn sàng đăng`} />
        <Stat label="Thành viên cộng đồng" value={m.community_members ?? "chưa đo"} hint={m.community_members_delta !== null ? `${m.community_members_delta >= 0 ? "+" : ""}${m.community_members_delta} hôm nay` : undefined} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Tóm tắt của AI Growth Lead {report.summary_source === "template" ? (preview ? "(bản xem trước theo mẫu — AI viết khi gửi)" : "(mẫu — AI không khả dụng lúc gửi)") : `(${report.summary_source})`}
        </p>
        <pre className="whitespace-pre-wrap font-sans text-sm text-slate-800 leading-relaxed">{report.summary_markdown}</pre>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-600">
        <span>
          {preview ? "Bản xem trước (chưa gửi)." : `Telegram: ${deliveryLabel(report.delivery.telegram)} · Email: ${deliveryLabel(report.delivery.email)}`}
        </span>
        <div className="flex gap-2">
          {compact && (
            <Link href="/reports/daily" className="inline-flex items-center rounded-xl border border-slate-200 px-3.5 py-2 font-semibold text-slate-700 hover:bg-slate-50">
              Xem lịch sử
            </Link>
          )}
          <Button
            busy={busy === "send"}
            onClick={() =>
              run("send", async () => {
                const sent = await merchantApi.sendDailyReport(workspaceId);
                setReport(sent);
                setPreview(false);
                return "Đã lập và gửi báo cáo.";
              })
            }
          >
            Gửi ngay cho chủ quán
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DailyExecutiveReportModal({ workspaceId, isOpen, onClose }: DailyExecutiveReportModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Báo cáo ngày">
      <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-2xl shadow-xl">
        <header className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Báo cáo Tổng kết Ngày</h2>
            <p className="text-xs text-slate-500 mt-1">Do AI Growth Lead lập từ số liệu thật trong ngày (giờ Việt Nam).</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-800 text-lg" aria-label="Đóng">
            ✕
          </button>
        </header>
        <div className="p-5">
          <DailyReportView workspaceId={workspaceId} compact />
        </div>
      </div>
    </div>
  );
}
