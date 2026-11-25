"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

/** Thành phần giao diện dùng chung cho các màn 8 agent merchant. */

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Tài khoản của bạn không có quyền thực hiện thao tác này.";
    return err.message;
  }
  return (err as Error)?.message ?? "Đã có lỗi xảy ra";
}

/** Tải dữ liệu + trạng thái loading/lỗi; reload() để tải lại sau thao tác. */
export function useLoader<T>(load: () => Promise<T>, deps: React.DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let cancelled = false;
    load()
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  /** Tải lại sau một thao tác (gọi từ sự kiện, không phải trong render). */
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loadRef.current());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  return { data, error, loading, reload, setData };
}

/** Chạy một thao tác (nút bấm) và báo kết quả. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key);
    setNotice(null);
    try {
      const text = await fn();
      if (text) setNotice({ kind: "ok", text });
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, notice, setNotice, run };
}

export function Card({ title, subtitle, actions, children, className = "" }: { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between px-5 pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-base font-bold text-slate-900">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const PILL: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-800 border-amber-200",
  red: "bg-rose-50 text-rose-700 border-rose-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

export function Pill({ tone = "slate", children }: { tone?: keyof typeof PILL; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${PILL[tone]}`}>{children}</span>;
}

export function Notice({ notice, onClose }: { notice: { kind: "ok" | "error"; text: string } | null; onClose?: () => void }) {
  if (!notice) return null;
  return (
    <div
      role={notice.kind === "error" ? "alert" : "status"}
      className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${notice.kind === "error" ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}
    >
      <span>{notice.text}</span>
      {onClose && (
        <button type="button" onClick={onClose} className="text-xs font-semibold opacity-70 hover:opacity-100" aria-label="Đóng thông báo">
          ✕
        </button>
      )}
    </div>
  );
}

export function Button({
  children,
  onClick,
  busy,
  variant = "primary",
  type = "button",
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  busy?: boolean;
  variant?: "primary" | "secondary" | "danger";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const style =
    variant === "primary"
      ? "bg-blue-700 text-white hover:bg-blue-800"
      : variant === "danger"
        ? "bg-white text-rose-700 border border-rose-200 hover:bg-rose-50"
        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy || disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${style}`}
    >
      {busy && <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function LoadingBlock() {
  return <div className="h-32 rounded-2xl bg-slate-100 animate-pulse" aria-busy="true" aria-label="Đang tải" />;
}
