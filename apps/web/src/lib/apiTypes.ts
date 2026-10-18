/** Kiểu dữ liệu trả về từ API (apps/api), giữ nguyên tên field snake_case của BE. */

export type Role = "owner" | "editor" | "viewer";

export type AgentRole = "research" | "growth_lead" | "seo" | "content" | "community" | "performance";

export type TaskStatus =
  | "pending"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "awaiting_approval"
  | "cancelled";

export interface LoginResponse {
  access_token: string;
  token_type: "Bearer";
  expires_at: string;
  user: { id: string; email: string; full_name: string; avatar_url: string | null };
}

export interface MeResponse {
  user: { id: string; email: string; full_name: string; avatar_url: string | null; last_login_at: string | null };
  workspaces: Array<{ workspace_id: string; name: string; slug: string; role: Role }>;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  default_language: string;
  created_at: string;
  updated_at: string;
  role?: Role;
}

export interface WorkflowTask {
  id: string;
  workspace_id: string;
  campaign_id: string | null;
  role: AgentRole;
  operation: string;
  status: TaskStatus;
  priority: number;
  input_version: number;
  context_snapshot_id: string | null;
  payload: Record<string, unknown>;
  result_ref: string | null;
  error_details: Record<string, unknown> | null;
  retry_count: number;
  max_retries: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  dependencies: string[];
}

export interface CreateTaskInput {
  role: AgentRole;
  operation: string;
  priority?: number;
  campaign_id?: string | null;
  dependencies?: string[];
  payload?: Record<string, unknown>;
}

export interface ContentArtifact {
  id: string;
  workspace_id: string;
  task_id: string | null;
  version: number;
  content_hash: string;
  context_snapshot_id: string | null;
  role: AgentRole;
  operation: string;
  artifact_type: string;
  title: string;
  storage: "ai_run_store" | "postgres_ledger";
  payload: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
  created_at: string;
}

export interface CreateArtifactInput {
  task_id?: string | null;
  version: number;
  content_hash: string;
  role: AgentRole;
  operation: string;
  artifact_type: string;
  title: string;
  storage?: "ai_run_store" | "postgres_ledger";
  payload: Record<string, unknown>;
  evidence: Array<Record<string, unknown>>;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "revoked";

export interface Approval {
  id: string;
  workspace_id: string;
  target_type: "source" | "content" | "artifact" | "task" | "campaign";
  target_id: string;
  target_version: number;
  target_hash: string;
  status: ApprovalStatus;
  decision: "approve" | "reject" | "revoke" | null;
  actor_id: string | null;
  actor_role: Role | null;
  review_note: string | null;
  invalidated_reason: string | null;
  invalidated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewApprovalInput {
  decision: "approve" | "reject" | "revoke";
  expected_version: number;
  expected_hash: string;
  review_note?: string | null;
}

export interface Campaign {
  id: string;
  workspace_id: string;
  name: string;
  utm_campaign: string;
  start_date: string | null;
  end_date: string | null;
}

export type MetricAvailability = "available" | "missing" | "partial" | "delayed";

export interface MetricItem {
  metric: string;
  value: number | null;
  availability: MetricAvailability;
  missing_reason: string | null;
  currency?: string;
}

export interface WorkspaceReport {
  workspace_id: string;
  period: { from: string; to: string; timezone: string; currency: string };
  kpis: Record<string, MetricItem>;
  summary: { total_leads: number; available_kpi_count: number; missing_kpi_count: number };
  generated_at: string;
}

export interface SystemException {
  id: string;
  workspace_id: string;
  code: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  source_task_id: string | null;
  assigned_owner: string | null;
  status: "open" | "investigating" | "resolved" | "ignored";
  description: string | null;
  resolution_note: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ListResponse<T> {
  items: T[];
}
