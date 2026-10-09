import React from "react";
import type { SourceType } from "../types";
import styles from "../KnowledgeBaseView.module.css";

interface KnowledgeTypeTabsProps {
  activeTypeTab: "All" | SourceType;
  onSelectTypeTab: (tab: "All" | SourceType) => void;
  totalCount: number;
  textCount: number;
  pdfCount: number;
  urlCount: number;
}

export function KnowledgeTypeTabs({
  activeTypeTab,
  onSelectTypeTab,
  totalCount,
  textCount,
  pdfCount,
  urlCount,
}: KnowledgeTypeTabsProps) {
  return (
    <div className={styles.typeTabsRow}>
      <button
        type="button"
        className={`${styles.typeTabBtn} ${activeTypeTab === "All" ? styles.typeTabBtnActive : ""}`}
        onClick={() => onSelectTypeTab("All")}
      >
        <span>All</span>
        <span className={styles.typeTabBadge}>{totalCount}</span>
      </button>

      <button
        type="button"
        className={`${styles.typeTabBtn} ${activeTypeTab === "Text" ? styles.typeTabBtnActive : ""}`}
        onClick={() => onSelectTypeTab("Text")}
      >
        <span>Text</span>
        <span className={styles.typeTabBadge}>{textCount}</span>
      </button>

      <button
        type="button"
        className={`${styles.typeTabBtn} ${activeTypeTab === "PDF" ? styles.typeTabBtnActive : ""}`}
        onClick={() => onSelectTypeTab("PDF")}
      >
        <span>PDF</span>
        <span className={styles.typeTabBadge}>{pdfCount}</span>
      </button>

      <button
        type="button"
        className={`${styles.typeTabBtn} ${activeTypeTab === "URL" ? styles.typeTabBtnActive : ""}`}
        onClick={() => onSelectTypeTab("URL")}
      >
        <span>URL</span>
        <span className={styles.typeTabBadge}>{urlCount}</span>
      </button>
    </div>
  );
}
