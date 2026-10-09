import React, { useState } from "react";
import type { NewMemberPayload, RoleType } from "../types";
import styles from "../MembersTab.module.css";

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (payload: NewMemberPayload) => void;
}

export function InviteMemberModal({
  isOpen,
  onClose,
  onInvite,
}: InviteMemberModalProps) {
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleType>("Editor");
  const [inviteSubtitle, setInviteSubtitle] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) return;

    onInvite({
      name: inviteName.trim(),
      email: inviteEmail.trim(),
      role: inviteRole,
      subtitle: inviteSubtitle.trim() || "Team Member",
    });

    setInviteName("");
    setInviteEmail("");
    setInviteSubtitle("");
    setInviteRole("Editor");
    onClose();
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        className={styles.modalContent}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Invite team member</h3>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Full name</label>
              <input
                type="text"
                required
                placeholder="e.g. Dang Quoc Cuong"
                className={styles.formInput}
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Email address</label>
              <input
                type="email"
                required
                placeholder="e.g. cuong@tripc.vn"
                className={styles.formInput}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Role</label>
              <select
                className={styles.formSelect}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as RoleType)}
              >
                <option value="Editor">Editor - Can manage and edit content</option>
                <option value="Viewer">Viewer - Can view reports and results</option>
                <option value="Owner">Owner - Full workspace control</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Job title / subtitle</label>
              <input
                type="text"
                placeholder="e.g. Marketing Lead"
                className={styles.formInput}
                value={inviteSubtitle}
                onChange={(e) => setInviteSubtitle(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn}>
              Send invitation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
