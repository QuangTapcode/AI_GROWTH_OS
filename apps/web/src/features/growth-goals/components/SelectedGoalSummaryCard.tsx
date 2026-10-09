import React from "react";
import type { GoalItem } from "../types";
import styles from "../GrowthGoalsView.module.css";

interface SelectedGoalSummaryCardProps {
  goal: GoalItem;
}

export function SelectedGoalSummaryCard({ goal }: SelectedGoalSummaryCardProps) {
  return (
    <section className={styles.card}>
      <span className={styles.summaryHeaderLabel}>SELECTED GOAL SUMMARY</span>
      <h3 className={styles.summaryTitle}>{goal.title}</h3>

      <div className={styles.summaryMetaRow}>
        <div className={styles.metaItem}>
          <span>Traffic growth target:</span>
          <span className={styles.metaHighlightBlue}>
            {goal.trafficGrowthTarget}
          </span>
        </div>

        <span className={styles.metaSeparator}>·</span>

        <div className={styles.metaItem}>
          <span>Period:</span>
          <span className={styles.metaBold}>{goal.period}</span>
        </div>

        <span className={styles.metaSeparator}>·</span>

        <div className={styles.metaItem}>
          <span>Primary conversion:</span>
          <span className={styles.metaBold}>{goal.primaryConversion}</span>
        </div>

        <span className={styles.metaSeparator}>·</span>

        <div className={styles.metaItem}>
          <span>Budget:</span>
          <span className={styles.metaBold}>{goal.budget}</span>
        </div>

        <span className={styles.metaSeparator}>·</span>

        <div className={styles.metaItem}>
          <span>Status:</span>
          {goal.status === "Active" ? (
            <span className={styles.statusBadgeActive}>
              <span className={styles.statusDotActive} />
              Active
            </span>
          ) : (
            <span className={styles.statusBadgeDraft}>Draft</span>
          )}
        </div>
      </div>

      <div className={styles.targetVisitsPill}>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#2563eb"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        <span>
          Target qualified visits: <strong>{goal.targetQualifiedVisits}</strong>
        </span>
      </div>
    </section>
  );
}
