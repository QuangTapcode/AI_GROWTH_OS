import React from "react";
import type { GoalItem } from "../types";
import styles from "../GrowthGoalsView.module.css";

interface WorkspaceGoalsCardProps {
  goals: GoalItem[];
  selectedGoalId: string;
  onSelectGoal: (id: string) => void;
  onEditGoal: (goal: GoalItem) => void;
  onDeleteGoal: (id: string) => void;
}

export function WorkspaceGoalsCard({
  goals,
  selectedGoalId,
  onSelectGoal,
  onEditGoal,
  onDeleteGoal,
}: WorkspaceGoalsCardProps) {
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleRow}>
          <h2 className={styles.cardTitle}>Workspace goals</h2>
          <span className={styles.countBadge}>{goals.length} goals</span>
        </div>
        <p className={styles.cardSubtitle}>
          Select a goal to inspect its details and performance.
        </p>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Goal title</th>
              <th className={styles.th}>Period</th>
              <th className={styles.th}>Avg process</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th} style={{ textAlign: "right" }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {goals.map((goal) => {
              const isSelected = goal.id === selectedGoalId;
              const radius = 13;
              const circumference = 2 * Math.PI * radius; // ~81.68
              const strokeDashoffset =
                circumference - (goal.avgProgress / 100) * circumference;

              return (
                <tr
                  key={goal.id}
                  className={`${styles.tr} ${isSelected ? styles.trSelected : ""}`}
                  onClick={() => onSelectGoal(goal.id)}
                >
                  {/* Goal title */}
                  <td className={styles.td}>
                    <div className={styles.goalTitleCol}>
                      <span
                        className={`${styles.goalDot} ${
                          isSelected ? styles.goalDotActive : ""
                        }`}
                      />
                      <span className={styles.goalTitleText}>{goal.title}</span>
                    </div>
                  </td>

                  {/* Period */}
                  <td className={styles.td}>
                    <span className={styles.periodText}>{goal.period}</span>
                  </td>

                  {/* Avg process circular ring */}
                  <td className={styles.td}>
                    <div className={styles.circularProgressWrap}>
                      <svg width="34" height="34" viewBox="0 0 34 34">
                        {/* Background track */}
                        <circle
                          cx="17"
                          cy="17"
                          r={radius}
                          fill="none"
                          stroke="#f1f5f9"
                          strokeWidth="3.2"
                        />
                        {/* Progress arc (red/coral accent as in screenshot) */}
                        <circle
                          cx="17"
                          cy="17"
                          r={radius}
                          fill="none"
                          stroke="#f43f5e"
                          strokeWidth="3.2"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          transform="rotate(-90 17 17)"
                        />
                        {/* Percentage Text */}
                        <text
                          x="17"
                          y="18"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="9.5"
                          fontWeight="700"
                          fill="#0f172a"
                        >
                          {goal.avgProgress}%
                        </text>
                      </svg>
                    </div>
                  </td>

                  {/* Status */}
                  <td className={styles.td}>
                    {goal.status === "Active" ? (
                      <span className={styles.statusBadgeActive}>
                        <span className={styles.statusDotActive} />
                        Active
                      </span>
                    ) : (
                      <span className={styles.statusBadgeDraft}>Draft</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className={styles.td} style={{ textAlign: "right" }}>
                    <div
                      className={styles.actionBtnGroup}
                      style={{ justifyContent: "flex-end" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={`${styles.actionIconBtn} ${styles.editIconBtn}`}
                        title="Edit goal"
                        onClick={() => onEditGoal(goal)}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>

                      <button
                        type="button"
                        className={`${styles.actionIconBtn} ${styles.deleteIconBtn}`}
                        title="Delete goal"
                        onClick={() => onDeleteGoal(goal.id)}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
