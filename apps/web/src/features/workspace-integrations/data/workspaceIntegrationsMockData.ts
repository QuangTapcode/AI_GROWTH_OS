import {
  WorkspaceProfile,
  BrandTone,
  TeamMember,
  WorkspaceIntegrationItem,
} from "../types";

export const MOCK_WORKSPACE_PROFILE: WorkspaceProfile = {
  name: "TripC — Curated Travel Collective",
  slug: "tripc",
  website: "https://tripc.ai",
  industry: "Travel & Hospitality",
  targetMarkets: "Da Nang, Hoi An, Hue, Phu Quoc (Vietnam)",
  timezone: "UTC+7 (Indochina Time)",
  status: "Active • Engines Nominal",
  createdAt: "Oct 2026",
  summary:
    "Curated hospitality and independent travel platform delivering verified stay intelligence, boutique guides, and experiential itineraries in Southeast Asia.",
  targetAudience:
    "Digital nomads, remote founders, and design-conscious boutique travelers (ages 24–42) seeking high-intent local travel curation.",
  coreOfferings:
    "Verified boutique hotel reviews, remote work neighborhood dossiers, culinary guides, and curated travel itineraries.",
  growthGoalLabel: "Qualified Traffic Expansion (Q4 2026)",
  currentTraffic: 12480,
  targetTraffic: 25000,
  currentLeads: 246,
  targetLeads: 500,
};

export const MOCK_BRAND_TONES: BrandTone[] = [
  { label: "Authoritative & Objective", weight: "75%", type: "tone" },
  { label: "Inspiring & Evocative", weight: "85%", type: "tone" },
  { label: "Warm & Culturally Nuanced", weight: "90%", type: "tone" },
  { label: "Unpretentious & Grounded", weight: "80%", type: "tone" },
];

export const MOCK_BRAND_RULES: BrandTone[] = [
  { label: "Zero generic marketing hype or salesy clichés", weight: "Strict", type: "rule" },
  { label: "Verify Wi-Fi speeds (>50 Mbps) for all recommended stays", weight: "Essential", type: "rule" },
  { label: "Highlight local architectural, craft, and culinary heritage", weight: "Priority", type: "rule" },
  { label: "Eco-certified and sustainable property preference", weight: "Preferred", type: "eco" },
];

export const MOCK_TEAM_MEMBERS: TeamMember[] = [
  {
    id: "mem_1",
    name: "Alex Morgan",
    email: "alex@tripc.ai",
    role: "Owner",
    status: "Active now",
    avatarClass: "bg-blue-600",
    initials: "AM",
  },
  {
    id: "mem_2",
    name: "Sarah Chen",
    email: "sarah@tripc.ai",
    role: "Editor",
    status: "Active 2h ago",
    avatarClass: "bg-purple-600",
    initials: "SC",
  },
  {
    id: "mem_3",
    name: "Marcus Vance",
    email: "marcus@tripc.ai",
    role: "Editor",
    status: "Active yesterday",
    avatarClass: "bg-emerald-600",
    initials: "MV",
  },
  {
    id: "mem_4",
    name: "Linh Nguyen",
    email: "linh@tripc.ai",
    role: "Viewer",
    status: "Invited • Pending",
    avatarClass: "bg-amber-600",
    initials: "LN",
  },
];

export const MOCK_INTEGRATIONS: WorkspaceIntegrationItem[] = [
  {
    id: "ga4",
    name: "Google Analytics 4",
    category: "analytics",
    categoryLabel: "Analytics & Telemetry",
    description:
      "Measures high-intent visitor sessions, landing page engagement, and qualified lead conversion events.",
    status: "connected",
    statusLabel: "Connected",
    account: "Measurement Stream: tripc-web-prod (G-TRIPC9410)",
    lastSync: "10 mins ago",
  },
  {
    id: "gsc",
    name: "Google Search Console",
    category: "analytics",
    categoryLabel: "Analytics & Telemetry",
    description:
      "Syncs query impressions, SERP keyword average positions, and organic search indexation health.",
    status: "connected",
    statusLabel: "Connected",
    account: "Verified Domain Property: sc-domain:tripc.ai",
    lastSync: "25 mins ago",
  },
  {
    id: "cms",
    name: "TripC Headless CMS",
    category: "cms",
    categoryLabel: "Content Management",
    description:
      "Automated publication webhook target for verified guides, articles, and neighborhood dossiers.",
    status: "connected",
    statusLabel: "Connected",
    account: "Webhook: https://tripc.travel/api/v1/webhook/cms",
    lastSync: "42 mins ago",
  },
  {
    id: "linkedin",
    name: "LinkedIn Professional",
    category: "social",
    categoryLabel: "Social & Distribution",
    description:
      "Multi-channel distribution of executive briefings, hospitality intelligence, and market insights.",
    status: "connected",
    statusLabel: "Connected",
    account: "TripC Travel Concierge Page",
    lastSync: "1 hour ago",
  },
  {
    id: "gemini",
    name: "Gemini 1.5 Pro AI Engine",
    category: "ai",
    categoryLabel: "AI & Knowledge",
    description:
      "Powers autonomous research, opportunity evaluation, content drafting, and SEO audits.",
    status: "connected",
    statusLabel: "Connected",
    account: "API Key Active • Quota 2.5M tokens/day",
    lastSync: "Real-time",
  },
  {
    id: "postgres",
    name: "PostgreSQL Core Data Warehouse",
    category: "ai",
    categoryLabel: "AI & Knowledge",
    description:
      "Production store for workspaces, agent traces, artifacts, and multi-tenant telemetry records.",
    status: "connected",
    statusLabel: "Connected",
    account: "Connected (Pool 20 connections nominal)",
    lastSync: "Real-time",
  },
];
