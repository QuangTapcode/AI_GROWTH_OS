import React, { useState } from "react";
import type { WorkspaceFormData } from "../types";
import styles from "../WorkspaceTab.module.css";

interface WorkspaceInfoCardProps {
  initialData: WorkspaceFormData;
}

export function WorkspaceInfoCard({ initialData }: WorkspaceInfoCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [data, setData] = useState<WorkspaceFormData>(initialData);

  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2" fill="#2563eb" />
              <circle cx="9" cy="10" r="2.5" fill="#ffffff" />
              <path
                d="M5.5 16c0-1.5 1.5-2.5 3.5-2.5s3.5 1 3.5 2.5"
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="14"
                y1="9"
                x2="18"
                y2="9"
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <line
                x1="14"
                y1="13"
                x2="17"
                y2="13"
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <h2 className={styles.cardTitle}>Workspace information</h2>
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
        <div className={styles.editGrid}>
          <div className={styles.editField}>
            <label>Workspace name</label>
            <input
              type="text"
              value={data.workspaceName}
              onChange={(e) =>
                setData({ ...data, workspaceName: e.target.value })
              }
            />
          </div>
          <div className={styles.editField}>
            <label>Website</label>
            <input
              type="text"
              value={data.website}
              onChange={(e) => setData({ ...data, website: e.target.value })}
            />
          </div>
          <div className={styles.editField}>
            <label>Primary language</label>
            <input
              type="text"
              value={data.primaryLanguage}
              onChange={(e) =>
                setData({ ...data, primaryLanguage: e.target.value })
              }
            />
          </div>
          <div className={styles.editField}>
            <label>Organization</label>
            <input
              type="text"
              value={data.organization}
              onChange={(e) =>
                setData({ ...data, organization: e.target.value })
              }
            />
          </div>
        </div>
      ) : (
        <div className={styles.workspaceGrid}>
          <div className={styles.metaCol}>
            <span className={styles.metaLabel}>Workspace name</span>
            <span className={styles.metaValueBold}>{data.workspaceName}</span>
          </div>
          <div className={styles.metaCol}>
            <span className={styles.metaLabel}>Website</span>
            <a
              href={`https://${data.website}`}
              target="_blank"
              rel="noreferrer"
              className={styles.websiteLink}
            >
              <span>{data.website}</span>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#2563eb"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          </div>
          <div className={styles.metaCol}>
            <span className={styles.metaLabel}>Primary language</span>
            <span className={styles.langPill}>{data.primaryLanguage}</span>
          </div>
          <div className={styles.metaCol}>
            <span className={styles.metaLabel}>Organization</span>
            <span className={styles.metaValueBold}>{data.organization}</span>
          </div>
        </div>
      )}
    </section>
  );
}
