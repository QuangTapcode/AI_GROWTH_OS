"use client";

import React, { useState } from "react";
import type { GoalItem, GoalStatus, NewGoalPayload, FormKpiInput } from "../types";
import styles from "../GrowthGoalsView.module.css";

interface CreateGoalModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: GoalItem | null;
  onSave: (payload: NewGoalPayload, id?: string) => void;
}

export function CreateGoalModal({
  isOpen,
  onClose,
  initialData,
  onSave,
}: CreateGoalModalProps) {
  const [title, setTitle] = useState(initialData?.title || "");
  const [trafficGrowthTarget, setTrafficGrowthTarget] = useState(
    initialData
      ? initialData.trafficGrowthTarget.replace(/[%+]/g, "").trim()
      : ""
  );
  const [targetQualifiedVisits, setTargetQualifiedVisits] = useState(
    initialData
      ? initialData.targetQualifiedVisits.replace(/,/g, "").trim()
      : ""
  );
  const [period, setPeriod] = useState(initialData?.period || "90 days");
  const [primaryConversion, setPrimaryConversion] = useState(
    initialData?.primaryConversion || "Signup"
  );
  const [budget, setBudget] = useState(
    initialData
      ? initialData.budget.replace(/[^0-9.]/g, "").trim()
      : "0.00"
  );
  const status: GoalStatus = initialData?.status || "Active";

  // Initial KPIs as seen in screenshot: Organic traffic & Signups
  const [kpis, setKpis] = useState<FormKpiInput[]>(() => {
    if (initialData && initialData.kpis && initialData.kpis.length > 0) {
      return initialData.kpis.map((k) => ({
        id: k.id,
        name: k.name,
        baseline: String(k.baseline).replace(/,/g, ""),
        target: String(k.target).replace(/,/g, ""),
        current: String(k.current).replace(/,/g, ""),
      }));
    }
    return [
      {
        id: "kpi-seed-1",
        name: "Organic traffic",
        baseline: "42000",
        target: "58800",
        current: "42000",
      },
      {
        id: "kpi-seed-2",
        name: "Signups",
        baseline: "420",
        target: "700",
        current: "420",
      },
    ];
  });

  if (!isOpen) return null;

  const handleKpiChange = (
    index: number,
    field: keyof FormKpiInput,
    value: string
  ) => {
    setKpis((prev) =>
      prev.map((kpi, i) => (i === index ? { ...kpi, [field]: value } : kpi))
    );
  };

  const handleAddKpi = () => {
    setKpis((prev) => [
      ...prev,
      {
        id: `kpi-${Date.now()}`,
        name: "",
        baseline: "",
        target: "",
        current: "",
      },
    ]);
  };

  const handleDeleteKpi = (index: number) => {
    setKpis((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSave(
      {
        title: title.trim(),
        period: period.trim() || "90 days",
        status,
        trafficGrowthTarget: trafficGrowthTarget.trim()
          ? `${trafficGrowthTarget.trim()}%`
          : "+40%",
        primaryConversion: primaryConversion.trim() || "Signup",
        budget: budget.trim() ? `$${budget.trim()} USD` : "$0.00 USD",
        targetQualifiedVisits: targetQualifiedVisits.trim() || "58,800",
        kpis: kpis.filter((k) => k.name.trim() !== ""),
      },
      initialData?.id
    );
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
        {/* Modal Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleWrap}>
            <h3 className={styles.modalTitle}>
              {initialData ? "Edit goal" : "Create goal"}
            </h3>
            <p className={styles.modalSubtitle}>
              Define your growth objective and success metrics.
            </p>
          </div>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {/* Section 1: GOAL DETAILS */}
            <div className={styles.sectionHeaderLabel}>GOAL DETAILS</div>

            {/* Goal Title */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Goal title <span className={styles.requiredStar}>*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Increase organic traffic from international visitors"
                className={styles.formInput}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Two Column Row: Traffic growth target & Target qualified visits */}
            <div className={styles.formRowTwo}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Traffic growth target</label>
                <div className={styles.inputWithSuffix}>
                  <input
                    type="text"
                    placeholder="e.g. 40.00"
                    className={styles.formInput}
                    value={trafficGrowthTarget}
                    onChange={(e) => setTrafficGrowthTarget(e.target.value)}
                  />
                  <span className={styles.inputSuffix}>%</span>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Target qualified visits</label>
                <input
                  type="text"
                  placeholder="e.g. 58800"
                  className={styles.formInput}
                  value={targetQualifiedVisits}
                  onChange={(e) => setTargetQualifiedVisits(e.target.value)}
                />
              </div>
            </div>

            {/* Three Column Row: Period, Primary conversion, Budget USD */}
            <div className={styles.formRowThree}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Period</label>
                <div className={styles.selectWrapper}>
                  <select
                    className={styles.formSelect}
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                  >
                    <option value="30 days">30 days</option>
                    <option value="45 days">45 days</option>
                    <option value="60 days">60 days</option>
                    <option value="90 days">90 days</option>
                    <option value="180 days">180 days</option>
                  </select>
                  <svg
                    className={styles.selectChevron}
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#64748b"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Primary conversion</label>
                <div className={styles.selectWrapper}>
                  <select
                    className={styles.formSelect}
                    value={primaryConversion}
                    onChange={(e) => setPrimaryConversion(e.target.value)}
                  >
                    <option value="Signup">Signup</option>
                    <option value="Demo Request">Demo Request</option>
                    <option value="Self-serve Signup">Self-serve Signup</option>
                    <option value="Partner Onboarded">Partner Onboarded</option>
                    <option value="Lead Inquiries">Lead Inquiries</option>
                  </select>
                  <svg
                    className={styles.selectChevron}
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#64748b"
                    strokeWidth="2.5"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Budget USD</label>
                <div className={styles.budgetInputGroup}>
                  <span className={styles.budgetPrefix}>$</span>
                  <input
                    type="text"
                    placeholder="0.00"
                    className={styles.budgetInput}
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                  <span className={styles.budgetSuffix}>USD</span>
                </div>
              </div>
            </div>

            {/* Section 2: KPI setup */}
            <div className={styles.kpiSetupSection}>
              <div className={styles.kpiSectionHeader}>
                <div className={styles.kpiTitleWrap}>
                  <span className={styles.kpiTitle}>KPI setup</span>
                  <span className={styles.optionalBadge}>Optional</span>
                </div>
                <button
                  type="button"
                  className={styles.addKpiBtn}
                  onClick={handleAddKpi}
                >
                  + Add KPI
                </button>
              </div>
              <p className={styles.kpiSubtitle}>
                Optionally configure supporting metrics for this goal
              </p>

              {/* KPI Table Box */}
              <div className={styles.kpiTableBox}>
                <table className={styles.kpiTable}>
                  <thead>
                    <tr>
                      <th className={styles.kpiTh} style={{ width: "42%" }}>
                        KPI name
                      </th>
                      <th className={styles.kpiTh} style={{ width: "18%" }}>
                        Baseline
                      </th>
                      <th className={styles.kpiTh} style={{ width: "18%" }}>
                        Target
                      </th>
                      <th className={styles.kpiTh} style={{ width: "18%" }}>
                        Current
                      </th>
                      <th className={styles.kpiTh} style={{ width: "4%" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {kpis.map((kpi, idx) => (
                      <tr key={kpi.id || idx} className={styles.kpiTr}>
                        <td className={styles.kpiTd}>
                          <input
                            type="text"
                            placeholder="e.g. Organic traffic"
                            className={styles.kpiInput}
                            value={kpi.name}
                            onChange={(e) =>
                              handleKpiChange(idx, "name", e.target.value)
                            }
                          />
                        </td>
                        <td className={styles.kpiTd}>
                          <input
                            type="text"
                            placeholder="42000"
                            className={styles.kpiInput}
                            value={kpi.baseline}
                            onChange={(e) =>
                              handleKpiChange(idx, "baseline", e.target.value)
                            }
                          />
                        </td>
                        <td className={styles.kpiTd}>
                          <input
                            type="text"
                            placeholder="58800"
                            className={styles.kpiInput}
                            value={kpi.target}
                            onChange={(e) =>
                              handleKpiChange(idx, "target", e.target.value)
                            }
                          />
                        </td>
                        <td className={styles.kpiTd}>
                          <input
                            type="text"
                            placeholder="42000"
                            className={styles.kpiInputCurrent}
                            value={kpi.current}
                            onChange={(e) =>
                              handleKpiChange(idx, "current", e.target.value)
                            }
                          />
                        </td>
                        <td className={styles.kpiTd} style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className={styles.kpiDeleteBtn}
                            onClick={() => handleDeleteKpi(idx)}
                            title="Delete KPI"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn}>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{initialData ? "Save changes" : "Create goal"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
