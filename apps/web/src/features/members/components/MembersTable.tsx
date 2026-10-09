import React, { useState, useRef } from "react";
import type { MemberItem, RoleType } from "../types";
import { useClickOutside } from "@/hooks/useClickOutside";
import styles from "../MembersTab.module.css";

interface MembersTableProps {
  members: MemberItem[];
  onRemoveMember: (id: string) => void;
  onChangeRole: (id: string, newRole: RoleType) => void;
  onCopyEmail: (email: string) => void;
}

export function MembersTable({
  members,
  onRemoveMember,
  onChangeRole,
  onCopyEmail,
}: MembersTableProps) {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setActiveMenuId(null), Boolean(activeMenuId));

  return (
    <section className={styles.tableCard}>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>MEMBER</th>
              <th className={styles.th}>EMAIL</th>
              <th className={styles.th}>ROLE</th>
              <th className={styles.th}>STATUS</th>
              <th className={styles.th}>JOINED</th>
              <th className={`${styles.th} ${styles.actionsCell}`}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.emptyState}>
                  No members match your search or filter.
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <tr key={member.id} className={styles.tr}>
                  {/* Member Column */}
                  <td className={styles.td}>
                    <div className={styles.memberCol}>
                      <div
                        className={styles.avatar}
                        style={{ backgroundColor: member.avatarBg }}
                      >
                        {member.initials}
                      </div>
                      <div className={styles.memberText}>
                        <div className={styles.memberNameWrap}>
                          <span className={styles.memberName}>{member.name}</span>
                          {member.isYou && (
                            <span className={styles.youBadge}>(You)</span>
                          )}
                        </div>
                        <span className={styles.memberSubtitle}>
                          {member.subtitle}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Email Column */}
                  <td className={styles.td}>
                    <span className={styles.emailText}>{member.email}</span>
                  </td>

                  {/* Role Column */}
                  <td className={styles.td}>
                    {member.role === "Owner" && (
                      <span className={`${styles.rolePill} ${styles.roleOwner}`}>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        <span>Owner</span>
                      </span>
                    )}

                    {member.role === "Editor" && (
                      <span className={`${styles.rolePill} ${styles.roleEditor}`}>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        <span>Editor</span>
                      </span>
                    )}

                    {member.role === "Viewer" && (
                      <span className={`${styles.rolePill} ${styles.roleViewer}`}>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                        >
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>Viewer</span>
                      </span>
                    )}
                  </td>

                  {/* Status Column */}
                  <td className={styles.td}>
                    <div className={styles.statusCol}>
                      <span className={styles.statusDot} />
                      <span>{member.status}</span>
                    </div>
                  </td>

                  {/* Joined Column */}
                  <td className={styles.td}>
                    <span className={styles.joinedText}>{member.joined}</span>
                  </td>

                  {/* Actions Column */}
                  <td className={`${styles.td} ${styles.actionsCell}`}>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(
                          activeMenuId === member.id ? null : member.id
                        );
                      }}
                      aria-label="Actions"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <circle cx="12" cy="5" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="12" cy="19" r="1.8" />
                      </svg>
                    </button>

                    {/* Dropdown Menu */}
                    {activeMenuId === member.id && (
                      <div ref={menuRef} className={styles.actionMenu}>
                        <button
                          type="button"
                          className={styles.actionMenuItem}
                          onClick={() => {
                            onCopyEmail(member.email);
                            setActiveMenuId(null);
                          }}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <rect
                              x="9"
                              y="9"
                              width="13"
                              height="13"
                              rx="2"
                              ry="2"
                            />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          Copy email
                        </button>

                        {member.role !== "Editor" && (
                          <button
                            type="button"
                            className={styles.actionMenuItem}
                            onClick={() => {
                              onChangeRole(member.id, "Editor");
                              setActiveMenuId(null);
                            }}
                          >
                            Make Editor
                          </button>
                        )}

                        {member.role !== "Viewer" && !member.isYou && (
                          <button
                            type="button"
                            className={styles.actionMenuItem}
                            onClick={() => {
                              onChangeRole(member.id, "Viewer");
                              setActiveMenuId(null);
                            }}
                          >
                            Make Viewer
                          </button>
                        )}

                        {member.role !== "Owner" && (
                          <button
                            type="button"
                            className={styles.actionMenuItem}
                            onClick={() => {
                              onChangeRole(member.id, "Owner");
                              setActiveMenuId(null);
                            }}
                          >
                            Make Owner
                          </button>
                        )}

                        {!member.isYou && (
                          <button
                            type="button"
                            className={`${styles.actionMenuItem} ${styles.actionMenuItemDanger}`}
                            onClick={() => {
                              onRemoveMember(member.id);
                              setActiveMenuId(null);
                            }}
                          >
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            Remove member
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
