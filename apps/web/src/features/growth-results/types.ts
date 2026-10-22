export interface GrowthKpis {
  northStar: { value: string; delta: string; isPositive: boolean; subtext: string };
  organicTraffic: { value: string; delta: string; isPositive: boolean; subtext: string };
  organicClicks: { value: string; delta: string; isPositive: boolean; subtext: string };
  brandSearch: { value: string; delta: string; isPositive: boolean; subtext: string };
  leads: { value: string; delta: string; isPositive: boolean; subtext: string };
}

export interface ChartSeries {
  labels: string[];
  current: number[];
  previous: number[];
  leads: number[];
  peakText: string;
  avgDuration: string;
  convRate: string;
  topPage: string;
}

export interface TrafficSource {
  id: string;
  name: string;
  pct: number;
  count: string;
  countNum: number;
  color: string;
}

export interface ChannelComparison {
  name: string;
  current: number;
  previous: number;
  lift: string;
}

export interface FunnelStage {
  stage: string;
  count: string;
  countNum: number;
  stepRate: string;
  overallRate: string;
  dropOff: string;
  color: string;
}

export interface SerpKeyword {
  keyword: string;
  position: number;
  change: number; // e.g. +3, -1, 0
  impressions: number;
  clicks: number;
  ctr: string;
  targetUrl: string;
}

export interface PeriodGrowthData {
  label: string;
  updatedAt: string;
  kpis: GrowthKpis;
  chart: {
    daily: ChartSeries;
    weekly: ChartSeries;
    monthly: ChartSeries;
  };
  sources: TrafficSource[];
  channelComparison: ChannelComparison[];
  funnel: FunnelStage[];
  keywords: SerpKeyword[];
}
