"use client";

import React from "react";

export type StatusType =
  | "completed"
  | "running"
  | "pending"
  | "blocked"
  | "rejected"
  | "queued"
  | "success"
  | "warning"
  | "error"
  | "info"
  | string;

interface StatusPillProps {
  status: StatusType;
  label?: string;
  className?: string;
  size?: "sm" | "md";
  showDot?: boolean;
}

const statusConfig: Record<
  string,
  {
    bg: string;
    text: string;
    border: string;
    dot: string;
    defaultLabel: string;
    pulse?: boolean;
  }
> = {
  // Hoàn thành / Thành công
  completed: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200/80",
    dot: "bg-emerald-500",
    defaultLabel: "Hoàn thành",
  },
  success: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200/80",
    dot: "bg-emerald-500",
    defaultLabel: "Đạt chuẩn",
  },
  approved: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200/80",
    dot: "bg-emerald-500",
    defaultLabel: "Đã phê duyệt",
  },

  // Đang chạy / Tiến trình
  running: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200/80",
    dot: "bg-blue-500",
    defaultLabel: "Đang chạy",
    pulse: true,
  },
  in_progress: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200/80",
    dot: "bg-blue-500",
    defaultLabel: "Đang tiến hành",
    pulse: true,
  },

  // Cần phê duyệt / Chờ xử lý
  pending: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200/80",
    dot: "bg-amber-500",
    defaultLabel: "Cần phê duyệt",
  },
  waiting: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200/80",
    dot: "bg-amber-500",
    defaultLabel: "Đang chờ",
  },
  warning: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200/80",
    dot: "bg-amber-500",
    defaultLabel: "Cảnh báo",
  },

  // Bị chặn / Từ chối / Lỗi
  blocked: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200/80",
    dot: "bg-rose-500",
    defaultLabel: "Bị chặn",
  },
  rejected: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200/80",
    dot: "bg-rose-500",
    defaultLabel: "Đã từ chối",
  },
  error: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200/80",
    dot: "bg-rose-500",
    defaultLabel: "Lỗi",
  },
  failed: {
    bg: "bg-rose-50",
    text: "text-rose-700",
    border: "border-rose-200/80",
    dot: "bg-rose-500",
    defaultLabel: "Thất bại",
  },

  // Hàng đợi / Bản nháp
  queued: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200/80",
    dot: "bg-slate-400",
    defaultLabel: "Trong hàng đợi",
  },
  ready: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200/80",
    dot: "bg-slate-400",
    defaultLabel: "Sẵn sàng",
  },
  draft: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    border: "border-slate-200/80",
    dot: "bg-slate-400",
    defaultLabel: "Bản nháp",
  },
};

function normalizeStatus(status: string): string {
  const s = status.toLowerCase().replace(/[\s-]/g, "_");
  if (s.includes("complete") || s.includes("hoàn thành") || s.includes("done")) return "completed";
  if (s.includes("run") || s.includes("tiến trình") || s.includes("đang")) return "running";
  if (s.includes("pend") || s.includes("duyệt") || s.includes("chờ") || s.includes("review")) return "pending";
  if (s.includes("block") || s.includes("chặn")) return "blocked";
  if (s.includes("reject") || s.includes("từ chối")) return "rejected";
  if (s.includes("fail") || s.includes("lỗi") || s.includes("error")) return "error";
  if (s.includes("queue") || s.includes("hàng đợi")) return "queued";
  if (s.includes("draft") || s.includes("nháp")) return "draft";
  return s in statusConfig ? s : "queued";
}

export default function StatusPill({
  status,
  label,
  className = "",
  size = "md",
  showDot = true,
}: StatusPillProps) {
  const key = normalizeStatus(status);
  const cfg = statusConfig[key] || statusConfig.queued;
  const displayLabel = label || cfg.defaultLabel;

  const sizeClasses =
    size === "sm"
      ? "text-[11px] py-0.5 px-2 gap-1.5"
      : "text-[12px] py-1 px-2.5 gap-2";

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border whitespace-nowrap transition-colors ${sizeClasses} ${cfg.bg} ${cfg.text} ${cfg.border} ${className}`}
    >
      {showDot && (
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot} ${
            cfg.pulse ? "animate-pulse" : ""
          }`}
        />
      )}
      <span>{displayLabel}</span>
    </span>
  );
}
