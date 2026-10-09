import React from "react";
import type { LocationItem } from "../types";
import styles from "../AiContextTab.module.css";

interface LocationsSectionProps {
  locations: LocationItem[];
  onAddLocation: () => void;
}

export function LocationsSection({
  locations,
  onAddLocation,
}: LocationsSectionProps) {
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
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
          </div>
          <h3 className={styles.cardTitle}>Locations</h3>
        </div>

        <button
          type="button"
          className={styles.cardActionBtn}
          onClick={onAddLocation}
        >
          + Add location
        </button>
      </div>

      {locations.map((loc) => (
        <div
          key={loc.id}
          className={loc.isPrimary ? styles.locationItem : styles.locationItemSecondary}
        >
          <div className={styles.locationLeft}>
            <span
              className={
                loc.isPrimary ? styles.locationIcon : styles.locationIconGray
              }
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </span>
            <span>{loc.name}</span>
          </div>
          {loc.isPrimary && <span className={styles.primaryBadge}>Primary</span>}
        </div>
      ))}
    </section>
  );
}
