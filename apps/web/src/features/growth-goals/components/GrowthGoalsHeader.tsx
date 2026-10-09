import React from "react";
import styles from "../GrowthGoalsView.module.css";

interface GrowthGoalsHeaderProps {
  onCreateGoal: () => void;
}

export function GrowthGoalsHeader({ onCreateGoal }: GrowthGoalsHeaderProps) {
  return (
    <div className={styles.topHeader}>
      <div className={styles.titleBlock}>
        <h1 className={styles.pageTitle}>Growth goals</h1>
        <p className={styles.pageSubtitle}>
          Define your growth objectives, allocate budget, and track progress
          against your KPIs.
        </p>
      </div>

      <button
        type="button"
        className={styles.createBtn}
        onClick={onCreateGoal}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>+ Create goal</span>
      </button>
    </div>
  );
}
