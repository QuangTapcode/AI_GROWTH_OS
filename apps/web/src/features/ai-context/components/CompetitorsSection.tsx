import React from "react";
import type { CompetitorItem } from "../types";
import styles from "../AiContextTab.module.css";

interface CompetitorsSectionProps {
  competitors: CompetitorItem[];
  onAddCompetitor: () => void;
}

export function CompetitorsSection({
  competitors,
  onAddCompetitor,
}: CompetitorsSectionProps) {
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
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </div>
          <h3 className={styles.cardTitle}>Competitors</h3>
        </div>

        <button
          type="button"
          className={styles.cardActionBtn}
          onClick={onAddCompetitor}
        >
          + Add competitor
        </button>
      </div>

      {competitors.map((comp) => (
        <div key={comp.id} className={styles.competitorItem}>
          <div className={styles.competitorTopRow}>
            <span className={styles.competitorName}>{comp.name}</span>
            <a
              href={`https://${comp.url}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.competitorUrl}
            >
              {comp.url}
            </a>
          </div>
          <p className={styles.competitorDesc}>{comp.description}</p>
        </div>
      ))}
    </section>
  );
}
