"use client";

import React, { useState } from "react";
import DashboardSidebar, {
  DEFAULT_WORKSPACES,
  type WorkspaceItem,
} from "@/features/dashboard/components/DashboardSidebar";
import DashboardHeader from "@/features/dashboard/components/DashboardHeader";
import { MOCK_GROWTH_PERIODS } from "../data/growthResultsMockData";
import { SerpKeyword } from "../types";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function GrowthResultsClientView() {
  const { language, t } = useLanguage();
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceItem>(
    DEFAULT_WORKSPACES[0]
  );
  const [activeTab, setActiveTab] = useState("growth-results");

  // State
  const [selectedPeriod, setSelectedPeriod] = useState<"7D" | "30D" | "90D">("30D");
  const [granularity, setGranularity] = useState<"daily" | "weekly" | "monthly">("daily");
  const [keywordFilter, setKeywordFilter] = useState<"all" | "top3" | "top10" | "page2">("all");
  const [keywordSearch, setKeywordSearch] = useState<string>("");
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const data = MOCK_GROWTH_PERIODS[selectedPeriod];
  const chart = data.chart[granularity];

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleRefresh = () => {
    showToast(
      language === "vi"
        ? "Đã đồng bộ lại toàn bộ dữ liệu đo lường từ GA4 và Google Search Console."
        : "Re-synced telemetry feeds from GA4 and Google Search Console."
    );
  };

  const handleExportCsv = () => {
    // Generate CSV string
    const headers = "Keyword,Position,Change,Impressions,Clicks,CTR,TargetURL\n";
    const rows = data.keywords
      .map(
        (k) =>
          `"${k.keyword}",${k.position},${k.change},${k.impressions},${k.clicks},"${k.ctr}","${k.targetUrl}"`
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `TripC_Growth_Results_${selectedPeriod}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(
      language === "vi" ? "Đã xuất báo cáo CSV thành công!" : "CSV report exported successfully!"
    );
  };

  // SVG Chart Calculations
  const chartHeight = 220;
  const chartWidth = 760;
  const paddingX = 40;
  const paddingY = 24;
  const maxVal = Math.max(...chart.current, ...chart.previous) * 1.15 || 1000;

  const pointsCurrent = chart.current.map((val, idx) => {
    const x =
      paddingX +
      (idx / (chart.current.length - 1 || 1)) * (chartWidth - paddingX * 2);
    const y =
      chartHeight -
      paddingY -
      (val / maxVal) * (chartHeight - paddingY * 2);
    return { x, y, val, label: chart.labels[idx] };
  });

  const pointsPrevious = chart.previous.map((val, idx) => {
    const x =
      paddingX +
      (idx / (chart.previous.length - 1 || 1)) * (chartWidth - paddingX * 2);
    const y =
      chartHeight -
      paddingY -
      (val / maxVal) * (chartHeight - paddingY * 2);
    return { x, y, val };
  });

  // Build SVG path strings
  const currentPathStr = pointsCurrent.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ""
  );

  const currentAreaStr =
    pointsCurrent.length > 0
      ? `${currentPathStr} L ${pointsCurrent[pointsCurrent.length - 1].x} ${
          chartHeight - paddingY
        } L ${pointsCurrent[0].x} ${chartHeight - paddingY} Z`
      : "";

  const previousPathStr = pointsPrevious.reduce(
    (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
    ""
  );

  // Donut chart calculations
  const totalVisits = data.sources.reduce((sum, s) => sum + s.countNum, 0);
  let cumulativeAngle = 0;
  const donutSegments = data.sources.map((src) => {
    const angle = (src.countNum / totalVisits) * 360;
    const startAngle = cumulativeAngle;
    cumulativeAngle += angle;
    return { ...src, startAngle, angle };
  });

  // SERP Table Filtering
  const filteredKeywords = data.keywords.filter((kw: SerpKeyword) => {
    if (keywordFilter === "top3" && kw.position > 3) return false;
    if (keywordFilter === "top10" && (kw.position <= 3 || kw.position > 10)) return false;
    if (keywordFilter === "page2" && kw.position <= 10) return false;
    if (
      keywordSearch &&
      !kw.keyword.toLowerCase().includes(keywordSearch.toLowerCase()) &&
      !kw.targetUrl.toLowerCase().includes(keywordSearch.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return (
    <div className="app-container">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className="toast-notification active toast-success"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            background: "#ECFDF5",
            border: "1px solid #A7F3D0",
            color: "#065F46",
            padding: "14px 20px",
            borderRadius: "12px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15)",
            fontSize: "13px",
            fontWeight: 600,
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* ── Left Sidebar ── */}
      <DashboardSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        selectedWorkspace={currentWorkspace}
        onWorkspaceChange={setCurrentWorkspace}
      />

      {/* ── Main Content Area ── */}
      <div className="main-wrapper">
        <DashboardHeader
          workspaceName={currentWorkspace.name}
          currentPageTitle="Growth Results"
          searchPlaceholder={
            language === "vi"
              ? "Tìm kiếm từ khóa, chỉ số, báo cáo..."
              : "Search keywords, landing pages, attribution..."
          }
        />

        <main className="content-body">
          {/* A. HEADER ROW */}
          <div className="gr-header-row">
            <div>
              <div
                style={{
                  color: "var(--brand-accent)",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.6px",
                }}
              >
                GROWTH ANALYTICS &amp; ATTRIBUTION
              </div>
              <h1 className="gr-header-title">{t.growthResults.pageTitle}</h1>
              <p className="gr-header-desc">{t.growthResults.subtitle}</p>
            </div>

            <div className="gr-header-actions">
              {/* Period Selector */}
              <div className="gr-date-presets" role="group">
                {(["7D", "30D", "90D"] as const).map((period) => (
                  <button
                    key={period}
                    type="button"
                    onClick={() => setSelectedPeriod(period)}
                    className={`gr-date-btn ${
                      selectedPeriod === period ? "active" : ""
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>

              {/* Telemetry Refresh */}
              <button
                type="button"
                onClick={handleRefresh}
                className="btn btn-secondary gr-action-btn"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                {t.growthResults.refresh}
              </button>

              {/* Export CSV */}
              <button
                type="button"
                onClick={handleExportCsv}
                className="btn btn-primary gr-action-btn"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                {t.growthResults.exportCsv}
              </button>
            </div>
          </div>

          {/* B. 5 COMPACT KPI SUMMARY CARDS */}
          <section className="gr-section">
            <div className="gr-kpi-grid">
              {/* 1. North Star: Qualified Traffic */}
              <div className="gr-kpi-card" style={{ borderLeft: "4px solid #8B5CF6" }}>
                <div className="gr-kpi-label">QUALIFIED TRAFFIC (NORTH STAR)</div>
                <div className="gr-kpi-value-row">
                  <span className="gr-kpi-val">{data.kpis.northStar.value}</span>
                  <span className="gr-kpi-delta positive">
                    {data.kpis.northStar.delta}
                  </span>
                </div>
                <div className="gr-kpi-sub">{data.kpis.northStar.subtext}</div>
              </div>

              {/* 2. Organic Traffic */}
              <div className="gr-kpi-card">
                <div className="gr-kpi-label">ORGANIC SEARCH TRAFFIC</div>
                <div className="gr-kpi-value-row">
                  <span className="gr-kpi-val">{data.kpis.organicTraffic.value}</span>
                  <span className="gr-kpi-delta positive">
                    {data.kpis.organicTraffic.delta}
                  </span>
                </div>
                <div className="gr-kpi-sub">{data.kpis.organicTraffic.subtext}</div>
              </div>

              {/* 3. Organic Clicks */}
              <div className="gr-kpi-card">
                <div className="gr-kpi-label">ORGANIC CLICKS (GSC)</div>
                <div className="gr-kpi-value-row">
                  <span className="gr-kpi-val">{data.kpis.organicClicks.value}</span>
                  <span className="gr-kpi-delta positive">
                    {data.kpis.organicClicks.delta}
                  </span>
                </div>
                <div className="gr-kpi-sub">{data.kpis.organicClicks.subtext}</div>
              </div>

              {/* 4. Brand Search */}
              <div className="gr-kpi-card">
                <div className="gr-kpi-label">BRAND SEARCH VOLUME</div>
                <div className="gr-kpi-value-row">
                  <span className="gr-kpi-val">{data.kpis.brandSearch.value}</span>
                  <span className="gr-kpi-delta positive">
                    {data.kpis.brandSearch.delta}
                  </span>
                </div>
                <div className="gr-kpi-sub">{data.kpis.brandSearch.subtext}</div>
              </div>

              {/* 5. Qualified Leads */}
              <div className="gr-kpi-card" style={{ borderLeft: "4px solid #10B981" }}>
                <div className="gr-kpi-label">QUALIFIED LEADS</div>
                <div className="gr-kpi-value-row">
                  <span className="gr-kpi-val">{data.kpis.leads.value}</span>
                  <span className="gr-kpi-delta positive">
                    {data.kpis.leads.delta}
                  </span>
                </div>
                <div className="gr-kpi-sub">{data.kpis.leads.subtext}</div>
              </div>
            </div>
          </section>

          {/* C & D. ROW 1: MAIN TRAFFIC PERFORMANCE CHART (2/3) + TRAFFIC SOURCE DONUT (1/3) */}
          <section className="gr-section">
            <div className="gr-grid-2-1">
              {/* Traffic Performance Line/Area Chart */}
              <div className="gr-card gr-chart-card">
                <div className="gr-card-header">
                  <div>
                    <h3 className="gr-card-title">
                      {t.growthResults.trafficPerformance}
                    </h3>
                    <p className="gr-card-subtitle">
                      {t.growthResults.trafficSubtitle}
                    </p>
                  </div>

                  <div className="gr-chart-controls">
                    <div className="gr-granularity-switch" role="group">
                      {(["daily", "weekly", "monthly"] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setGranularity(g)}
                          className={`gr-gran-btn ${
                            granularity === g ? "active" : ""
                          }`}
                        >
                          {g.charAt(0).toUpperCase() + g.slice(1)}
                        </button>
                      ))}
                    </div>

                    <div className="gr-legend">
                      <span className="gr-legend-item">
                        <span
                          className="gr-legend-color"
                          style={{ background: "#8B5CF6" }}
                        />
                        <span>Current Period</span>
                      </span>
                      <span className="gr-legend-item">
                        <span
                          className="gr-legend-dash"
                          style={{ background: "#94A3B8" }}
                        />
                        <span>Previous Baseline</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Interactive SVG Area Chart */}
                <div
                  className="gr-chart-wrapper"
                  style={{ position: "relative", height: "240px" }}
                >
                  <svg
                    className="gr-chart-svg"
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    preserveAspectRatio="none"
                    style={{ width: "100%", height: "100%" }}
                  >
                    <defs>
                      <linearGradient
                        id="grAreaGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Grid lines */}
                    {[0.25, 0.5, 0.75, 1].map((pct) => (
                      <line
                        key={pct}
                        x1={paddingX}
                        y1={paddingY + (1 - pct) * (chartHeight - paddingY * 2)}
                        x2={chartWidth - paddingX}
                        y2={paddingY + (1 - pct) * (chartHeight - paddingY * 2)}
                        stroke="#E2E8F0"
                        strokeDasharray="4 4"
                      />
                    ))}

                    {/* Area fill */}
                    <path d={currentAreaStr} fill="url(#grAreaGradient)" />

                    {/* Previous period line (dashed) */}
                    <path
                      d={previousPathStr}
                      fill="none"
                      stroke="#94A3B8"
                      strokeWidth="2"
                      strokeDasharray="6 6"
                    />

                    {/* Current period line */}
                    <path
                      d={currentPathStr}
                      fill="none"
                      stroke="#8B5CF6"
                      strokeWidth="3"
                    />

                    {/* Interactive points */}
                    {pointsCurrent.map((pt, idx) => (
                      <g key={idx}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={hoveredPointIndex === idx ? "6" : "4"}
                          fill="#FFFFFF"
                          stroke="#8B5CF6"
                          strokeWidth="2.5"
                          style={{ cursor: "pointer", transition: "all 0.15s ease" }}
                          onMouseEnter={() => setHoveredPointIndex(idx)}
                          onMouseLeave={() => setHoveredPointIndex(null)}
                        />
                        {/* X-axis label */}
                        <text
                          x={pt.x}
                          y={chartHeight - 6}
                          fontSize="10"
                          fill="#64748B"
                          textAnchor="middle"
                          fontFamily="var(--font-sans)"
                        >
                          {pt.label}
                        </text>
                      </g>
                    ))}
                  </svg>

                  {/* Tooltip */}
                  {hoveredPointIndex !== null && pointsCurrent[hoveredPointIndex] && (
                    <div
                      style={{
                        position: "absolute",
                        left: `${
                          (pointsCurrent[hoveredPointIndex].x / chartWidth) * 100
                        }%`,
                        top: `${pointsCurrent[hoveredPointIndex].y - 45}px`,
                        transform: "translateX(-50%)",
                        background: "#0F172A",
                        color: "#FFFFFF",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        fontSize: "11px",
                        fontFamily: "var(--font-mono)",
                        pointerEvents: "none",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                        whiteSpace: "nowrap",
                        zIndex: 10,
                      }}
                    >
                      <div>
                        {pointsCurrent[hoveredPointIndex].label}:{" "}
                        <strong>
                          {pointsCurrent[hoveredPointIndex].val.toLocaleString()}{" "}
                          visits
                        </strong>
                      </div>
                      <div style={{ fontSize: "10px", color: "#94A3B8" }}>
                        Prior baseline:{" "}
                        {chart.previous[hoveredPointIndex]?.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Telemetry Summary Strip */}
                <div className="gr-summary-strip">
                  <div className="gr-strip-item">
                    <span className="gr-strip-label">PEAK PERFORMANCE:</span>
                    <strong className="gr-strip-val">{chart.peakText}</strong>
                  </div>
                  <div className="gr-strip-item">
                    <span className="gr-strip-label">AVG SESSION DURATION:</span>
                    <strong className="gr-strip-val">{chart.avgDuration}</strong>
                  </div>
                  <div className="gr-strip-item">
                    <span className="gr-strip-label">CONVERSION RATE:</span>
                    <strong className="gr-strip-val">{chart.convRate}</strong>
                  </div>
                  <div className="gr-strip-item">
                    <span className="gr-strip-label">TOP CONVERTING PAGE:</span>
                    <strong className="gr-strip-val">{chart.topPage}</strong>
                  </div>
                </div>
              </div>

              {/* Traffic Sources Donut Chart */}
              <div className="gr-card gr-donut-card">
                <div className="gr-card-header">
                  <div>
                    <h3 className="gr-card-title">{t.growthResults.trafficSources}</h3>
                    <p className="gr-card-subtitle">Channel share of qualified visits</p>
                  </div>
                </div>

                <div className="gr-donut-body">
                  <div className="gr-donut-svg-wrap" style={{ position: "relative" }}>
                    <svg viewBox="0 0 200 200" width="180" height="180">
                      <circle
                        cx="100"
                        cy="100"
                        r="70"
                        fill="none"
                        stroke="#E2E8F0"
                        strokeWidth="24"
                      />
                      {donutSegments.map((seg, idx) => {
                        const radius = 70;
                        const circumference = 2 * Math.PI * radius;
                        const strokeDasharray = `${
                          (seg.pct / 100) * circumference
                        } ${circumference}`;
                        const strokeDashoffset = -(
                          (seg.startAngle / 360) *
                          circumference
                        );

                        return (
                          <circle
                            key={idx}
                            cx="100"
                            cy="100"
                            r={radius}
                            fill="none"
                            stroke={seg.color}
                            strokeWidth="24"
                            strokeDasharray={strokeDasharray}
                            strokeDashoffset={strokeDashoffset}
                            transform="rotate(-90 100 100)"
                            style={{ transition: "stroke-dashoffset 0.5s ease" }}
                          />
                        );
                      })}
                      {/* Center Total Text */}
                      <text
                        x="100"
                        y="94"
                        textAnchor="middle"
                        fontSize="18"
                        fontWeight="800"
                        fill="var(--text-primary)"
                        fontFamily="var(--font-sans)"
                      >
                        {totalVisits.toLocaleString()}
                      </text>
                      <text
                        x="100"
                        y="112"
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill="var(--text-secondary)"
                        fontFamily="var(--font-sans)"
                      >
                        QUALIFIED VISITS
                      </text>
                    </svg>
                  </div>

                  {/* Donut Legend */}
                  <div className="gr-donut-legend">
                    {data.sources.map((src) => (
                      <div
                        key={src.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "12px",
                          padding: "4px 0",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span
                            style={{
                              width: "10px",
                              height: "10px",
                              borderRadius: "3px",
                              background: src.color,
                            }}
                          />
                          <span style={{ color: "var(--text-primary)" }}>
                            {src.name}
                          </span>
                        </div>
                        <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                          {src.pct}%{" "}
                          <span
                            style={{
                              fontWeight: 400,
                              color: "var(--text-secondary)",
                              fontSize: "11px",
                            }}
                          >
                            ({src.count})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* E & F. ROW 2: CHANNEL PERFORMANCE (1/2) + CONVERSION FUNNEL (1/2) */}
          <section className="gr-section">
            <div className="gr-grid-1-1">
              {/* Channel Performance Grouped Bar Chart */}
              <div className="gr-card">
                <div className="gr-card-header">
                  <div>
                    <h3 className="gr-card-title">
                      {t.growthResults.channelPerformance}
                    </h3>
                    <p className="gr-card-subtitle">
                      Current vs. prior cycle qualified visits by channel
                    </p>
                  </div>
                  <div className="gr-legend">
                    <span className="gr-legend-item">
                      <span
                        className="gr-legend-color"
                        style={{ background: "#3B82F6" }}
                      />
                      Current
                    </span>
                    <span className="gr-legend-item">
                      <span
                        className="gr-legend-color"
                        style={{ background: "#CBD5E1" }}
                      />
                      Previous
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
                  {data.channelComparison.map((channel, idx) => {
                    const maxBarVal = Math.max(
                      ...data.channelComparison.map((c) => Math.max(c.current, c.previous))
                    );
                    const curWidth = (channel.current / maxBarVal) * 100;
                    const prevWidth = (channel.previous / maxBarVal) * 100;

                    return (
                      <div key={idx}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "12px",
                            fontWeight: 600,
                            marginBottom: "4px",
                          }}
                        >
                          <span>{channel.name}</span>
                          <span style={{ color: "#047857", fontWeight: 700 }}>
                            {channel.lift}
                          </span>
                        </div>
                        {/* Current bar */}
                        <div
                          style={{
                            height: "12px",
                            background: "#EFF6FF",
                            borderRadius: "6px",
                            overflow: "hidden",
                            display: "flex",
                            marginBottom: "3px",
                          }}
                        >
                          <div
                            style={{
                              width: `${curWidth}%`,
                              background: "#3B82F6",
                              borderRadius: "6px",
                              transition: "width 0.4s ease",
                            }}
                          />
                        </div>
                        {/* Previous bar */}
                        <div
                          style={{
                            height: "8px",
                            background: "#F1F5F9",
                            borderRadius: "4px",
                            overflow: "hidden",
                            display: "flex",
                          }}
                        >
                          <div
                            style={{
                              width: `${prevWidth}%`,
                              background: "#CBD5E1",
                              borderRadius: "4px",
                              transition: "width 0.4s ease",
                            }}
                          />
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "10.5px",
                            color: "var(--text-secondary)",
                            marginTop: "2px",
                          }}
                        >
                          <span>Current: {channel.current.toLocaleString()}</span>
                          <span>Prior: {channel.previous.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Visual Conversion Funnel */}
              <div className="gr-card">
                <div className="gr-card-header">
                  <div>
                    <h3 className="gr-card-title">
                      {t.growthResults.conversionFunnel}
                    </h3>
                    <p className="gr-card-subtitle">
                      Stage qualification &amp; drop-off telemetry
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    marginTop: "16px",
                  }}
                >
                  {data.funnel.map((step, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: "12px 14px",
                        background: "#F8FAFC",
                        borderRadius: "10px",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "6px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span
                            style={{
                              width: "20px",
                              height: "20px",
                              borderRadius: "50%",
                              background: step.color,
                              color: "#FFFFFF",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "11px",
                              fontWeight: 700,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <strong style={{ fontSize: "12.5px", color: "var(--text-primary)" }}>
                            {step.stage}
                          </strong>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                            {step.count}
                          </strong>
                          <span
                            style={{
                              fontSize: "11px",
                              color: "var(--text-secondary)",
                              marginLeft: "6px",
                            }}
                          >
                            ({step.overallRate} total)
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          height: "6px",
                          background: "#E2E8F0",
                          borderRadius: "999px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: step.overallRate,
                            background: step.color,
                            borderRadius: "999px",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          fontSize: "10.5px",
                          color: "var(--text-secondary)",
                          marginTop: "6px",
                        }}
                      >
                        <span>Step retention: {step.stepRate}</span>
                        <span
                          style={{
                            color: step.dropOff === "Baseline" ? "#047857" : "#E11D48",
                            fontWeight: 600,
                          }}
                        >
                          Drop-off: {step.dropOff}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* G. SERP KEYWORD PERFORMANCE TABLE */}
          <div className="gr-card" style={{ marginTop: "8px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "16px",
              }}
            >
              <div>
                <h3 className="gr-card-title">{t.growthResults.serpPerformance}</h3>
                <p className="gr-card-subtitle">
                  High-intent ranking positions, click-through rates, and target cluster mapping
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                {/* Search */}
                <input
                  type="text"
                  value={keywordSearch}
                  onChange={(e) => setKeywordSearch(e.target.value)}
                  placeholder={language === "vi" ? "Lọc từ khóa..." : "Filter keywords..."}
                  style={{
                    padding: "6px 12px",
                    fontSize: "12px",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    background: "var(--surface)",
                    outline: "none",
                  }}
                />

                {/* Ranking Tier Filter Pills */}
                <div
                  style={{
                    display: "flex",
                    gap: "4px",
                    background: "var(--surface-subtle)",
                    padding: "3px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                  }}
                >
                  {[
                    { id: "all", label: language === "vi" ? "Tất cả" : "All" },
                    { id: "top3", label: "Top 3" },
                    { id: "top10", label: "Top 4–10" },
                    { id: "page2", label: "Page 2+" },
                  ].map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      onClick={() => setKeywordFilter(filter.id as any)}
                      style={{
                        padding: "4px 10px",
                        borderRadius: "6px",
                        fontSize: "11px",
                        fontWeight: 600,
                        cursor: "pointer",
                        border: "none",
                        background:
                          keywordFilter === filter.id ? "#FFFFFF" : "transparent",
                        color:
                          keywordFilter === filter.id
                            ? "var(--brand-accent)"
                            : "var(--text-secondary)",
                        boxShadow:
                          keywordFilter === filter.id
                            ? "0 1px 3px rgba(0,0,0,0.08)"
                            : "none",
                      }}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Keyword Table */}
            <div
              style={{
                overflowX: "auto",
                border: "1px solid var(--border)",
                borderRadius: "8px",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "12px",
                  textAlign: "left",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: "var(--surface-subtle)",
                      borderBottom: "1px solid var(--border)",
                      color: "var(--text-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    <th style={{ padding: "10px 14px" }}>KEYWORD QUERY</th>
                    <th style={{ padding: "10px 14px" }}>POSITION</th>
                    <th style={{ padding: "10px 14px" }}>IMPRESSIONS</th>
                    <th style={{ padding: "10px 14px" }}>CLICKS</th>
                    <th style={{ padding: "10px 14px" }}>CTR</th>
                    <th style={{ padding: "10px 14px" }}>TARGET DESTINATION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredKeywords.map((kw, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: "1px solid var(--border-light)",
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--surface-hover)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "transparent")
                      }
                    >
                      <td style={{ padding: "12px 14px" }}>
                        <span
                          style={{
                            fontWeight: 700,
                            color: "var(--text-primary)",
                          }}
                        >
                          {kw.keyword}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontWeight: 700,
                              fontSize: "13px",
                            }}
                          >
                            #{kw.position}
                          </span>
                          <span
                            style={{
                              fontSize: "10.5px",
                              fontWeight: 700,
                              padding: "1px 5px",
                              borderRadius: "4px",
                              background: kw.change >= 0 ? "#ECFDF5" : "#FFF1F2",
                              color: kw.change >= 0 ? "#047857" : "#E11D48",
                            }}
                          >
                            {kw.change > 0
                              ? `+${kw.change}`
                              : kw.change < 0
                              ? `${kw.change}`
                              : "—"}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)" }}>
                        {kw.impressions.toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)" }}>
                        {kw.clicks.toLocaleString()}
                      </td>
                      <td style={{ padding: "12px 14px", fontFamily: "var(--font-mono)", fontWeight: 700 }}>
                        {kw.ctr}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: "11px",
                            color: "var(--brand-accent)",
                          }}
                        >
                          {kw.targetUrl}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
