export interface WorkspaceProfile {
  name: string;
  slug: string;
  website: string;
  industry: string;
  targetMarkets: string;
  timezone: string;
  status: string;
  createdAt: string;
  summary: string;
  targetAudience: string;
  coreOfferings: string;
  growthGoalLabel: string;
  currentTraffic: number;
  targetTraffic: number;
  currentLeads: number;
  targetLeads: number;
}

export interface BrandTone {
  label: string;
  weight: string;
  type: "tone" | "language" | "rule" | "eco";
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "Owner" | "Admin" | "Editor" | "Viewer";
  status: string;
  avatarClass: string;
  initials: string;
}

export interface WorkspaceIntegrationItem {
  id: string;
  name: string;
  category: "analytics" | "cms" | "social" | "ai";
  categoryLabel: string;
  description: string;
  status: "connected" | "attention" | "available";
  statusLabel: string;
  account: string;
  lastSync: string;
}
