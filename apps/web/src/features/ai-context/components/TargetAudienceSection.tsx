import React from "react";
import styles from "../AiContextTab.module.css";

interface TargetAudienceSectionProps {
  audienceTitle: string;
  demographics: string;
  painPoints: string[];
  interests: string[];
  onAddAudience: () => void;
}

export function TargetAudienceSection({
  audienceTitle,
  demographics,
  painPoints,
  interests,
  onAddAudience,
}: TargetAudienceSectionProps) {
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
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <h3 className={styles.cardTitle}>Target audience</h3>
        </div>

        <button
          type="button"
          className={styles.cardActionBtn}
          onClick={onAddAudience}
        >
          + Add audience
        </button>
      </div>

      <h4 className={styles.audienceTitle}>{audienceTitle}</h4>
      <div className={styles.demographicsLine}>
        Demographics:
        <span className={styles.demographicsVal}>{demographics}</span>
      </div>

      {/* Pain points Box */}
      <div className={styles.audienceSectionBox}>
        <span className={styles.audienceSectionLabel}>Pain points</span>
        <div className={styles.pillsRow}>
          {painPoints.map((point, idx) => (
            <span key={idx} className={styles.painPointPill}>
              {point}
            </span>
          ))}
        </div>
      </div>

      {/* Interests Box */}
      <div className={styles.audienceSectionBox}>
        <span className={styles.audienceSectionLabel}>Interests</span>
        <div className={styles.pillsRow}>
          {interests.map((int, idx) => (
            <span key={idx} className={styles.interestPill}>
              {int}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
