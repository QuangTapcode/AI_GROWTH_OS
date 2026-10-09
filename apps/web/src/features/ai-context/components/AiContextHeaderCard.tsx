import React from "react";
import styles from "../AiContextTab.module.css";

interface AiContextHeaderCardProps {
  onEdit: () => void;
}

export function AiContextHeaderCard({ onEdit }: AiContextHeaderCardProps) {
  return (
    <section className={styles.headerCard}>
      <div className={styles.headerLeft}>
        <div className={styles.headerIconCircle}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
        <div className={styles.headerText}>
          <h2 className={styles.headerTitle}>AI context</h2>
          <p className={styles.headerSubtitle}>
            Give AI the business context it needs to make relevant growth
            decisions and recommendations.
          </p>
        </div>
      </div>

      <button
        type="button"
        className={styles.cardEditBtn}
        onClick={onEdit}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        <span>Edit AI context</span>
      </button>
    </section>
  );
}
