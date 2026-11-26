import { randomInt } from "node:crypto";
import { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import pool, { query } from "../../lib/db";
import { AppError, NotFoundError } from "../../lib/errors";
import { authenticateUser, AuthUser } from "../../lib/auth";
import { requireWorkspaceAccess, Role } from "../../lib/tenant";
import {
  ASPECT_PRESETS,
  DEFAULT_MANDATORY_NEGATIVE_PROMPT,
  mapCustomerStatus,
  mapFriendlyError,
  CustomerFacingStatus,
} from "./constants";
import { CreateImageJobSchema, CreateImageJobInput } from "./validation";
import {
  createImageJob,
  findImageJobById,
  gpuIsOnline,
} from "../gpuWorkers/repository";

import { ImageJobRow, ImageJobRequestPayload } from "../gpuWorkers/models";

const AUTOMATION_INTERNAL_TOKEN =
  process.env.AUTOMATION_INTERNAL_TOKEN || "dev_internal_secret_token_123";

/**
 * Executes a callback within a database transaction scoped to a specific workspace.
 * Sets `app.current_workspace_id` locally for RLS tenant isolation.
 */
export async function withWorkspaceScope<T>(
  workspaceId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Parameterized set_config ensures local transaction scoping and complete SQL injection safety
    await client.query("SELECT set_config('app.current_workspace_id', $1, true)", [workspaceId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Quota checking hook for Workspace image generation.
 * Empty hook placeholder ready for Prompt 7.3.
 */
export async function checkQuota(
  _workspaceId: string,
  _client?: PoolClient
): Promise<{ allowed: boolean; remainingCredits?: number; reason?: string }> {
  // Placeholder for Prompt 7.3
  return { allowed: true };
}

/**
 * Checks whether any GPU worker is currently active and online.
 * Delegates to the shared gpuIsOnline implementation.
 */
export async function isGpuOnline(): Promise<boolean> {
  return gpuIsOnline();
}

export { gpuIsOnline };


/**
 * Calculates current position in queue (1-based index) for a queued job.
 */
export async function getQueuePosition(
  _jobId: string,
  createdAt: string,
  client?: PoolClient
): Promise<number> {
  const sql = `
    SELECT COUNT(*)::int AS count
    FROM image_jobs
    WHERE status = 'queued' AND created_at <= $1;
  `;
  const res = client
    ? await client.query<{ count: number }>(sql, [createdAt])
    : await query<{ count: number }>(sql, [createdAt]);
  return Math.max(1, res.rows[0]?.count || 1);
}

export interface ResolvedAuth {
  user: AuthUser;
  workspaceId: string;
  role: Role;
  isInternal: boolean;
}

/**
 * Authenticates either regular user session token or AUTOMATION_INTERNAL_TOKEN.
 * For regular users: checks workspace membership and enforces allowedRoles.
 * For AUTOMATION_INTERNAL_TOKEN: verifies workspace_id exists and grants owner authority.
 */
export async function resolveUserOrInternalAuth(
  req: NextRequest,
  requestedWorkspaceId?: string | null,
  allowedRoles: Role[] = ["owner", "editor"]
): Promise<ResolvedAuth> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "Missing or invalid Authorization header. Expected Bearer token."
    );
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    throw new AppError(401, "UNAUTHORIZED", "Empty authentication token.");
  }

  // 1. AUTOMATION_INTERNAL_TOKEN authentication
  if (token === AUTOMATION_INTERNAL_TOKEN) {
    const wsId =
      requestedWorkspaceId ||
      req.headers.get("x-workspace-id") ||
      req.nextUrl.searchParams.get("workspace_id");

    if (!wsId) {
      throw new AppError(
        400,
        "WORKSPACE_ID_REQUIRED",
        "workspace_id is required when authenticating with AUTOMATION_INTERNAL_TOKEN."
      );
    }

    // Verify workspace exists
    const wsRes = await query<{ id: string }>(
      `SELECT id FROM workspaces WHERE id = $1 LIMIT 1;`,
      [wsId]
    );
    if (wsRes.rowCount === 0) {
      throw new AppError(404, "WORKSPACE_NOT_FOUND", `Workspace ${wsId} not found.`);
    }

    return {
      user: {
        id: "00000000-0000-0000-0000-000000000000",
        email: "automation@tripc.local",
        name: "Automation Internal Service",
      },
      workspaceId: wsId,
      role: "owner",
      isInternal: true,
    };
  }

  // 2. Regular user session authentication
  const user = authenticateUser(req);
  if (!requestedWorkspaceId) {
    throw new AppError(400, "WORKSPACE_ID_REQUIRED", "workspace_id parameter is required.");
  }

  const tenantCtx = await requireWorkspaceAccess(requestedWorkspaceId, user, allowedRoles);
  return {
    user,
    workspaceId: tenantCtx.workspaceId,
    role: tenantCtx.role,
    isInternal: false,
  };
}

export interface CreateImageJobResponse {
  job_id: string;
  root_job_id: string;
  attempt: number;
  status: string;
  aspect_ratio: string;
  width: number;
  height: number;
  seed: number;
  position_in_queue: number;
  gpu_online: boolean;
  created_at: string;
}

/**
 * Service to handle POST /api/v1/image-jobs
 */
export async function createImageJobService(
  req: NextRequest,
  rawBody: any
): Promise<{ status: number; data: CreateImageJobResponse }> {
  // 1. Validate payload with Zod
  const validated = CreateImageJobSchema.parse(rawBody);

  // 2. Authenticate user or internal service
  const requestedWorkspaceId =
    validated.workspace_id ||
    req.headers.get("x-workspace-id") ||
    req.nextUrl.searchParams.get("workspace_id");

  const auth = await resolveUserOrInternalAuth(
    req,
    requestedWorkspaceId,
    ["owner", "editor"]
  );

  const workspaceId = auth.workspaceId;

  // 3. Check quota (hook for Prompt 7.3)
  const quota = await checkQuota(workspaceId);
  if (!quota.allowed) {
    throw new AppError(
      402,
      "QUOTA_EXCEEDED",
      quota.reason || "Workspace image generation quota exceeded."
    );
  }

  // 4. Check Idempotency-Key
  const idempotencyKey =
    req.headers.get("idempotency-key") || req.headers.get("x-idempotency-key");

  return await withWorkspaceScope(workspaceId, async (client) => {
    if (idempotencyKey) {
      const existingRes = await client.query<ImageJobRow>(
        `SELECT *
         FROM image_jobs
         WHERE workspace_id = $1
           AND request->>'idempotency_key' = $2
         ORDER BY created_at ASC
         LIMIT 1;`,
        [workspaceId, idempotencyKey]
      );

      if (existingRes.rows.length > 0) {
        const existingJob = existingRes.rows[0];
        const positionInQueue = await getQueuePosition(
          existingJob.id,
          existingJob.created_at,
          client
        );
        const gpuOnline = await isGpuOnline();

        return {
          status: 200,
          data: {
            job_id: existingJob.id,
            root_job_id: existingJob.root_job_id,
            attempt: existingJob.attempt,
            status: existingJob.status,
            aspect_ratio: existingJob.request.aspect_ratio || "1:1",
            width: existingJob.request.width,
            height: existingJob.request.height,
            seed: existingJob.request.seed,
            position_in_queue: positionInQueue,
            gpu_online: gpuOnline,
            created_at: existingJob.created_at,
          },
        };
      }
    }

    // 5. Derive aspect ratio dimensions & safe seed
    const dimensions = ASPECT_PRESETS[validated.aspect_ratio];
    const width = dimensions.width;
    const height = dimensions.height;
    const seed =
      validated.seed !== undefined && validated.seed !== null
        ? validated.seed
        : randomInt(1, 2147483647);

    // 6. Build Job Request payload
    const requestPayload: ImageJobRequestPayload = {
      prompt: validated.prompt,
      negative_prompt:
        validated.negative_prompt || DEFAULT_MANDATORY_NEGATIVE_PROMPT,
      aspect_ratio: validated.aspect_ratio,
      width,
      height,
      seed,
      steps: validated.steps,
      cfg_scale: validated.cfg_scale,
      scheduler: validated.scheduler || "euler_a",
      model_key: validated.model_key || "a327ebf7-c854-4319-b160-00dbd6498427",
      model_name: "Juggernaut XL v9",
      article_id: validated.article_id || null,
      post_id: validated.post_id || null,
      idempotency_key: idempotencyKey || null,
    };

    // 7. Insert new image job into database
    const job = await createImageJob(
      {
        workspace_id: workspaceId,
        owner: auth.isInternal
          ? "automation_service"
          : auth.user.email || auth.user.id,
        source_ref: idempotencyKey ? `idempotency:${idempotencyKey}` : null,
        request: requestPayload,
        provider_used: validated.preferred_provider || "gpu_worker",
      },
      client
    );

    const positionInQueue = await getQueuePosition(job.id, job.created_at, client);
    const gpuOnline = await isGpuOnline();

    return {
      status: 201,
      data: {
        job_id: job.id,
        root_job_id: job.root_job_id,
        attempt: job.attempt,
        status: job.status,
        aspect_ratio: validated.aspect_ratio,
        width,
        height,
        seed,
        position_in_queue: positionInQueue,
        gpu_online: gpuOnline,
        created_at: job.created_at,
      },
    };
  });
}

export interface GetImageJobResponse {
  job_id: string;
  root_job_id: string;
  attempt: number;
  delivery_count: number;
  status: string;
  customer_status: CustomerFacingStatus;
  message: string;
  image_url: string | null;
  content_hash: string | null;
  width: number;
  height: number;
  aspect_ratio: string;
  seed: number;
  media_asset_id: string | null;
  provider_used: string;
  error_code: string | null;
  error_message: string | null;
  gpu_online: boolean;
  created_at: string;
  completed_at: string | null;
}

/**
 * Service to handle GET /api/v1/image-jobs/{id}
 * Consolidates attempts under root_job_id and displays the latest attempt.
 */
export async function getImageJobService(
  req: NextRequest,
  identifier: string
): Promise<GetImageJobResponse> {
  // 1. Locate root_job_id and workspace_id of requested job
  const locateSql = `
    SELECT id, root_job_id, workspace_id
    FROM image_jobs
    WHERE id::text = $1 OR root_job_id::text = $1
    LIMIT 1;
  `;
  const locateRes = await query<{
    id: string;
    root_job_id: string;
    workspace_id: string;
  }>(locateSql, [identifier]);

  if (locateRes.rows.length === 0) {
    throw new NotFoundError("Image job not found");
  }

  const { root_job_id: rootJobId, workspace_id: jobWorkspaceId } = locateRes.rows[0];

  // 2. Authenticate caller and verify workspace access (Cross-workspace MUST return 404)
  try {
    await resolveUserOrInternalAuth(
      req,
      jobWorkspaceId,
      ["owner", "editor", "viewer"]
    );
  } catch (err: any) {
    if (err instanceof AppError && (err.statusCode === 403 || err.code === "FORBIDDEN")) {
      throw new NotFoundError("Image job not found");
    }
    throw err;
  }

  // 3. Query latest attempt strictly within workspace scope
  return await withWorkspaceScope(jobWorkspaceId, async (client) => {
    const jobSql = `
      SELECT *
      FROM image_jobs
      WHERE root_job_id = $1 AND workspace_id = $2
      ORDER BY attempt DESC
      LIMIT 1;
    `;
    const res = await client.query<ImageJobRow>(jobSql, [rootJobId, jobWorkspaceId]);
    if (res.rows.length === 0) {
      throw new NotFoundError("Image job not found");
    }

    const job = res.rows[0];
    const gpuOnline = await isGpuOnline();
    const customerStatus = mapCustomerStatus(job.status);
    const friendlyError = mapFriendlyError(job.error_code, job.error_message);

    // Formulate contextual message
    let message: string;
    if (job.status === "queued") {
      message = gpuOnline
        ? "Tác vụ đang nằm trong hàng đợi sinh ảnh..."
        : "Đang chờ máy GPU sẵn sàng kết nối...";
    } else if (job.status === "claimed" || job.status === "running") {
      message = "Máy trạm GPU đang thực hiện khuếch tán hình ảnh...";
    } else if (job.status === "uploaded" || job.status === "reviewing") {
      message = "Đang kiểm định chất lượng và an toàn hình ảnh...";
    } else if (job.status === "completed") {
      message = "Sinh ảnh thành công.";
    } else if (job.status === "failed") {
      message = friendlyError.friendlyMessage || "Sinh ảnh thất bại.";
    } else if (job.status === "needs_assets") {
      message = "Bài viết về sản phẩm thật yêu cầu ảnh chụp thực tế từ kho tài nguyên.";
    } else if (job.status === "cancelled") {
      message = "Tác vụ đã bị huỷ.";
    } else {
      message = "";
    }

    // Determine public image url when completed
    let imageUrl: string | null = null;
    if (job.status === "completed" && job.result_storage_key) {
      if (
        job.result_storage_key.startsWith("http://") ||
        job.result_storage_key.startsWith("https://")
      ) {
        imageUrl = job.result_storage_key;
      } else {
        const cleanKey = job.result_storage_key.replace(/^\/?(uploads\/)?/, "");
        imageUrl = `/uploads/${cleanKey}`;
      }
    }

    return {
      job_id: job.id,
      root_job_id: job.root_job_id,
      attempt: job.attempt,
      delivery_count: job.delivery_count,
      status: job.status,
      customer_status: customerStatus,
      message,
      image_url: imageUrl,
      content_hash: job.result_sha256,
      width: job.request.width,
      height: job.request.height,
      aspect_ratio: job.request.aspect_ratio || "1:1",
      seed: job.request.seed,
      media_asset_id: job.media_asset_id,
      provider_used: job.provider_used,
      error_code: friendlyError.friendlyCode,
      error_message: friendlyError.friendlyMessage,
      gpu_online: gpuOnline,
      created_at: job.created_at,
      completed_at: job.completed_at,
    };
  });
}

export interface CancelImageJobResponse {
  job_id: string;
  root_job_id: string;
  status: string;
  cancelled_at: string;
}

/**
 * Service to handle POST /api/v1/image-jobs/{id}/cancel
 * Cancels a job strictly when still in 'queued' status.
 */
export async function cancelImageJobService(
  req: NextRequest,
  jobId: string
): Promise<CancelImageJobResponse> {
  // 1. Locate job to determine workspace
  const locateSql = `
    SELECT id, root_job_id, workspace_id, status
    FROM image_jobs
    WHERE id::text = $1
    LIMIT 1;
  `;
  const locateRes = await query<{
    id: string;
    root_job_id: string;
    workspace_id: string;
    status: string;
  }>(locateSql, [jobId]);

  if (locateRes.rows.length === 0) {
    throw new NotFoundError("Image job not found");
  }

  const { workspace_id: jobWorkspaceId, status: currentStatus, root_job_id: rootJobId } =
    locateRes.rows[0];

  // 2. Authenticate caller (Cross-workspace MUST return 404)
  try {
    await resolveUserOrInternalAuth(
      req,
      jobWorkspaceId,
      ["owner", "editor"]
    );
  } catch (err: any) {
    if (err instanceof AppError && (err.statusCode === 403 || err.code === "FORBIDDEN")) {
      throw new NotFoundError("Image job not found");
    }
    throw err;
  }

  // 3. Enforce cancellation rule: ONLY when status is 'queued'
  if (currentStatus !== "queued") {
    throw new AppError(
      400,
      "CANNOT_CANCEL_JOB",
      `Chỉ có thể huỷ tác vụ khi còn trong hàng đợi (queued). Trạng thái hiện tại: ${currentStatus}.`
    );
  }

  // 4. Update status within workspace scope
  return await withWorkspaceScope(jobWorkspaceId, async (client) => {
    const updateSql = `
      UPDATE image_jobs
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2 AND status = 'queued'
      RETURNING id, root_job_id, status, updated_at;
    `;
    const res = await client.query<{
      id: string;
      root_job_id: string;
      status: string;
      updated_at: string;
    }>(updateSql, [jobId, jobWorkspaceId]);

    if (res.rows.length === 0) {
      throw new AppError(
        400,
        "CANNOT_CANCEL_JOB",
        "Tác vụ không còn ở trạng thái hàng đợi (queued) để huỷ."
      );
    }

    return {
      job_id: res.rows[0].id,
      root_job_id: res.rows[0].root_job_id,
      status: "cancelled",
      cancelled_at: res.rows[0].updated_at,
    };
  });
}
