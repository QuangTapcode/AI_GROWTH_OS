import React from "react";
import styles from "./Badge.module.css";

export type StatusType =
  | "Approved"
  | "Processing"
  | "Imported"
  | "Needs review"
  | "Active"
  | "Pending"
  | "Inactive";

export interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const getVariantClass = () => {
    switch (status) {
      case "Approved":
        return styles.statusApproved;
      case "Active":
        return styles.statusActive;
      case "Processing":
        return styles.statusProcessing;
      case "Pending":
        return styles.statusPending;
      case "Imported":
        return styles.statusImported;
      case "Inactive":
        return styles.statusInactive;
      case "Needs review":
        return styles.statusNeedsReview;
      default:
        return styles.statusImported;
    }
  };

  return (
    <span className={`${styles.statusPill} ${getVariantClass()} ${className || ""}`}>
      <span className={styles.statusDot} />
      <span>{status}</span>
    </span>
  );
}

export interface CategoryBadgeProps {
  category: string;
  className?: string;
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  return (
    <span className={`${styles.categoryPill} ${className || ""}`}>
      {category}
    </span>
  );
}
