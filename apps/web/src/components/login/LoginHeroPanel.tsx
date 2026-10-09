import React from "react";
import styles from "./LoginHeroPanel.module.css";

/**
 * Right-side hero panel for the login page.
 * Displays a dark visual background with floating dashboard metric cards
 * to showcase the product's value proposition.
 */
export default function LoginHeroPanel() {
  return (
    <div className={styles.heroPanel}>
      {/* Background gradient layers */}
      <div className={styles.bgGradient} />
      <div className={styles.bgWaves} />
      <div className={styles.bgGlow} />

      {/* Floating metric cards */}
      <div className={styles.cardsContainer}>
        {/* SEO Score pill */}
        <div className={`${styles.card} ${styles.seoPill}`}>
          <span className={styles.greenDot} />
          <span className={styles.seoLabel}>SEO Score: <strong>94.0</strong></span>
          <span className={styles.seoDivider} />
          <span className={styles.seoLabel}>Content: <strong>92.5</strong></span>
          <span className={styles.seoCheck}>✓</span>
        </div>

        {/* Growth Target card */}
        <div className={`${styles.card} ${styles.growthCard}`}>
          <span className={styles.cardBadge}>GROWTH TARGET</span>
          <div className={styles.growthValue}>
            <span className={styles.bigNumber}>+50%</span>
            <div className={styles.progressRing}>
              <svg width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="16" fill="none" stroke="#e8ecf4" strokeWidth="3" />
                <circle
                  cx="20" cy="20" r="16"
                  fill="none"
                  stroke="#4A7BF7"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="100.5"
                  strokeDashoffset="30"
                  transform="rotate(-90 20 20)"
                />
              </svg>
            </div>
          </div>
          <span className={styles.growthSub}>Qualified traffic</span>
        </div>

        {/* Visits badge */}
        <div className={`${styles.card} ${styles.visitsBadge}`}>
          <span className={styles.visitsNumber}>63,240 visits</span>
          <span className={styles.visitsChange}>+52.4% vs baseline</span>
        </div>

        {/* Chart card */}
        <div className={`${styles.card} ${styles.chartCard}`}>
          <div className={styles.chartHeader}>
            <span className={styles.chartLabel}>On Track</span>
          </div>
          <div className={styles.chartArea}>
            <svg viewBox="0 0 280 120" className={styles.chartSvg}>
              {/* Grid lines */}
              <line x1="0" y1="20" x2="280" y2="20" stroke="#e8ecf4" strokeWidth="0.5" />
              <line x1="0" y1="50" x2="280" y2="50" stroke="#e8ecf4" strokeWidth="0.5" />
              <line x1="0" y1="80" x2="280" y2="80" stroke="#e8ecf4" strokeWidth="0.5" />

              {/* Y-axis labels */}
              <text x="0" y="16" fill="#94a3b8" fontSize="9">60K</text>
              <text x="0" y="46" fill="#94a3b8" fontSize="9">45K</text>
              <text x="0" y="76" fill="#94a3b8" fontSize="9">30K</text>
              <text x="0" y="106" fill="#94a3b8" fontSize="9">15K</text>

              {/* X-axis labels */}
              <text x="40" y="118" fill="#94a3b8" fontSize="9" textAnchor="middle">Jan</text>
              <text x="110" y="118" fill="#94a3b8" fontSize="9" textAnchor="middle">Feb</text>
              <text x="180" y="118" fill="#94a3b8" fontSize="9" textAnchor="middle">Mar</text>
              <text x="250" y="118" fill="#94a3b8" fontSize="9" textAnchor="middle">Apr</text>

              {/* Area gradient */}
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4A7BF7" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#4A7BF7" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M30,95 L70,88 L110,80 L150,65 L190,48 L230,40 L270,30 L270,105 L30,105 Z"
                fill="url(#chartGradient)"
              />

              {/* Line */}
              <polyline
                points="30,95 70,88 110,80 150,65 190,48 230,40 270,30"
                fill="none"
                stroke="#4A7BF7"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Data points */}
              <circle cx="110" cy="80" r="3.5" fill="#fff" stroke="#4A7BF7" strokeWidth="2" />
              <circle cx="190" cy="48" r="3.5" fill="#fff" stroke="#4A7BF7" strokeWidth="2" />
              <circle cx="270" cy="30" r="5" fill="#fff" stroke="#4A7BF7" strokeWidth="2.5" />
            </svg>
          </div>
        </div>

        {/* Organic Traffic card */}
        <div className={`${styles.card} ${styles.organicCard}`}>
          <span className={styles.organicLabel}>ORGANIC TRAFFIC</span>
          <div className={styles.organicValue}>
            <span className={styles.organicNumber}>190</span>
            <span className={styles.organicChange}>+30.8%</span>
          </div>
          <span className={styles.organicSub}>vs prior day</span>
          <svg viewBox="0 0 100 30" className={styles.miniChart}>
            <polyline
              points="0,25 15,22 30,18 45,20 60,14 75,10 100,5"
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Bottom text overlay */}
      <div className={styles.heroText}>
        <h2 className={styles.heroTitle}>AI Growth OS</h2>
        <p className={styles.heroSubtitle}>
          Turn growth data into actionable opportunities.
        </p>
        <p className={styles.heroDesc}>
          Discover opportunities, generate content, optimize SEO, and measure growth with AI-powered workflows.
        </p>
        <div className={styles.workspacePill}>
          <span className={styles.wsGreenDot} />
          Workspace: TripC Da Nang · Active
        </div>
      </div>
    </div>
  );
}
