"use client";

import React, { useState } from "react";
import styles from "./GrowthGoalsView.module.css";
import { INITIAL_GOALS } from "./constants";
import type { GoalItem, GoalKpiItem, NewGoalPayload } from "./types";
import { GrowthGoalsHeader } from "./components/GrowthGoalsHeader";
import { WorkspaceGoalsCard } from "./components/WorkspaceGoalsCard";
import { SelectedGoalSummaryCard } from "./components/SelectedGoalSummaryCard";
import { KpiPerformanceCard } from "./components/KpiPerformanceCard";
import { CreateGoalModal } from "./components/CreateGoalModal";

export default function GrowthGoalsView() {
  const [goals, setGoals] = useState<GoalItem[]>(INITIAL_GOALS);
  const [selectedGoalId, setSelectedGoalId] = useState<string>(
    INITIAL_GOALS[0]?.id || ""
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalItem | null>(null);

  const selectedGoal =
    goals.find((g) => g.id === selectedGoalId) || goals[0];

  const handleCreateNew = () => {
    setEditingGoal(null);
    setIsModalOpen(true);
  };

  const handleEdit = (goal: GoalItem) => {
    setEditingGoal(goal);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setGoals((prev) => {
      const nextGoals = prev.filter((g) => g.id !== id);
      if (selectedGoalId === id && nextGoals.length > 0) {
        setSelectedGoalId(nextGoals[0].id);
      }
      return nextGoals;
    });
  };

  const handleSaveGoal = (payload: NewGoalPayload, id?: string) => {
    // Format traffic growth target
    const rawGrowth = payload.trafficGrowthTarget.replace(/[%+]/g, "").trim() || "40.00";
    const formattedGrowth = `+${rawGrowth}%`;

    // Format budget
    const rawBudget = payload.budget.replace(/[^0-9.]/g, "").trim() || "0.00";
    const formattedBudget = `$${Number(rawBudget).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;

    // Format target qualified visits
    const rawVisits = payload.targetQualifiedVisits.replace(/[^0-9]/g, "").trim() || "58800";
    const formattedVisits = Number(rawVisits).toLocaleString("en-US");

    // Format KPIs from form or default
    let formattedKpis: GoalKpiItem[] = [];
    if (payload.kpis && payload.kpis.length > 0) {
      formattedKpis = payload.kpis.map((k, idx) => {
        const baselineNum = parseFloat(k.baseline.replace(/,/g, "")) || 0;
        const targetNum = parseFloat(k.target.replace(/,/g, "")) || 1;
        const currentNum = parseFloat(k.current.replace(/,/g, "")) || 0;
        const progressPercentage = Math.round(Math.min(100, Math.max(0, (currentNum / targetNum) * 100)) * 10) / 10;
        const progressRatioText = `${Number(currentNum).toLocaleString("en-US")} / ${Number(targetNum).toLocaleString("en-US")}`;

        let kpiType: GoalKpiItem["type"] = "other";
        const lowerName = k.name.toLowerCase();
        if (lowerName.includes("traffic")) kpiType = "traffic";
        else if (lowerName.includes("visit") || lowerName.includes("inquir")) kpiType = "visits";
        else if (lowerName.includes("signup") || lowerName.includes("account") || lowerName.includes("partner")) kpiType = "signups";

        return {
          id: k.id || `kpi-${Date.now()}-${idx}`,
          name: k.name || `Metric ${idx + 1}`,
          type: kpiType,
          baseline: Number(baselineNum).toLocaleString("en-US"),
          current: Number(currentNum).toLocaleString("en-US"),
          target: Number(targetNum).toLocaleString("en-US"),
          progressPercentage,
          progressRatioText,
        };
      });
    }

    const avgProgress = formattedKpis.length > 0
      ? Math.round(formattedKpis.reduce((acc, k) => acc + k.progressPercentage, 0) / formattedKpis.length)
      : 33;

    if (id) {
      // Edit existing
      setGoals((prev) =>
        prev.map((g) => {
          if (g.id !== id) return g;
          return {
            ...g,
            title: payload.title,
            period: payload.period,
            status: payload.status,
            trafficGrowthTarget: formattedGrowth,
            primaryConversion: payload.primaryConversion,
            budget: formattedBudget,
            targetQualifiedVisits: formattedVisits,
            avgProgress: formattedKpis.length > 0 ? avgProgress : g.avgProgress,
            kpis: formattedKpis.length > 0 ? formattedKpis : g.kpis,
          };
        })
      );
    } else {
      // Create new
      const newId = `goal-${Date.now()}`;
      const newGoal: GoalItem = {
        id: newId,
        title: payload.title,
        period: payload.period,
        avgProgress: formattedKpis.length > 0 ? avgProgress : 33,
        status: payload.status || "Active",
        trafficGrowthTarget: formattedGrowth,
        primaryConversion: payload.primaryConversion,
        budget: formattedBudget,
        targetQualifiedVisits: formattedVisits,
        kpis: formattedKpis.length > 0 ? formattedKpis : [
          {
            id: `kpi-${Date.now()}-1`,
            name: "Organic traffic",
            type: "traffic",
            baseline: "42,000",
            current: "42,000",
            target: "58,800",
            progressPercentage: 71.4,
            progressRatioText: "42,000 / 58,800",
          },
          {
            id: `kpi-${Date.now()}-2`,
            name: payload.primaryConversion || "Signups",
            type: "signups",
            baseline: "420",
            current: "420",
            target: "700",
            progressPercentage: 60,
            progressRatioText: "420 / 700",
          },
        ],
      };

      setGoals((prev) => [newGoal, ...prev]);
      setSelectedGoalId(newId);
    }
  };

  return (
    <div className={styles.container}>
      {/* 1. Header */}
      <GrowthGoalsHeader onCreateGoal={handleCreateNew} />

      {/* 2. Workspace Goals Card */}
      <WorkspaceGoalsCard
        goals={goals}
        selectedGoalId={selectedGoal?.id || ""}
        onSelectGoal={setSelectedGoalId}
        onEditGoal={handleEdit}
        onDeleteGoal={handleDelete}
      />

      {/* 3. Selected Goal Summary Card */}
      {selectedGoal && <SelectedGoalSummaryCard goal={selectedGoal} />}

      {/* 4. KPI Performance Card */}
      {selectedGoal && <KpiPerformanceCard kpis={selectedGoal.kpis} />}

      {/* 5. Create / Edit Modal */}
      {isModalOpen && (
        <CreateGoalModal
          isOpen={true}
          onClose={() => setIsModalOpen(false)}
          initialData={editingGoal}
          onSave={handleSaveGoal}
        />
      )}
    </div>
  );
}
