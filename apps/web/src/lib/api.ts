import { clearSession, getSession } from "./session";
import type {
  Approval,
  BusinessProfile,
  Campaign,
  Channel,
  ContentArtifact,
  CreateArtifactInput,
  CreateTaskInput,
  IntegrationsResponse,
  Lead,
  ListResponse,
  LoginResponse,
  MeResponse,
  Member,
  MetricSeries,
  MetricSyncResponse,
  PublishingJob,
  ReviewApprovalInput,
  SystemException,
  UpdateBusinessProfileInput,
  WorkflowTask,
  WorkspaceReport,
} from "./apiTypes";

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/v1").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** false cho endpoint không cần đăng nhập (login) */
  auth?: boolean;
}

function redirectToLogin() {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/login")) return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`/login?next=${next}`);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, auth = true } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const session = getSession();
    if (!session) {
      redirectToLogin();
      throw new ApiError(401, "UNAUTHORIZED", "Your session has expired. Please sign in again.");
    }
    headers.Authorization = `Bearer ${session.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal,
    });
  } catch (err) {
    if ((err as Error)?.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", `Cannot reach the API at ${API_BASE_URL}. Check that the API server is running.`);
  }

  const data: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string; field_errors?: Record<string, string[]> } })?.error;
    if (response.status === 401 && auth) {
      clearSession();
      redirectToLogin();
    }
    throw new ApiError(
      response.status,
      error?.code ?? "HTTP_ERROR",
      error?.message ?? `Request failed with status ${response.status}`,
      error?.field_errors
    );
  }
  return data as T;
}

const ws = (workspaceId: string) => `/workspaces/${encodeURIComponent(workspaceId)}`;

export const growthApi = {
  login: (email: string, password: string) =>
    apiRequest<LoginResponse>("/auth/login", { method: "POST", body: { email, password }, auth: false }),
  me: (signal?: AbortSignal) => apiRequest<MeResponse>("/auth/me", { signal }),
  logout: () => apiRequest<{ success: boolean }>("/auth/logout", { method: "POST", body: {} }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<{ success: boolean; other_sessions_revoked: number }>("/auth/password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    }),

  getBusinessProfile: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<BusinessProfile>(`${ws(workspaceId)}/business-profile`, { signal }),
  updateBusinessProfile: (workspaceId: string, input: UpdateBusinessProfileInput) =>
    apiRequest<BusinessProfile>(`${ws(workspaceId)}/business-profile`, { method: "PUT", body: input }),
  listMembers: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<ListResponse<Member>>(`${ws(workspaceId)}/members`, { signal }),
  getIntegrations: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<IntegrationsResponse>(`${ws(workspaceId)}/integrations`, { signal }),

  listChannels: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<ListResponse<Channel>>(`${ws(workspaceId)}/channels`, { signal }),
  createChannel: (workspaceId: string, input: { platform_name: Channel["platform_name"]; display_name: string; channel_identifier?: string | null }) =>
    apiRequest<Channel>(`${ws(workspaceId)}/channels`, { method: "POST", body: input }),
  listPublishingJobs: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<ListResponse<PublishingJob>>(`${ws(workspaceId)}/publishing-jobs`, { signal }),
  schedulePublishing: (workspaceId: string, input: { artifact_id: string; channel_id: string; scheduled_for?: string; utm_campaign?: string }) =>
    apiRequest<PublishingJob>(`${ws(workspaceId)}/publishing-jobs`, { method: "POST", body: input }),
  updatePublishingJob: (workspaceId: string, jobId: string, input: { action: "cancel" } | { action: "mark_published"; external_post_id?: string | null }) =>
    apiRequest<PublishingJob>(`${ws(workspaceId)}/publishing-jobs/${encodeURIComponent(jobId)}`, { method: "PATCH", body: input }),

  getMetricSeries: (workspaceId: string, metric: string, range: { from: string; to: string }, signal?: AbortSignal) =>
    apiRequest<MetricSeries>(`${ws(workspaceId)}/metrics?metric=${encodeURIComponent(metric)}&from=${range.from}&to=${range.to}`, { signal }),
  syncMetrics: (workspaceId: string, range?: { from?: string; to?: string }) =>
    apiRequest<MetricSyncResponse>(`${ws(workspaceId)}/metrics/sync`, { method: "POST", body: range ?? {} }),
  listLeads: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<{ items: Lead[]; total: number }>(`${ws(workspaceId)}/leads?limit=100`, { signal }),
  retryTask: (workspaceId: string, taskId: string) =>
    apiRequest<WorkflowTask>(`${ws(workspaceId)}/tasks/${encodeURIComponent(taskId)}/retry`, { method: "POST", body: {} }),
  createAiRun: (workspaceId: string, body: { operation: "research.run" }) =>
    apiRequest<unknown>(`${ws(workspaceId)}/ai-tasks`, { method: "POST", body }),

  createKnowledgeContext: (workspaceId: string) =>
    apiRequest<Record<string, unknown>>(`${ws(workspaceId)}/knowledge-contexts`, {
      method: "POST",
      body: {},
    }),
  listTasks: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<ListResponse<WorkflowTask>>(`${ws(workspaceId)}/tasks`, { signal }),
  createTask: (workspaceId: string, input: CreateTaskInput) =>
    apiRequest<WorkflowTask>(`${ws(workspaceId)}/tasks`, { method: "POST", body: input }),

  listCampaigns: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<ListResponse<Campaign>>(`${ws(workspaceId)}/campaigns`, { signal }),

  listArtifacts: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<ListResponse<ContentArtifact>>(`${ws(workspaceId)}/artifacts`, { signal }),
  createArtifact: (workspaceId: string, input: CreateArtifactInput) =>
    apiRequest<ContentArtifact>(`${ws(workspaceId)}/artifacts`, { method: "POST", body: input }),

  listApprovals: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<ListResponse<Approval>>(`${ws(workspaceId)}/approvals`, { signal }),
  requestApproval: (workspaceId: string, artifact: Pick<ContentArtifact, "id" | "version" | "content_hash">) =>
    apiRequest<Approval>(`${ws(workspaceId)}/approvals`, {
      method: "POST",
      body: { target_type: "artifact", target_id: artifact.id, target_version: artifact.version, target_hash: artifact.content_hash },
    }),
  reviewApproval: (workspaceId: string, approvalId: string, input: ReviewApprovalInput) =>
    apiRequest<Approval>(`${ws(workspaceId)}/approvals/${encodeURIComponent(approvalId)}/review`, {
      method: "POST",
      body: input,
    }),

  getReport: (workspaceId: string, range: { from: string; to: string }, signal?: AbortSignal) =>
    apiRequest<WorkspaceReport>(
      `${ws(workspaceId)}/reports?from=${range.from}&to=${range.to}&timezone=Asia/Ho_Chi_Minh`,
      { signal }
    ),
  listExceptions: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<ListResponse<SystemException>>(`${ws(workspaceId)}/exceptions`, { signal }),
};

export type ApiHealth = {
  status: "ok";
  service: "ai-growth-os-api";
  environment: string;
  scope: "process_only";
  checked_at: string;
};

export async function getApiHealth(signal?: AbortSignal): Promise<ApiHealth> {
  const timeout = AbortSignal.timeout(5000);
  const response = await fetch(`${API_BASE_URL}/health`, {
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error("API is unavailable.");
  const body: unknown = await response.json();
  if (
    typeof body !== "object" || body === null ||
    !("status" in body) || body.status !== "ok" ||
    !("service" in body) || body.service !== "ai-growth-os-api" ||
    !("scope" in body) || body.scope !== "process_only" ||
    !("environment" in body) || typeof body.environment !== "string" ||
    !("checked_at" in body) || typeof body.checked_at !== "string"
  ) throw new Error("Unexpected API response.");
  return body as ApiHealth;
}

