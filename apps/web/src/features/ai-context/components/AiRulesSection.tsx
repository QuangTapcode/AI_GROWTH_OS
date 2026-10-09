import React from "react";
import styles from "../AiContextTab.module.css";

export function AiRulesSection() {
  return (
    <section className={styles.aiRulesCard}>
      <div className={styles.aiRulesHeader}>
        <div className={styles.aiRulesBadgeIcon}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div className={styles.aiRulesHeaderText}>
          <h3 className={styles.aiRulesTitle}>AI rules</h3>
          <p className={styles.aiRulesSubtitle}>
            Rules AI should follow when generating recommendations and content
            for this workspace.
          </p>
        </div>
      </div>

      <div className={styles.rulesGrid}>
        {/* Rule 1 */}
        <div className={styles.ruleBox}>
          <p className={styles.ruleText}>Do not hallucinate pricing.</p>
          <div className={styles.ruleIconRed}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
        </div>

        {/* Rule 2 */}
        <div className={styles.ruleBox}>
          <p className={styles.ruleText}>Do not invent business locations.</p>
          <div className={styles.ruleIconRed}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
        </div>

        {/* Rule 3 */}
        <div className={styles.ruleBox}>
          <p className={styles.ruleText}>
            Do not make unsupported guarantees.
          </p>
          <div className={styles.ruleIconRed}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
        </div>

        {/* Rule 4 */}
        <div className={styles.ruleBox}>
          <p className={styles.ruleText}>
            Use verified business information when making recommendations.
          </p>
          <div className={styles.ruleIconBlue}>
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}
