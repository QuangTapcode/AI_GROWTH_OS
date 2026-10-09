import React from "react";
import styles from "../MembersTab.module.css";

interface MembersHeaderProps {
  onInvite: () => void;
}

export function MembersHeader({ onInvite }: MembersHeaderProps) {
  return (
    <section className={styles.headerCard}>
      <div className={styles.headerTitleBlock}>
        <h2 className={styles.headerTitle}>Members</h2>
        <p className={styles.headerSubtitle}>
          Manage workspace members and their permissions.
        </p>
      </div>

      <button
        type="button"
        className={styles.inviteBtn}
        onClick={onInvite}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
        <span>+ Invite member</span>
      </button>
    </section>
  );
}
