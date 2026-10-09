import React from "react";
import styles from "../AiContextTab.module.css";

interface BrandContextSectionProps {
  brandVoice: string;
  tone: string;
  brandGuidelines: string;
  forbiddenTerms: string[];
  onEditBrand: () => void;
}

export function BrandContextSection({
  brandVoice,
  tone,
  brandGuidelines,
  forbiddenTerms,
  onEditBrand,
}: BrandContextSectionProps) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 0 1-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z" />
            </svg>
          </div>
          <h3 className={styles.cardTitle}>Brand context</h3>
        </div>

        <button
          type="button"
          className={styles.cardActionBtn}
          onClick={onEditBrand}
        >
          Edit brand context
        </button>
      </div>

      <div className={styles.brandContextGrid}>
        <div className={styles.metaCol}>
          <span className={styles.metaLabel}>Brand voice</span>
          <span className={styles.metaValueBold}>{brandVoice}</span>
        </div>
        <div className={styles.metaCol}>
          <span className={styles.metaLabel}>Tone</span>
          <span className={styles.metaValueBold}>{tone}</span>
        </div>
      </div>

      <div className={styles.metaCol} style={{ marginBottom: "16px" }}>
        <span className={styles.metaLabel}>Brand guidelines</span>
        <div className={styles.calloutBox}>{brandGuidelines}</div>
      </div>

      <div className={styles.metaCol}>
        <span className={styles.metaLabel} style={{ marginBottom: "6px" }}>
          Forbidden terms
        </span>
        <div className={styles.pillsRow}>
          {forbiddenTerms.map((term, idx) => (
            <span key={idx} className={styles.forbiddenPill}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
              <span>{term}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
