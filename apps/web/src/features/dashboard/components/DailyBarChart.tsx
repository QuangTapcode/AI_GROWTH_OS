"use client";

import React from "react";
import type { MetricSeries } from "@/lib/apiTypes";
import { formatNumber } from "@/lib/format";

/** Cột theo ngày cho chuỗi metrics; ngày không có snapshot available thì để trống (không vẽ 0). */
export default function DailyBarChart({ series, height = 180 }: { series: MetricSeries; height?: number }) {
  const days: string[] = [];
  for (let d = new Date(`${series.from}T00:00:00`); d <= new Date(`${series.to}T00:00:00`); d.setDate(d.getDate() + 1)) {
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  const byDate = new Map(
    series.points.filter((p) => p.availability === "available" && p.value !== null).map((p) => [p.date, p.value as number])
  );
  const max = Math.max(1, ...byDate.values());
  const width = 540;
  const left = 36;
  const bottom = 18;
  const barSlot = (width - left) / Math.max(days.length, 1);
  const plotHeight = height - bottom - 6;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img" aria-label={`${series.metric} per day`}>
      {[0, 0.5, 1].map((t) => {
        const y = 6 + plotHeight * (1 - t);
        return (
          <g key={t}>
            <line x1={left} y1={y} x2={width} y2={y} stroke="#f1f5f9" />
            <text x={0} y={y + 3} fill="#94a3b8" fontSize="10">
              {formatNumber(Math.round(max * t))}
            </text>
          </g>
        );
      })}
      {days.map((day, i) => {
        const value = byDate.get(day);
        const x = left + i * barSlot + barSlot * 0.15;
        if (value === undefined) return null;
        const h = (value / max) * plotHeight;
        return (
          <rect key={day} x={x} y={6 + plotHeight - h} width={barSlot * 0.7} height={h} rx={2} fill="#2563eb">
            <title>{`${day}: ${formatNumber(value)}`}</title>
          </rect>
        );
      })}
      {days
        .filter((_, i) => i === 0 || i === days.length - 1 || i === Math.floor(days.length / 2))
        .map((day) => {
          const i = days.indexOf(day);
          return (
            <text key={day} x={left + i * barSlot + barSlot / 2} y={height - 4} fill="#94a3b8" fontSize="10" textAnchor="middle">
              {day.slice(5)}
            </text>
          );
        })}
    </svg>
  );
}
