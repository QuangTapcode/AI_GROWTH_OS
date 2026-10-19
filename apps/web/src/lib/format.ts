import type { AgentRole } from "./apiTypes";

/** Tên hiển thị của 6 agent (services/ai/src/agents/registry.py). */
export const AGENT_LABELS: Record<AgentRole, string> = {
  research: "Research Agent",
  growth_lead: "Growth Lead Agent",
  seo: "SEO Agent",
  content: "Content Agent",
  community: "Community Agent",
  performance: "Performance Agent",
};

/** Operation mà từng agent hỗ trợ, khớp registry của AI service. */
export const AGENT_OPERATIONS: Record<AgentRole, string[]> = {
  research: ["research.run"],
  growth_lead: ["opportunity.score", "strategy.generate", "brief.generate", "learning.analyze"],
  seo: ["seo.audit", "seo.local_draft", "content.refresh"],
  content: ["content.generate", "content.repurpose", "content.quality_check"],
  community: ["community.response"],
  performance: ["analytics.report", "experiment.hypothesis"],
};

export const AGENT_ROLE_ORDER: AgentRole[] = ["research", "growth_lead", "seo", "content", "community", "performance"];

export function agentLabel(role: string): string {
  return AGENT_LABELS[role as AgentRole] ?? role;
}

export function operationLabel(operation: string): string {
  const words = operation.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function humanize(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Mã ngắn dễ đọc từ UUID, ví dụ TSK-1A2B3C. */
export function shortCode(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/-/g, "").slice(-6).toUpperCase()}`;
}

export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function durationBetween(start: string | null, end: string | null, now: number = Date.now()): number | null {
  if (!start) return null;
  return (end ? new Date(end).getTime() : now) - new Date(start).getTime();
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("en-US");
}

export function isToday(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  return new Date(iso).toDateString() === now.toDateString();
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const AVATAR_COLORS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-rose-500", "bg-sky-500"];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function roleLabel(role: string | undefined): string {
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : "";
}

/** Đọc field kiểu string trong payload JSON của task/artifact. */
export function payloadString(payload: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

export function payloadArray<T = Record<string, unknown>>(payload: Record<string, unknown> | null | undefined, key: string): T[] {
  const value = payload?.[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

/** SHA-256 hex trong trình duyệt, dùng làm content_hash khi tạo artifact version mới. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** YYYY-MM-DD theo giờ địa phương của trình duyệt (không dùng UTC để tránh lệch ngày). */
export function toIsoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
