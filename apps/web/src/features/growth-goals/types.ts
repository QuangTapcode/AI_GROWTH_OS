export interface GoalKpiItem {
  id: string;
  name: string;
  type: "traffic" | "visits" | "signups" | "other";
  baseline: string | number;
  current: string | number;
  target: string | number;
  progressPercentage: number;
  progressRatioText: string;
}

export type GoalStatus = "Active" | "Draft" | "Completed";

export interface GoalItem {
  id: string;
  title: string;
  period: string; // e.g. "90 days"
  avgProgress: number; // e.g. 33
  status: GoalStatus;
  trafficGrowthTarget: string; // e.g. "+40%"
  primaryConversion: string; // e.g. "Signup"
  budget: string; // e.g. "$1,000.00 USD"
  targetQualifiedVisits: string; // e.g. "12,000"
  kpis: GoalKpiItem[];
}

export interface FormKpiInput {
  id?: string;
  name: string;
  baseline: string;
  target: string;
  current: string;
}

export interface NewGoalPayload {
  title: string;
  period: string;
  status: GoalStatus;
  trafficGrowthTarget: string;
  primaryConversion: string;
  budget: string;
  targetQualifiedVisits: string;
  kpis?: FormKpiInput[];
}
