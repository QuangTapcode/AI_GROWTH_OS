"use client";

import React from "react";

export interface KpiCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  comparisonText?: string;
  icon?: React.ReactNode;
  iconBg?: string;
  className?: string;
  badge?: string;
}

export default function KpiCard({
  label,
  value,
  change,
  changeType = "positive",
  comparisonText = "so với kỳ trước",
  icon,
  iconBg = "bg-blue-50 text-blue-600 border-blue-100/60",
  className = "",
  badge,
}: KpiCardProps) {
  const changeStyles = {
    positive: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    negative: "bg-rose-50 text-rose-700 border-rose-200/80",
    neutral: "bg-slate-100 text-slate-600 border-slate-200/80",
  };

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 flex flex-col justify-between h-full transition-all duration-200 hover:border-slate-300 hover:shadow-sm ${className}`}
    >
      {/* Top row: Label & Icon */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 tracking-wide">
              {label}
            </span>
            {badge && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {badge}
              </span>
            )}
          </div>
        </div>
        {icon && (
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconBg}`}
          >
            {icon}
          </div>
        )}
      </div>

      {/* Middle row: Large Value */}
      <div className="my-1">
        <div className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight leading-none">
          {value}
        </div>
      </div>

      {/* Bottom row: Trend & Comparison Text */}
      {(change || comparisonText) && (
        <div className="flex items-center flex-wrap gap-2 pt-3 mt-2 border-t border-slate-100 text-xs">
          {change && (
            <span
              className={`inline-flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full border text-[11px] ${
                changeStyles[changeType]
              }`}
            >
              {changeType === "positive" && "↑"}
              {changeType === "negative" && "↓"}
              {change}
            </span>
          )}
          {comparisonText && (
            <span className="text-slate-500 font-normal">
              {comparisonText}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
