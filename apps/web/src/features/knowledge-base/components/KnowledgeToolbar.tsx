import React from "react";
import styles from "../KnowledgeBaseView.module.css";

interface KnowledgeToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
}

export function KnowledgeToolbar({
  searchQuery,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  statusFilter,
  onStatusFilterChange,
}: KnowledgeToolbarProps) {
  return (
    <div className={styles.toolbar}>
      {/* Search Input */}
      <div className={styles.searchBox}>
        <svg
          className={styles.searchIcon}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2.5"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search sources..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      {/* Filter Selects */}
      <div className={styles.filtersGroup}>
        <div className={styles.selectWrapper}>
          <select
            className={styles.filterSelect}
            value={categoryFilter}
            onChange={(e) => onCategoryFilterChange(e.target.value)}
          >
            <option value="all">All categories</option>
            <option value="Company">Company</option>
            <option value="Pricing">Pricing</option>
            <option value="FAQ">FAQ</option>
            <option value="Brand">Brand</option>
            <option value="Policy">Policy</option>
            <option value="Products">Products</option>
            <option value="Services">Services</option>
          </select>
          <span className={styles.selectChevron}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>

        <div className={styles.selectWrapper}>
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="Approved">Approved</option>
            <option value="Processing">Processing</option>
            <option value="Needs review">Needs review</option>
            <option value="Imported">Imported</option>
          </select>
          <span className={styles.selectChevron}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
