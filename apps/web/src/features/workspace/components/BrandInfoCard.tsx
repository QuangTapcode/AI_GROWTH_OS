import React, { useState } from "react";
import type { BrandFormData } from "../types";
import styles from "../WorkspaceTab.module.css";

interface BrandInfoCardProps {
  initialData: BrandFormData;
}

export function BrandInfoCard({ initialData }: BrandInfoCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [data, setData] = useState<BrandFormData>(initialData);

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="#2563eb"
                strokeWidth="2"
                fill="#eff6ff"
              />
              <path
                d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                stroke="#2563eb"
                strokeWidth="1.5"
              />
              <line
                x1="2"
                y1="12"
                x2="22"
                y2="12"
                stroke="#2563eb"
                strokeWidth="1.5"
              />
            </svg>
          </div>
          <h2 className={styles.cardTitle}>Brand information</h2>
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
          <div className={styles.twoColGrid}>
            <div className={styles.editField}>
              <label>Brand voice</label>
              <input
                type="text"
                value={data.brandVoice}
                onChange={(e) =>
                  setData({ ...data, brandVoice: e.target.value })
                }
              />
            </div>
            <div className={styles.editField}>
              <label>Tone</label>
              <input
                type="text"
                value={data.tone}
                onChange={(e) => setData({ ...data, tone: e.target.value })}
              />
            </div>
          </div>
          <div className={styles.editField}>
            <label>Brand guidelines</label>
            <textarea
              rows={3}
              value={data.guidelines}
              onChange={(e) =>
                setData({ ...data, guidelines: e.target.value })
              }
            />
          </div>
        </div>
      ) : (
        <div className={styles.brandContent}>
          {/* Top 2 Columns */}
          <div className={styles.twoColGrid}>
            <div className={styles.fieldBlock}>
              <span className={styles.metaLabel}>Brand voice</span>
              <span className={styles.metaValueBold}>{data.brandVoice}</span>
            </div>
            <div className={styles.fieldBlock}>
              <span className={styles.metaLabel}>Tone</span>
              <span className={styles.metaValueBold}>{data.tone}</span>
            </div>
          </div>

          {/* Brand guidelines Callout */}
          <div className={styles.fieldBlock}>
            <span className={styles.metaLabel}>Brand guidelines</span>
            <div className={styles.calloutBox}>{data.guidelines}</div>
          </div>

          {/* Forbidden terms */}
          <div className={styles.fieldBlock}>
            <span className={styles.metaLabel}>Forbidden terms</span>
            <div className={styles.forbiddenRow}>
              {data.forbiddenTerms.map((term, index) => (
                <span key={index} className={styles.forbiddenPill}>
                  &quot;{term}&quot;
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
