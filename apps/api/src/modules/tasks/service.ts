import { AppError } from "../../lib/errors";
import pool from "../../lib/db";
import { AuthUser } from "../../lib/auth";
import { resolveTenantContext, requireRole } from "../../lib/tenant";
import {
  createWorkflowTaskSchema,
  updateTaskStatusSchema,
  createArtifactSchema,
  CreateWorkflowTaskInput,
  UpdateTaskStatusInput,
  CreateArtifactInput,
} from "./schemas";
import * as repo from "./repository";
import { readWithOfflineDemo } from "../../lib/offlineDemo";
import { getCampaignById } from "../campaigns/repository";
import {
  expectedRoleForOperation,
  isExecutableAgentOperation,
  missingTaskPrerequisite,
  normalizeTaskPayload,
} from "./catalog";

export async function createWorkspaceTask(
  user: AuthUser,
  workspaceId: string,
  rawInput: unknown
) {
  // Chỉ Owner và Editor được enqueue task mới (Viewer bị chặn 403)
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor"]);

  const parseResult = createWorkflowTaskSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid workflow task payload", fieldErrors);
  }

  const input: CreateWorkflowTaskInput = parseResult.data;

  // Xác thực campaign nếu có: Phải tồn tại và thuộc đúng workspace này (chống Cross-Tenant Campaign Injection)
  if (input.campaign_id) {
    const campaign = await getCampaignById(workspaceId, input.campaign_id);
    if (!campaign) {
      throw new AppError(
        422,
        "INVALID_CAMPAIGN_REF",
        `Referenced campaign '${input.campaign_id}' does not exist in this workspace`
      );
    }
  }

  // Xác thực các task dependency: Nếu có dependency, chúng phải tồn tại và thuộc cùng workspace này
  if (input.dependencies && input.dependencies.length > 0) {
    for (const depId of input.dependencies) {
      const parentTask = await repo.getTaskById(workspaceId, depId);
      if (!parentTask) {
        throw new AppError(
          422,
          "INVALID_DEPENDENCY",
          `Dependent task '${depId}' does not exist in this workspace`
        );
      }
    }
  }

  const expectedRole = expectedRoleForOperation(input.operation);
  if (!isExecutableAgentOperation(input.operation) || expectedRole !== input.role) {
    throw new AppError(
      422,
      "UNSUPPORTED_AGENT_OPERATION",
      `Operation '${input.operation}' is not executable by role '${input.role}'.`,
    );
  }

  const normalizedPayload = normalizeTaskPayload(input.operation, input.payload ?? {});
  const missing = missingTaskPrerequisite(input.operation, normalizedPayload);
  if (missing) {
    throw new AppError(
      422,
      "MISSING_TASK_PREREQUISITE",
      `Operation '${input.operation}' requires '${missing}' before it can be queued.`,
    );
  }

  // Every executable task is pinned to a backend-issued current context. A
  // caller may omit the id in the lightweight modal, but may not invent one.
  let contextSnapshotId = input.context_snapshot_id ?? null;
  const context = contextSnapshotId
    ? (await pool.query(
      "SELECT snapshot_id, current FROM knowledge_contexts WHERE workspace_id=$1 AND snapshot_id=$2",
      [workspaceId, contextSnapshotId],
    )).rows[0]
    : (await pool.query(
      "SELECT snapshot_id, current FROM knowledge_contexts WHERE workspace_id=$1 AND current",
      [workspaceId],
    )).rows[0];
  if (!context) {
    throw new AppError(422, "MISSING_CONTEXT", "Create a current knowledge context before queuing agent work.");
  }
  if (!context.current) {
    throw new AppError(409, "STALE_CONTEXT", "The selected knowledge context is no longer current; refresh the workspace context and retry.");
  }
  contextSnapshotId = context.snapshot_id;

  const task = await repo.createTaskWithDependencies(workspaceId, {
    ...input,
    context_snapshot_id: contextSnapshotId,
    payload: normalizedPayload,
  }, { enqueue: true });
  return task;
}

export async function listWorkspaceTasks(
  user: AuthUser,
  workspaceId: string,
  filters?: { role?: string; status?: string; campaign_id?: string }
) {
  // Mọi thành viên (owner, editor, viewer) trong workspace đều được xem danh sách task
  await resolveTenantContext(user, workspaceId);
  const items = await readWithOfflineDemo(
    () => repo.listTasks(workspaceId, filters),
    () => getOfflineTasksFallback(workspaceId)
  );
  return { items };
}

export async function getWorkspaceTaskDetail(
  user: AuthUser,
  workspaceId: string,
  taskId: string
) {
  await resolveTenantContext(user, workspaceId);
  const task = await readWithOfflineDemo(
    () => repo.getTaskById(workspaceId, taskId),
    () => getOfflineTasksFallback(workspaceId).find((t) => t.id === taskId) ?? null
  );
  if (!task) {
    throw new AppError(404, "NOT_FOUND", "Workflow task not found");
  }
  return task;
}

export async function updateWorkspaceTaskStatus(
  user: AuthUser,
  workspaceId: string,
  taskId: string,
  rawInput: unknown
) {
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor"]);

  const parseResult = updateTaskStatusSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid task status update payload", fieldErrors);
  }

  const existingTask = await repo.getTaskById(workspaceId, taskId);
  if (!existingTask) {
    throw new AppError(404, "NOT_FOUND", "Workflow task not found");
  }

  // Chặn đứng việc đảo ngược trạng thái nếu task đã rơi vào terminal status ('completed', 'cancelled')
  const TERMINAL_STATUSES = ["completed", "cancelled"];
  if (
    TERMINAL_STATUSES.includes(existingTask.status) &&
    parseResult.data.status !== existingTask.status
  ) {
    throw new AppError(
      409,
      "INVALID_STATE_TRANSITION",
      `Cannot transition task from terminal status '${existingTask.status}' to '${parseResult.data.status}'`
    );
  }

  // Xác thực result_ref nếu có: Phải tồn tại và thuộc cùng workspace này (chống Cross-Tenant Reference / IDOR)
  let linkedArtifact: repo.ContentArtifactRow | null = null;
  if (parseResult.data.result_ref) {
    linkedArtifact = await repo.getArtifactById(workspaceId, parseResult.data.result_ref);
    if (!linkedArtifact) {
      throw new AppError(
        422,
        "INVALID_RESULT_REF",
        `Referenced result artifact '${parseResult.data.result_ref}' does not exist in this workspace`
      );
    }
  }

  if (parseResult.data.status === "completed") {
    if (!linkedArtifact) {
      throw new AppError(422, "RESULT_REQUIRED", "A task can only be completed after its artifact is persisted.");
    }
    if (linkedArtifact.task_id && linkedArtifact.task_id !== taskId) {
      throw new AppError(422, "RESULT_TASK_MISMATCH", "The result artifact belongs to a different task.");
    }
    const result = linkedArtifact.payload?.result as Record<string, unknown> | undefined;
    if (result?.status === "insufficient_data") {
      throw new AppError(422, "INCOMPLETE_RESULT", "Insufficient-data output cannot be marked completed; resolve its missing facts first.");
    }
  }

  const updatedTask = await repo.updateTaskStatus(workspaceId, taskId, parseResult.data);
  return updatedTask;
}

export async function retryWorkspaceTask(user: AuthUser, workspaceId: string, taskId: string) {
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor"]);

  const task = await repo.requeueFailedTask(workspaceId, taskId, user.id);
  if (task) return task;

  const existing = await repo.getTaskById(workspaceId, taskId);
  if (!existing) throw new AppError(404, "NOT_FOUND", "Workflow task not found");
  throw new AppError(409, "INVALID_STATE_TRANSITION", `Only failed tasks can be retried (current status: ${existing.status})`);
}

export async function createWorkspaceArtifact(
  user: AuthUser,
  workspaceId: string,
  rawInput: unknown
) {
  const tenantCtx = await resolveTenantContext(user, workspaceId);
  requireRole(tenantCtx, ["owner", "editor"]);

  const parseResult = createArtifactSchema.safeParse(rawInput);
  if (!parseResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parseResult.error.issues) {
      const field = issue.path.join(".");
      fieldErrors[field] = fieldErrors[field] || [];
      fieldErrors[field].push(issue.message);
    }
    throw new AppError(422, "VALIDATION_FAILED", "Invalid artifact payload", fieldErrors);
  }

  const input: CreateArtifactInput = parseResult.data;

  // Nếu artifact gắn với task_id, kiểm tra task có thuộc workspace này không
  if (input.task_id) {
    const linkedTask = await repo.getTaskById(workspaceId, input.task_id);
    if (!linkedTask) {
      throw new AppError(422, "INVALID_TASK_REF", `Referenced task '${input.task_id}' does not exist in this workspace`);
    }
  }

  const artifact = await repo.createArtifact(workspaceId, input);
  return artifact;
}

export async function listWorkspaceArtifacts(
  user: AuthUser,
  workspaceId: string,
  filters?: { role?: string; artifact_type?: string }
) {
  await resolveTenantContext(user, workspaceId);
  const items = await readWithOfflineDemo(
    () => repo.listArtifacts(workspaceId, filters),
    () => getOfflineArtifactsFallback(workspaceId)
  );
  return { items };
}

export async function getWorkspaceArtifactDetail(
  user: AuthUser,
  workspaceId: string,
  artifactId: string
) {
  await resolveTenantContext(user, workspaceId);
  const artifact = await readWithOfflineDemo(
    () => repo.getArtifactById(workspaceId, artifactId),
    () => getOfflineArtifactsFallback(workspaceId).find((a) => a.id === artifactId) ?? null
  );
  if (!artifact) {
    throw new AppError(404, "NOT_FOUND", "Artifact not found");
  }
  return artifact;
}

// ---- Dữ liệu demo chỉ dùng khi AGOS_OFFLINE_DEMO=1 và Postgres không kết nối được ----

function getOfflineTasksFallback(workspaceId: string): repo.WorkflowTaskRow[] {
  return [
    {
      id: "task-res",
      workspace_id: workspaceId,
      campaign_id: "camp-dn-2026",
      role: "research",
      operation: "research.run",
      status: "completed",
      priority: 1,
      input_version: 1,
      context_snapshot_id: "ctx-10000000",
      payload: { topic: "Khảo sát xu hướng du lịch Đà Nẵng 2026", goal: "Tìm cơ hội tăng trưởng booking & thuê xe" },
      result_ref: "art-res-1",
      retry_count: 0,
      max_retries: 3,
      started_at: new Date(Date.now() - 7200000).toISOString(),
      completed_at: new Date(Date.now() - 7100000).toISOString(),
      created_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date(Date.now() - 7100000).toISOString(),
      dependencies: [],
    },
    {
      id: "task-lea",
      workspace_id: workspaceId,
      campaign_id: "camp-dn-2026",
      role: "growth_lead",
      operation: "strategy.generate",
      status: "completed",
      priority: 2,
      input_version: 1,
      context_snapshot_id: "ctx-10000000",
      payload: { strategy: "Tập trung SEO bài viết trải nghiệm & Social Video ngắn TikTok/Reels" },
      result_ref: "art-lea-1",
      retry_count: 0,
      max_retries: 3,
      started_at: new Date(Date.now() - 7000000).toISOString(),
      completed_at: new Date(Date.now() - 6900000).toISOString(),
      created_at: new Date(Date.now() - 7000000).toISOString(),
      updated_at: new Date(Date.now() - 6900000).toISOString(),
      dependencies: ["task-res"],
    },
    {
      id: "task-seo",
      workspace_id: workspaceId,
      campaign_id: "camp-dn-2026",
      role: "seo",
      operation: "seo.article",
      status: "completed",
      priority: 3,
      input_version: 1,
      context_snapshot_id: "ctx-10000000",
      payload: { target_keyword: "du lịch đà nẵng tự túc", cta: "Đặt tour & thuê xe máy TripC" },
      result_ref: "art-seo-1",
      retry_count: 0,
      max_retries: 3,
      started_at: new Date(Date.now() - 6800000).toISOString(),
      completed_at: new Date(Date.now() - 6700000).toISOString(),
      created_at: new Date(Date.now() - 6800000).toISOString(),
      updated_at: new Date(Date.now() - 6700000).toISOString(),
      dependencies: ["task-lea"],
    },
    {
      id: "task-con",
      workspace_id: workspaceId,
      campaign_id: "camp-dn-2026",
      role: "content",
      operation: "content.social_pack",
      status: "completed",
      priority: 4,
      input_version: 1,
      context_snapshot_id: "ctx-10000000",
      payload: { channels: ["facebook", "tiktok"], title: "Check-in Hoàng Hôn Bán Đảo Sơn Trà" },
      result_ref: "art-soc-1",
      retry_count: 0,
      max_retries: 3,
      started_at: new Date(Date.now() - 6600000).toISOString(),
      completed_at: new Date(Date.now() - 6500000).toISOString(),
      created_at: new Date(Date.now() - 6600000).toISOString(),
      updated_at: new Date(Date.now() - 6500000).toISOString(),
      dependencies: ["task-seo"],
    },
    {
      id: "task-com",
      workspace_id: workspaceId,
      campaign_id: "camp-dn-2026",
      role: "community",
      operation: "community.monitor",
      status: "completed",
      priority: 5,
      input_version: 1,
      context_snapshot_id: "ctx-10000000",
      payload: { group_url: "https://facebook.com/groups/cam-nang-du-lich-da-nang" },
      result_ref: null,
      retry_count: 0,
      max_retries: 3,
      started_at: new Date(Date.now() - 6400000).toISOString(),
      completed_at: new Date(Date.now() - 6300000).toISOString(),
      created_at: new Date(Date.now() - 6400000).toISOString(),
      updated_at: new Date(Date.now() - 6300000).toISOString(),
      dependencies: ["task-con"],
    },
    {
      id: "task-per",
      workspace_id: workspaceId,
      campaign_id: "camp-dn-2026",
      role: "performance",
      operation: "performance.report",
      status: "completed",
      priority: 6,
      input_version: 1,
      context_snapshot_id: "ctx-10000000",
      payload: { period: "30d" },
      result_ref: null,
      retry_count: 0,
      max_retries: 3,
      started_at: new Date(Date.now() - 6200000).toISOString(),
      completed_at: new Date(Date.now() - 6100000).toISOString(),
      created_at: new Date(Date.now() - 6200000).toISOString(),
      updated_at: new Date(Date.now() - 6100000).toISOString(),
      dependencies: ["task-com"],
    },
  ];
}

function getOfflineArtifactsFallback(workspaceId: string): repo.ContentArtifactRow[] {
  return [
    {
      id: "art-seo-1",
      workspace_id: workspaceId,
      task_id: "task-seo",
      version: 1,
      content_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      context_snapshot_id: "ctx-10000000",
      role: "seo",
      operation: "seo.article",
      artifact_type: "article",
      title: "Cẩm nang du lịch trải nghiệm Đà Nẵng 2026 (SEO Article)",
      storage: "inline",
      evidence: [
        { source_id: "source-danang-guide", citation: "Cẩm nang du lịch trải nghiệm Đà Nẵng 2026 - Cổng thông tin Du lịch" }
      ],
      payload: {
        title: "Cẩm nang du lịch trải nghiệm Đà Nẵng 2026",
        summary: "Chiến lược nội dung SEO bao phủ từ khóa du lịch tự túc, thuê xe và khám phá Đà Nẵng mùa cao điểm.",
        document_markdown: "# Cẩm nang du lịch trải nghiệm Đà Nẵng 2026\n\nKhám phá trọn vẹn thành phố biển Đà Nẵng từ Bán đảo Sơn Trà, Bãi biển Mỹ Khê đến đỉnh Bà Nà Hills...\n\n## 1. Thời điểm lý tưởng nhất\nTừ tháng 2 đến tháng 8 là khoảng thời gian lý tưởng nhất với nắng đẹp và biển êm.\n\n## 2. Lịch trình gợi ý 3N2Đ\n- **Ngày 1**: Bán đảo Sơn Trà - Chùa Linh Ứng - Biển Mỹ Khê ngắm hoàng hôn.\n- **Ngày 2**: Ngũ Hành Sơn - Làng đá mỹ nghệ Non Nước - Phố cổ Hội An.\n- **Ngày 3**: Check-in Cầu Rồng - Chợ Cồn thưởng thức ẩm thực đặc sản.\n\n## 3. Dịch vụ thuê xe & Đặt tour\nLiên hệ TripC Experience để nhận ưu đãi thuê xe máy đời mới và tour trải nghiệm tự túc tiết kiệm 20%!",
        missing_facts: []
      },
      created_at: new Date(Date.now() - 6700000).toISOString(),
    },
    {
      id: "art-soc-1",
      workspace_id: workspaceId,
      task_id: "task-con",
      version: 1,
      content_hash: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
      context_snapshot_id: "ctx-10000000",
      role: "content",
      operation: "content.social_pack",
      artifact_type: "social_pack",
      title: "Kịch bản Video TikTok & Social Pack: Check-in Sơn Trà Hoàng Hôn",
      storage: "inline",
      evidence: [
        { source_id: "source-danang-guide", citation: "Khảo sát thực địa bán đảo Sơn Trà" }
      ],
      payload: {
        title: "Kịch bản Video TikTok & Social Pack: Check-in Sơn Trà Hoàng Hôn",
        summary: "Kịch bản video ngắn 30s tối ưu chuyển đổi khách book tour và thuê xe máy ngắm hoàng hôn đỉnh Bàn Cờ.",
        document_markdown: "# Kịch bản Social Pack: Hoàng Hôn Sơn Trà\n\n**Kênh phân phối**: TikTok (@tripc_danang) & Facebook Fanpage\n**Thời lượng**: 30 giây\n**Âm thanh đề xuất**: Nhạc chill du lịch xu hướng\n\n### Phân cảnh:\n- **0s - 5s**: Hook hình ảnh Flycam lướt qua bãi biển Mỹ Khê lên đỉnh Bàn Cờ.\n- **5s - 18s**: Góc ngắm hoàng hôn đỏ rực cả vịnh Đà Nẵng, cảm giác lái xe máy lộng gió.\n- **18s - 30s**: CTA: 'Lưu ngay lịch trình này cho chuyến đi Đà Nẵng sắp tới. Inbox TripC nhận trọn bộ map ăn chơi miễn phí!'",
        missing_facts: []
      },
      created_at: new Date(Date.now() - 6500000).toISOString(),
    },
    {
      id: "art-pub-1",
      workspace_id: workspaceId,
      task_id: "task-con",
      version: 1,
      content_hash: "c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef01234",
      context_snapshot_id: "ctx-10000000",
      role: "content",
      operation: "content.social_pack",
      artifact_type: "social_pack",
      title: "Top 5 điểm ngắm hoàng hôn đẹp nhất Sơn Trà",
      storage: "inline",
      evidence: [],
      payload: {
        title: "Top 5 điểm ngắm hoàng hôn đẹp nhất Sơn Trà",
        summary: "Bài viết tổng hợp góc check-in hoàng hôn đẹp nhất tại bán đảo Sơn Trà.",
        document_markdown: "# Top 5 điểm ngắm hoàng hôn đẹp nhất Sơn Trà\n\n1. **Đỉnh Bàn Cờ**\n2. **Mũi Nghê**\n3. **Trạm Rada 29**\n4. **Bãi Cháy**\n5. **Chùa Linh Ứng**",
        missing_facts: []
      },
      created_at: new Date(Date.now() - 7200000).toISOString(),
    }
  ];
}
