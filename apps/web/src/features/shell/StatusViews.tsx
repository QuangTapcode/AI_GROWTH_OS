"use client";

import React from "react";
import type { ApiError } from "@/lib/api";

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-xs text-slate-400 shadow-xs">
      <span className="inline-block w-3 h-3 rounded-full border-2 border-blue-600 border-t-transparent animate-spin align-middle mr-2" />
      {label}
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <p className="font-bold">Could not load data from the API</p>
        <p className="mt-0.5 break-words">
          {error.message} <span className="font-mono text-rose-600">({error.code})</span>
        </p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="self-start sm:self-center shrink-0 bg-white border border-rose-200 hover:bg-rose-100 text-rose-700 font-semibold px-3.5 py-1.5 rounded-xl cursor-pointer"
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyBlock({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center">
      <p className="text-sm font-bold text-slate-700">{title}</p>
      {description && <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">{description}</p>}
      {children && <div className="mt-4 flex justify-center">{children}</div>}
    </div>
  );
}

export function Toast({ message, tone = "success", onClose }: { message: string; tone?: "success" | "error"; onClose: () => void }) {
  const styles =
    tone === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : "bg-rose-50 border-rose-200 text-rose-800";
  return (
    <div className={`${styles} border text-xs px-4 py-2.5 rounded-xl font-medium flex items-center justify-between shadow-xs`}>
      <span>{message}</span>
      <button type="button" onClick={onClose} className="font-bold opacity-70 hover:opacity-100 cursor-pointer pl-3">
        ✕
      </button>
    </div>
  );
}
