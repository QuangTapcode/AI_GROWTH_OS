import React from "react";
import styles from "../AiContextTab.module.css";

interface BusinessContextSectionProps {
  industry: string;
  businessOverview: string;
}

export function BusinessContextSection({
  industry,
  businessOverview,
}: BusinessContextSectionProps) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIcon}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
          <h3 className={styles.cardTitle}>Business context</h3>
        </div>
      </div>

      <div className={styles.businessGrid}>
        {/* Industry Col */}
        <div className={styles.metaCol}>
          <span className={styles.metaLabel}>Industry</span>
          <span className={styles.metaValueBold}>{industry}</span>
        </div>

        {/* Business Overview Col */}
        <div className={styles.metaCol}>
          <span className={styles.metaLabel}>Business overview</span>
          <div className={styles.calloutBox}>{businessOverview}</div>
        </div>
      </div>
    </section>
  );
}
