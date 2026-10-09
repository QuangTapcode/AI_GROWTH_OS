import React from "react";
import type { KnowledgeSource } from "../types";
import styles from "../KnowledgeBaseView.module.css";

interface KnowledgeTableProps {
  sources: KnowledgeSource[];
  totalFilteredCount: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onSelectSource: (source: KnowledgeSource) => void;
  onDeleteSource: (id: string, e: React.MouseEvent) => void;
}

export function KnowledgeTable({
  sources,
  totalFilteredCount,
  currentPage,
  totalPages,
  onPageChange,
  onSelectSource,
  onDeleteSource,
}: KnowledgeTableProps) {
  return (
    <section className={styles.tableCard}>
      {/* Table Section Header */}
      <div className={styles.tableCardHeader}>
        <div className={styles.tableHeaderTitleBlock}>
          <h2 className={styles.tableHeaderTitle}>Knowledge sources</h2>
          <span className={styles.tableTotalBadge}>{totalFilteredCount} total</span>
        </div>
        <p className={styles.tableHint}>Click any row to view details</p>
      </div>

      {/* Table Content */}
      <div className={styles.tableResponsive}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th} style={{ width: "42%" }}>Source</th>
              <th className={styles.th} style={{ width: "16%" }}>Category</th>
              <th className={styles.th} style={{ width: "14%" }}>Type</th>
              <th className={styles.th} style={{ width: "16%" }}>Status</th>
              <th className={styles.th} style={{ width: "12%" }}>Added</th>
              <th className={`${styles.th} ${styles.actionsCell}`} style={{ width: "8%" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sources.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.emptyState}>
                  No knowledge sources found matching your filters.
                </td>
              </tr>
            ) : (
              sources.map((source, index) => (
                <tr
                  key={source.id}
                  className={styles.tableRow}
                  onClick={() => onSelectSource(source)}
                >
                  {/* Source Name Column */}
                  <td className={styles.td}>
                    <div className={styles.sourceCellWrap}>
                      {source.type === "PDF" && (
                        <span className={styles.fileIconPdf}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                          </svg>
                        </span>
                      )}
                      {source.type === "Text" && (
                        <span className={styles.fileIconText}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="21" y1="10" x2="3" y2="10" />
                            <line x1="21" y1="6" x2="3" y2="6" />
                            <line x1="21" y1="14" x2="3" y2="14" />
                            <line x1="21" y1="18" x2="3" y2="18" />
                          </svg>
                        </span>
                      )}

                      <div className={styles.sourceTextWrap}>
                        <span className={styles.sourceName} title={source.name}>
                          {source.name}
                        </span>
                        <span className={styles.sourceSub}>
                          {source.subtitle}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Category Column */}
                  <td className={styles.td}>
                    <span className={styles.categoryPill}>{source.category}</span>
                  </td>

                  {/* Type Column */}
                  <td className={styles.td}>
                    <span className={styles.typeText}>{source.type}</span>
                  </td>

                  {/* Status Column */}
                  <td className={styles.td}>
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
                  </td>

                  {/* Added Column */}
                  <td className={styles.td}>
                    <span className={styles.addedText}>{source.added}</span>
                  </td>

                  {/* Actions Column */}
                  <td className={`${styles.td} ${styles.actionsCell}`}>
                    {index === 0 ? (
                      <div className={styles.actionBtnRow}>
                        <button
                          type="button"
                          className={styles.actionIconBtn}
                          title="Edit / Review"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectSource(source);
                          }}
                        >
                          📝
                        </button>
                        <button
                          type="button"
                          className={`${styles.actionIconBtn} ${styles.actionIconBtnDanger}`}
                          title="Delete"
                          onClick={(e) => onDeleteSource(source.id, e)}
                        >
                          🗑
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.actionDotsBtn}
                        title="More options"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSource(source);
                        }}
                      >
                        ···
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className={styles.tableFooter}>
        <span className={styles.footerCountText}>
          Showing {sources.length} of {totalFilteredCount} knowledge sources
        </span>

        <div className={styles.paginationWrap}>
          <button
            type="button"
            className={styles.pageBtn}
            disabled={currentPage === 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          >
            Previous
          </button>

          <button
            type="button"
            className={`${styles.pageBtn} ${currentPage === 1 ? styles.pageBtnActive : ""}`}
            onClick={() => onPageChange(1)}
          >
            1
          </button>

          {totalPages >= 2 && (
            <button
              type="button"
              className={`${styles.pageBtn} ${currentPage === 2 ? styles.pageBtnActive : ""}`}
              onClick={() => onPageChange(2)}
            >
              2
            </button>
          )}

          {totalPages >= 3 && (
            <span className={styles.pageEllipsis}>...</span>
          )}

          {totalPages >= 4 && (
            <button
              type="button"
              className={`${styles.pageBtn} ${currentPage === 4 ? styles.pageBtnActive : ""}`}
              onClick={() => onPageChange(4)}
            >
              4
            </button>
          )}

          <button
            type="button"
            className={styles.pageBtn}
            disabled={currentPage === totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
