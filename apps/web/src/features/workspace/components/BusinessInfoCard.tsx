import React, { useState } from "react";
import type { BusinessFormData } from "../types";
import styles from "../WorkspaceTab.module.css";

interface BusinessInfoCardProps {
  initialData: BusinessFormData;
}

export function BusinessInfoCard({ initialData }: BusinessInfoCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [data, setData] = useState<BusinessFormData>(initialData);

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 9l1-5h16l1 5v1a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9z"
                fill="#2563eb"
              />
              <rect
                x="4"
                y="11"
                width="16"
                height="10"
                rx="1"
                stroke="#2563eb"
                strokeWidth="2"
                fill="none"
              />
              <rect x="9" y="14" width="6" height="7" fill="#2563eb" />
            </svg>
          </div>
          <h2 className={styles.cardTitle}>Business information</h2>
        </div>
        <button
          type="button"
          className={styles.editBtn}
          onClick={() => setIsEditing(!isEditing)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0f172a"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          <span>{isEditing ? "Save" : "Edit"}</span>
        </button>
      </div>

      {isEditing ? (
        <div className={styles.editSection}>
          <div className={styles.editField}>
            <label>Industry</label>
            <input
              type="text"
              value={data.industry}
              onChange={(e) => setData({ ...data, industry: e.target.value })}
            />
          </div>
          <div className={styles.editField}>
            <label>Business overview</label>
            <textarea
              rows={3}
              value={data.overview}
              onChange={(e) => setData({ ...data, overview: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <div className={styles.businessContent}>
          <div className={styles.fieldBlock}>
            <span className={styles.metaLabel}>Industry</span>
            <span className={styles.metaValueBold}>{data.industry}</span>
          </div>

          <div className={styles.fieldBlock}>
            <span className={styles.metaLabel}>Business overview</span>
            <div className={styles.calloutBox}>{data.overview}</div>
          </div>
        </div>
      )}
    </section>
  );
}
