import type { Page, Request } from "@playwright/test";

export interface MockApiResponse {
  status?: number;
  body: unknown;
}

export interface MockApiOptions {
  role?: "owner" | "editor" | "viewer";
  workspaces?: Array<{ workspace_id: string; name: string; slug: string; role: "owner" | "editor" | "viewer" }>;
  initializeSession?: boolean;
  handleRequest?: (request: Request, pathname: string) => Promise<MockApiResponse | undefined> | MockApiResponse | undefined;
}

export const demoSession = {
  token: "frontend-qa-token",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  user: {
    id: "frontend-qa-user",
    email: "owner.tripc.demo@gmail.com",
    full_name: "Frontend QA",
    avatar_url: null,
  },
};

export async function mockAuthenticatedApi(page: Page, options: MockApiOptions = {}) {
  const role = options.role ?? "owner";
  const workspaces = options.workspaces ?? [
    { workspace_id: "frontend-workspace", name: "TripC", slug: "tripc", role },
  ];

  if (options.initializeSession !== false) {
    await page.addInitScript((session) => {
      localStorage.setItem("agos.session", JSON.stringify(session));
    }, demoSession);
  }

  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const custom = await options.handleRequest?.(request, pathname);
    if (custom) {
      await route.fulfill({
        status: custom.status ?? 200,
        contentType: "application/json",
        body: JSON.stringify(custom.body),
      });
      return;
    }

    let body: unknown;
    if (pathname.endsWith("/auth/me")) {
      body = {
        user: { ...demoSession.user, last_login_at: null },
        workspaces,
      };
    } else if (pathname.endsWith("/auth/logout")) {
      body = { success: true };
    } else if (pathname.endsWith("/auth/password")) {
      body = { success: true, other_sessions_revoked: 1 };
    } else if (pathname.endsWith("/business-profile")) {
      body = {
        id: "profile-1",
        workspace_id: workspaces[0].workspace_id,
        company_name: "TripC",
        website_url: "https://tripc.example",
        industry: "Travel",
        overview: "A synthetic frontend test profile.",
        safety_rules: {},
        target_locations: ["Da Nang"],
        target_audiences: ["Newcomers"],
        products_services: ["Housing guides"],
        brand_voice: "Helpful",
        brand_guidelines: "Use clear language.",
        competitors: [],
        research_strategy: null,
        version: 1,
        updated_by: null,
        updated_at: "2026-11-05T00:00:00.000Z",
      };
    } else if (pathname.endsWith("/integrations")) {
      body = { providers: [], publishing: [] };
    } else if (pathname.endsWith("/reports")) {
      body = {
        workspace_id: workspaces[0].workspace_id,
        period: { from: "2026-11-01", to: "2026-11-05", timezone: "Asia/Ho_Chi_Minh", currency: "VND" },
        kpis: {},
        summary: { total_leads: 0, available_kpi_count: 0, missing_kpi_count: 0 },
        generated_at: "2026-11-05T00:00:00.000Z",
      };
    } else if (pathname.endsWith("/metrics")) {
      body = { metric: "sessions", provider: "ga4", from: "2026-11-01", to: "2026-11-05", points: [], availability: "missing", missing_reason: "No test data." };
    } else if (pathname.endsWith("/automation")) {
      body = { enabled: false, interval_hours: 24, cta: "Contact us", auto_approve_outputs: false, auto_publish_facebook: false, auto_publish_website: false, next_run_at: "2026-11-06T00:00:00.000Z", last_tick_at: null, last_error: null, tasks: [], observed_at: "2026-11-05T00:00:00.000Z" };
    } else if (pathname.endsWith("/growth-goal")) {
      body = { goal: null };
    } else if (request.method() === "POST" && /\/tasks$/.test(pathname)) {
      const input = request.postDataJSON() as { role: string; operation: string; payload?: Record<string, unknown> };
      body = {
        id: "task-frontend-1",
        workspace_id: workspaces[0].workspace_id,
        campaign_id: null,
        role: input.role,
        operation: input.operation,
        status: "queued",
        priority: 3,
        input_version: 1,
        context_snapshot_id: null,
        payload: input.payload ?? {},
        result_ref: null,
        error_details: null,
        retry_count: 0,
        max_retries: 3,
        started_at: null,
        completed_at: null,
        created_at: "2026-11-05T00:00:00.000Z",
        updated_at: "2026-11-05T00:00:00.000Z",
        dependencies: [],
      };
    } else if (request.method() === "POST" && /\/review$/.test(pathname)) {
      body = { success: true };
    } else if (/\/(approvals|artifacts|tasks|campaigns|exceptions|channels|publishing-jobs|leads|members|site-posts)$/.test(pathname)) {
      body = { items: [] };
    } else {
      body = {};
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
}

export function pendingTaskApproval(workspaceId = "frontend-workspace") {
  return {
    id: "approval-frontend-1",
    workspace_id: workspaceId,
    target_type: "task" as const,
    target_id: "task-pending-1",
    target_version: 2,
    target_hash: "sha256-frontend-qa-hash",
    status: "pending" as const,
    decision: null,
    actor_id: null,
    actor_role: null,
    review_note: null,
    invalidated_reason: null,
    invalidated_at: null,
    created_at: "2026-11-05T00:00:00.000Z",
    updated_at: "2026-11-05T00:00:00.000Z",
  };
}

export function sampleArtifact(overrides: Record<string, unknown> = {}) {
  return {
    id: "artifact-frontend-1",
    workspace_id: "frontend-workspace",
    task_id: null,
    version: 1,
    content_hash: "sha256-artifact-version-one",
    context_snapshot_id: null,
    role: "content" as const,
    operation: "content.generate",
    artifact_type: "social_pack",
    title: "Frontend QA content pack",
    storage: "postgres_ledger" as const,
    payload: {
      summary: "A synthetic artifact for the frontend QA suite.",
      document_markdown: "## Draft caption\nA helpful synthetic caption.",
    },
    evidence: [],
    created_at: "2026-11-05T00:00:00.000Z",
    ...overrides,
  };
}

export function approvedArtifactApproval(artifact: ReturnType<typeof sampleArtifact>, overrides: Record<string, unknown> = {}) {
  return {
    id: "approval-artifact-frontend-1",
    workspace_id: artifact.workspace_id,
    target_type: "artifact" as const,
    target_id: artifact.id,
    target_version: artifact.version,
    target_hash: artifact.content_hash,
    status: "approved" as const,
    decision: "approve" as const,
    actor_id: "frontend-qa-owner",
    actor_role: "owner" as const,
    review_note: null,
    invalidated_reason: null,
    invalidated_at: null,
    created_at: "2026-11-05T00:00:00.000Z",
    updated_at: "2026-11-05T00:00:00.000Z",
    ...overrides,
  };
}
