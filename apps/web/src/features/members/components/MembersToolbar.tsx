import React from "react";
import styles from "../MembersTab.module.css";

interface MembersToolbarProps {
  totalCount: number;
  rolesInUseCount: number;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  roleFilter: string;
  onRoleFilterChange: (val: string) => void;
}

export function MembersToolbar({
  totalCount,
  rolesInUseCount,
  searchQuery,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
}: MembersToolbarProps) {
  return (
    <div className={styles.toolbar}>
      {/* Left Badges */}
      <div className={styles.badgeGroup}>
        <span className={styles.countBadge}>{totalCount} members</span>
        <span className={styles.rolesBadge}>{rolesInUseCount} roles in use</span>
      </div>

      {/* Right Filter Inputs */}
      <div className={styles.filterGroup}>
        {/* Search Box */}
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search members..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Role Dropdown */}
        <div className={styles.roleSelectWrap}>
          <select
            className={styles.roleSelect}
            value={roleFilter}
            onChange={(e) => onRoleFilterChange(e.target.value)}
          >
            <option value="all">All roles</option>
            <option value="Owner">Owner</option>
            <option value="Editor">Editor</option>
            <option value="Viewer">Viewer</option>
          </select>
          <span className={styles.selectChevron}>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}
