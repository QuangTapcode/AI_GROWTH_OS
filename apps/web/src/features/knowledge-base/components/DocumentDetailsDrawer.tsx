"use client";

import React from "react";
import type { KnowledgeSource } from "../types";
import { getSourceRagChunks } from "../utils";
import styles from "../KnowledgeBaseView.module.css";

interface DocumentDetailsDrawerProps {
  source: KnowledgeSource | null;
  isOpen: boolean;
  isReindexing: boolean;
  onClose: () => void;
  onReindex: (id: string) => void;
  onDelete: (id: string) => void;
}

export function DocumentDetailsDrawer({
  source,
  isOpen,
  isReindexing,
  onClose,
  onReindex,
  onDelete,
}: DocumentDetailsDrawerProps) {
  if (!isOpen || !source) return null;

  const chunks = getSourceRagChunks(source);

  return (
    <div className={styles.drawerBackdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.drawerPanel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <div className={styles.drawerTitleBlock}>
            <h3 className={styles.drawerTitle}>Document details</h3>
            <p className={styles.drawerSubtitle}>
              Inspect source content and RAG processing.
            </p>
          </div>
          <button
            type="button"
            className={styles.drawerCloseBtn}
            onClick={onClose}
            aria-label="Close document details"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className={styles.drawerBody}>
          {/* Source Summary Card */}
          <div className={styles.sourceSummaryCard}>
            <div className={styles.sourceCardTopRow}>
              {source.type === "PDF" && (
                <span className={styles.fileIconPdf}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </span>
              )}
              {source.type === "URL" && (
                <span className={styles.fileIconUrl}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </span>
              )}
              {source.type === "Text" && (
                <span className={styles.fileIconText}>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="21" y1="10" x2="3" y2="10" />
                    <line x1="21" y1="6" x2="3" y2="6" />
                    <line x1="21" y1="14" x2="3" y2="14" />
                    <line x1="21" y1="18" x2="3" y2="18" />
                  </svg>
                </span>
              )}

              <div className={styles.sourceCardTitleBlock}>
                <span className={styles.sourceCardTitle} title={source.name}>
                  {source.name}
                </span>
                <span className={styles.sourceCardDate}>
                  Added on {source.added}
                </span>
              </div>
            </div>

            {/* 2x2 Metadata Grid */}
            <div className={styles.metaGrid}>
              <div className={styles.metaCard}>
                <span className={styles.metaLabel}>Category</span>
                <span className={styles.metaValue}>{source.category}</span>
              </div>
              <div className={styles.metaCard}>
                <span className={styles.metaLabel}>Type</span>
                <span className={styles.metaValue}>{source.type}</span>
              </div>
              <div className={styles.metaCard}>
                <span className={styles.metaLabel}>Status</span>
                <div className={styles.metaValue}>
                  {source.status === "Approved" && (
                    <span className={`${styles.statusPill} ${styles.statusApproved}`}>
                      <span className={styles.statusDot} />
                      <span>Approved</span>
                    </span>
                  )}
                  {source.status === "Processing" && (
                    <span className={`${styles.statusPill} ${styles.statusProcessing}`}>
                      <span className={styles.statusDot} />
                      <span>Processing</span>
                    </span>
                  )}
                  {source.status === "Imported" && (
                    <span className={`${styles.statusPill} ${styles.statusImported}`}>
                      <span className={styles.statusDot} />
                      <span>Imported</span>
                    </span>
                  )}
                  {source.status === "Needs review" && (
                    <span className={`${styles.statusPill} ${styles.statusNeedsReview}`}>
                      <span className={styles.statusDot} />
                      <span>Needs review</span>
                    </span>
                  )}
                </div>
              </div>
              <div className={styles.metaCard}>
                <span className={styles.metaLabel}>Version</span>
                <span className={styles.metaValue}>1</span>
              </div>
            </div>
          </div>

          {/* RAG Preview Section */}
          <div>
            <div className={styles.ragSectionHeader}>
              <h4 className={styles.ragTitle}>RAG preview</h4>
              <span className={styles.chunksCountBadge}>
                {chunks.length} chunks
              </span>
            </div>
            <p className={styles.ragSubtitle}>
              Preview the text chunks created for AI retrieval.
            </p>

            <div className={styles.chunksList}>
              {chunks.map((chunk) => (
                <div key={chunk.id} className={styles.chunkCard}>
                  <div className={styles.chunkCardHeader}>
                    <span className={styles.chunkName}>{chunk.name}</span>
                    {source.status === "Processing" || isReindexing ? (
                      <span className={styles.chunkProcessingBadge}>
                        <span className={styles.statusDot} />
                        <span>Embedding...</span>
                      </span>
                    ) : (
                      <span className={styles.chunkIndexedBadge}>
                        <span>Vector indexed</span>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    )}
                  </div>
                  <p className={styles.chunkQuote}>{chunk.text}</p>
                  <div className={styles.chunkFooterMeta}>
                    Model: {chunk.model} · Locator: {chunk.locator}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.reindexBtn}
            disabled={isReindexing}
            onClick={() => onReindex(source.id)}
          >
            {isReindexing ? "Re-indexing..." : "Re-index embeddings"}
          </button>
          <button
            type="button"
            className={styles.deleteSourceBtn}
            onClick={() => onDelete(source.id)}
          >
            Delete source
          </button>
        </div>
      </div>
    </div>
  );
}
