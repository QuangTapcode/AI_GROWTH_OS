import React from "react";
import type { GoalKpiItem } from "../types";
import styles from "../GrowthGoalsView.module.css";

interface KpiPerformanceCardProps {
  kpis: GoalKpiItem[];
}

export function KpiPerformanceCard({ kpis }: KpiPerformanceCardProps) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleRow}>
          <h2 className={styles.cardTitle}>KPI performance</h2>
          <span className={styles.countBadge}>{kpis.length} KPIs</span>
        </div>
        <p className={styles.cardSubtitle}>
          Compare baseline, current performance, and target values for the
          selected goal.
        </p>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>KPI</th>
              <th className={styles.th}>Baseline</th>
              <th className={styles.th}>Current</th>
              <th className={styles.th}>Target</th>
              <th className={styles.th} style={{ minWidth: "220px" }}>
                Progress
              </th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((kpi) => (
              <tr key={kpi.id} className={styles.tr} style={{ cursor: "default" }}>
                {/* KPI Name & Icon */}
                <td className={styles.td}>
                  <div className={styles.kpiCol}>
                    <div
                      className={`${styles.kpiIconBox} ${
                        kpi.type === "traffic"
                          ? styles.kpiIconTraffic
                          : kpi.type === "signups"
                          ? styles.kpiIconSignups
                          : styles.kpiIconVisits
                      }`}
                    >
                      {kpi.type === "traffic" && (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                          <polyline points="17 6 23 6 23 12" />
                        </svg>
                      )}

                      {kpi.type === "visits" && (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      )}

                      {kpi.type === "signups" && (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <polyline points="16 11 18 13 22 9" />
                        </svg>
                      )}

                      {kpi.type === "other" && (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="8" x2="12" y2="12" />
                          <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                      )}
                    </div>
                    <span className={styles.kpiName}>{kpi.name}</span>
                  </div>
                </td>

                {/* Baseline */}
                <td className={styles.td}>
                  <span className={styles.baselineVal}>{kpi.baseline}</span>
                </td>

                {/* Current */}
                <td className={styles.td}>
                  <span className={styles.currentVal}>{kpi.current}</span>
                </td>

                {/* Target */}
                <td className={styles.td}>
                  <span className={styles.targetVal}>{kpi.target}</span>
                </td>

                {/* Progress */}
                <td className={styles.td}>
                  <div className={styles.progressCol}>
                    <div className={styles.progressTopRow}>
                      <span className={styles.progressRatio}>
                        {kpi.progressRatioText}
                      </span>
                      <span className={styles.progressPercent}>
                        {kpi.progressPercentage}%
                        {kpi.type === "traffic" ? " progress" : ""}
                      </span>
                    </div>
                    <div className={styles.progressBarTrack}>
                      <div
                        className={styles.progressBarFill}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.max(0, kpi.progressPercentage)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footnote Loop */}
      <div className={styles.loopFootnote}>
        <svg
          className={styles.loopIcon}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
        <span>
          Downstream AI growth loop: These KPIs continuously inform M04 Market
          intel research &amp; M05 Content factory briefs.
        </span>
      </div>
    </section>
  );
}
