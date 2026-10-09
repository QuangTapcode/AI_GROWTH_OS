import React from "react";
import styles from "../KnowledgeBaseView.module.css";

interface KnowledgeKpiCardsProps {
  totalSourcesCount: number;
  processingCount: number;
  approvedCount: number;
  needsReviewCount: number;
}

export function KnowledgeKpiCards({
  totalSourcesCount,
  processingCount,
  approvedCount,
  needsReviewCount,
}: KnowledgeKpiCardsProps) {
  return (
    <div className={styles.kpiGrid}>
      {/* Total sources */}
      <div className={styles.kpiCard}>
        <div className={styles.kpiTop}>
          <span className={styles.kpiLabel}>Total sources</span>
          <span className={styles.kpiIconBlue}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </span>
        </div>
        <div className={styles.kpiValueRow}>
          <span className={styles.kpiValue}>{totalSourcesCount}</span>
        </div>
      </div>

      {/* Processing */}
      <div className={styles.kpiCard}>
        <div className={styles.kpiTop}>
          <span className={styles.kpiLabel}>Processing</span>
          <span className={styles.kpiIconAmber}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </span>
        </div>
        <div className={styles.kpiValueRow}>
          <span className={styles.kpiValue}>{processingCount}</span>
          <span className={styles.processingDot} />
        </div>
      </div>

      {/* Approved */}
      <div className={styles.kpiCard}>
        <div className={styles.kpiTop}>
          <span className={styles.kpiLabel}>Approved</span>
          <span className={styles.kpiIconGreen}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </span>
        </div>
        <div className={styles.kpiValueRow}>
          <span className={styles.kpiValue}>{approvedCount}</span>
        </div>
      </div>

      {/* Needs review */}
      <div className={styles.kpiCard}>
        <div className={styles.kpiTop}>
          <span className={styles.kpiLabel}>Needs review</span>
          <span className={styles.kpiIconRed}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
        </div>
        <div className={styles.kpiValueRow}>
          <span className={styles.kpiValue}>{needsReviewCount}</span>
        </div>
      </div>
    </div>
  );
}
