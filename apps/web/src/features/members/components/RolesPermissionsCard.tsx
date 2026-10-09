import React from "react";
import styles from "../MembersTab.module.css";

export function RolesPermissionsCard() {
  return (
    <section className={styles.rolesCard}>
      <div className={styles.rolesHeader}>
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#2563eb"
          strokeWidth="2.2"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
        <h3 className={styles.rolesTitle}>Roles & permissions</h3>
      </div>

      <div className={styles.rolesGrid}>
        {/* Owner Role Box */}
        <div className={styles.roleDescCard}>
          <div className={styles.roleDescHeader}>
            <span className={styles.roleDescDotBlue} />
            <span className={styles.roleDescName}>Owner</span>
          </div>
          <p className={styles.roleDescText}>Full workspace control</p>
        </div>

        {/* Editor Role Box */}
        <div className={styles.roleDescCard}>
          <div className={styles.roleDescHeader}>
            <span className={styles.roleDescDotBlue} />
            <span className={styles.roleDescName}>Editor</span>
          </div>
          <p className={styles.roleDescText}>
            Can manage and edit workspace content and operational data
          </p>
        </div>

        {/* Viewer Role Box */}
        <div className={styles.roleDescCard}>
          <div className={styles.roleDescHeader}>
            <span className={styles.roleDescDotGray} />
            <span className={styles.roleDescName}>Viewer</span>
          </div>
          <p className={styles.roleDescText}>
            Can view reports and results but cannot edit or approve posts
          </p>
        </div>
      </div>
    </section>
  );
}
