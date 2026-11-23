import type { PoolClient, Pool } from "pg";
import { query } from "../../lib/db";
import pool from "../../lib/db";
import { randomUUID } from "node:crypto";
import {
  GpuWorkerRow,
  RegisterWorkerInput,
  GpuWorkerStatus,
  ImageJobRow,
  ImageJobStatus,
  CreateImageJobInput,
  ImageJobRequestPayload,
  GpuOfflinePolicy,
  canTransitionJob,
  InvalidJobStateTransitionError,
  JobNotFoundError,
  JobWorkerMismatchError,
} from "./models";
import { AppError } from "../../lib/errors";

function isPoolClient(obj: any): obj is PoolClient {
  return Boolean(obj && typeof obj.query === "function" && typeof obj.release === "function");
}

export const GPU_JOB_LEASE_SECONDS = parseInt(process.env.GPU_JOB_LEASE_SECONDS || "120", 10);

export const GPU_WORKER_OFFLINE_AFTER_SECONDS = parseInt(
  process.env.GPU_WORKER_OFFLINE_AFTER_SECONDS || "60",
  10
);
export const GPU_JOB_MAX_DELIVERIES = parseInt(process.env.GPU_JOB_MAX_DELIVERIES || "5", 10);
export const GPU_JOB_QUEUE_TTL_SECONDS = parseInt(process.env.GPU_JOB_QUEUE_TTL_SECONDS || "600", 10);
export const GPU_JOB_MAX_AGE_SECONDS = parseInt(process.env.GPU_JOB_MAX_AGE_SECONDS || "0", 10);
export const GPU_OFFLINE_POLICY: GpuOfflinePolicy = (process.env.GPU_OFFLINE_POLICY as GpuOfflinePolicy) || "queue_wait";

/**
 * Checks whether any GPU worker is currently active and online.
 * Reusable across API routes and worker services.
 */
export async function gpuIsOnline(
  clientOrPool?: Pool | PoolClient,
  options: {
    offlineThresholdSeconds?: number;
    asOfDate?: Date;
  } = {}
): Promise<boolean> {
  const threshold = options.offlineThresholdSeconds ?? GPU_WORKER_OFFLINE_AFTER_SECONDS;
  const asOf = options.asOfDate ?? new Date();

  const sql = `
    SELECT EXISTS (
      SELECT 1 FROM gpu_workers
      WHERE status IN ('online', 'busy')
        AND revoked_at IS NULL
        AND last_seen_at >= ($1::timestamptz - ($2 || ' seconds')::INTERVAL)
    ) AS is_online;
  `;
  const params = [asOf.toISOString(), threshold.toString()];

  if (clientOrPool && isPoolClient(clientOrPool)) {
    const res = await (clientOrPool as PoolClient).query<{ is_online: boolean }>(sql, params);
    return Boolean(res.rows[0]?.is_online);
  }

  const targetPool = (clientOrPool as Pool) || pool;
  const conn = await targetPool.connect();
  try {
    await conn.query("BEGIN");
    await conn.query("SET LOCAL app.is_worker_context = 'true'");
    const res = await conn.query<{ is_online: boolean }>(sql, params);
    await conn.query("COMMIT");
    return Boolean(res.rows[0]?.is_online);
  } catch {
    await conn.query("ROLLBACK");
    return false;
  } finally {
    conn.release();
  }
}

export const isGpuOnline = gpuIsOnline;


/**
 * Diagnostic helper invoked when an UPDATE affects 0 rows.
 * Status validation takes precedence over worker ownership.
 * Returns a strongly-typed error explaining the exact cause (not found, invalid status transition, or worker mismatch).
 */
async function getJobTransitionError(
  jobId: string,
  expectedWorkerId: string | null | undefined,
  allowedCurrentStatuses: readonly ImageJobStatus[],
  targetStatusOrAction: ImageJobStatus | string,
  client?: PoolClient
): Promise<AppError> {
  const checkSql = `SELECT id, status, claimed_by FROM image_jobs WHERE id = $1 LIMIT 1;`;
  const res = client
    ? await client.query<{ id: string; status: ImageJobStatus; claimed_by: string | null }>(checkSql, [jobId])
    : await query<{ id: string; status: ImageJobStatus; claimed_by: string | null }>(checkSql, [jobId]);

  const row = res.rows[0];
  if (!row) {
    return new JobNotFoundError(jobId);
  }

  // 1. Status transition check takes precedence: is the current status eligible for this transition?
  if (!allowedCurrentStatuses.includes(row.status)) {
    return new InvalidJobStateTransitionError(jobId, row.status, targetStatusOrAction);
  }

  // 2. Worker ownership check: if status is valid (e.g. 'claimed'), verify worker ownership
  if (expectedWorkerId !== undefined && expectedWorkerId !== null && row.claimed_by !== expectedWorkerId) {
    return new JobWorkerMismatchError(jobId, row.claimed_by, expectedWorkerId);
  }

  return new InvalidJobStateTransitionError(
    jobId,
    row.status,
    targetStatusOrAction,
    `Condition failed during state transition to '${targetStatusOrAction}' for job ${jobId}.`
  );
}

// ============================================================================
// 1. GPU WORKERS MANAGEMENT
// ============================================================================

export async function registerWorker(
  input: RegisterWorkerInput,
  client?: PoolClient
): Promise<GpuWorkerRow> {
  const id = input.id || randomUUID();
  const sql = `
    INSERT INTO gpu_workers (
      id, name, token_hash, status, worker_version, engine_version,
      model_key, vram_free_mb, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW()
    )
    ON CONFLICT (token_hash)
    DO UPDATE SET
      name = EXCLUDED.name,
      status = EXCLUDED.status,
      worker_version = COALESCE(EXCLUDED.worker_version, gpu_workers.worker_version),
      engine_version = COALESCE(EXCLUDED.engine_version, gpu_workers.engine_version),
      model_key = COALESCE(EXCLUDED.model_key, gpu_workers.model_key),
      vram_free_mb = COALESCE(EXCLUDED.vram_free_mb, gpu_workers.vram_free_mb),
      updated_at = NOW()
    RETURNING *;
  `;
  const params = [
    id,
    input.name,
    input.token_hash,
    input.status || "offline",
    input.worker_version || null,
    input.engine_version || null,
    input.model_key || null,
    input.vram_free_mb ?? null,
  ];

  const res = client
    ? await client.query<GpuWorkerRow>(sql, params)
    : await query<GpuWorkerRow>(sql, params);
  return res.rows[0];
}

export async function findWorkerByTokenHash(
  tokenHash: string,
  client?: PoolClient
): Promise<GpuWorkerRow | null> {
  const sql = `
    SELECT *
    FROM gpu_workers
    WHERE token_hash = $1 AND revoked_at IS NULL
    LIMIT 1;
  `;
  const res = client
    ? await client.query<GpuWorkerRow>(sql, [tokenHash])
    : await query<GpuWorkerRow>(sql, [tokenHash]);
  return res.rows[0] || null;
}

export async function findWorkerById(
  workerId: string,
  client?: PoolClient
): Promise<GpuWorkerRow | null> {
  const sql = `
    SELECT *
    FROM gpu_workers
    WHERE id = $1
    LIMIT 1;
  `;
  const res = client
    ? await client.query<GpuWorkerRow>(sql, [workerId])
    : await query<GpuWorkerRow>(sql, [workerId]);
  return res.rows[0] || null;
}

export async function updateWorkerHeartbeat(
  workerId: string,
  updates: {
    status?: GpuWorkerStatus;
    vram_free_mb?: number;
    active_job_id?: string | null;
  } = {},
  client?: PoolClient
): Promise<GpuWorkerRow | null> {
  const sql = `
    UPDATE gpu_workers
    SET last_seen_at = NOW(),
        status = COALESCE($2, status),
        vram_free_mb = COALESCE($3, vram_free_mb),
        active_job_id = $4,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *;
  `;
  const params = [
    workerId,
    updates.status || null,
    updates.vram_free_mb ?? null,
    updates.active_job_id !== undefined ? updates.active_job_id : null,
  ];

  const res = client
    ? await client.query<GpuWorkerRow>(sql, params)
    : await query<GpuWorkerRow>(sql, params);
  return res.rows[0] || null;
}

// ============================================================================
// 2. IMAGE JOBS LIFECYCLE & STATE MACHINE
// ============================================================================

export async function createImageJob(
  input: CreateImageJobInput,
  client?: PoolClient
): Promise<ImageJobRow> {
  const id = input.id || randomUUID();
  const rootJobId = input.root_job_id || id;
  const attempt = input.attempt ?? 1;

  const sql = `
    INSERT INTO image_jobs (
      id, root_job_id, attempt, delivery_count, workspace_id, owner,
      source_ref, status, request, provider_used, queued_at, created_at, updated_at
    ) VALUES (
      $1, $2, $3, 0, $4, $5,
      $6, 'queued', $7, $8, NOW(), NOW(), NOW()
    )
    RETURNING *;
  `;
  const params = [
    id,
    rootJobId,
    attempt,
    input.workspace_id,
    input.owner,
    input.source_ref || null,
    JSON.stringify(input.request),
    input.provider_used || "gpu_worker",
  ];

  const res = client
    ? await client.query<ImageJobRow>(sql, params)
    : await query<ImageJobRow>(sql, params);
  return res.rows[0];
}

/**
 * Claim the next available queued job atomically using SELECT ... FOR UPDATE SKIP LOCKED.
 * Filters by supportedModels if provided, orders by created_at ASC, sets lease and increments delivery_count.
 * Strictly executes inside a single database transaction.
 */
export async function claimNextJob(
  workerId: string,
  supportedModelsOrLease?: string[] | number,
  leaseSecondsOrClient?: number | PoolClient,
  clientArg?: PoolClient
): Promise<ImageJobRow | null> {
  let supportedModels: string[] | undefined;
  let leaseSeconds: number = GPU_JOB_LEASE_SECONDS;
  let client: PoolClient | undefined = clientArg;

  if (Array.isArray(supportedModelsOrLease)) {
    supportedModels = supportedModelsOrLease;
    if (typeof leaseSecondsOrClient === "number") {
      leaseSeconds = leaseSecondsOrClient;
    } else if (leaseSecondsOrClient && typeof leaseSecondsOrClient === "object") {
      client = leaseSecondsOrClient as PoolClient;
    }
  } else if (typeof supportedModelsOrLease === "number") {
    leaseSeconds = supportedModelsOrLease;
    if (leaseSecondsOrClient && typeof leaseSecondsOrClient === "object") {
      client = leaseSecondsOrClient as PoolClient;
    }
  } else if (supportedModelsOrLease && typeof supportedModelsOrLease === "object") {
    client = supportedModelsOrLease as PoolClient;
  }

  const claimSql = `
    WITH claimable AS (
      SELECT id
      FROM image_jobs
      WHERE status = 'queued'
        AND (
          $2::text[] IS NULL 
          OR cardinality($2::text[]) = 0 
          OR request->>'model_key' IS NULL
          OR request->>'model_key' = ANY($2::text[]) 
          OR request->>'model_name' = ANY($2::text[])
        )
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE image_jobs j
    SET status = 'claimed',
        claimed_by = $1,
        claimed_at = NOW(),
        lease_expires_at = NOW() + ($3 || ' seconds')::INTERVAL,
        delivery_count = j.delivery_count + 1,
        updated_at = NOW()
    FROM claimable
    WHERE j.id = claimable.id
    RETURNING j.*;
  `;

  const params = [
    workerId,
    supportedModels && supportedModels.length > 0 ? supportedModels : null,
    leaseSeconds.toString(),
  ];

  if (client) {
    const res = await client.query<ImageJobRow>(claimSql, params);
    return res.rows[0] || null;
  }

  // Manage transaction on pooled connection
  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    const res = await conn.query<ImageJobRow>(claimSql, params);
    await conn.query("COMMIT");
    return res.rows[0] || null;
  } catch (err) {
    await conn.query("ROLLBACK");
    throw err;
  } finally {
    conn.release();
  }
}

/** Backward-compatible alias for claimNextJob */
export const claimNextImageJob = claimNextJob;

/**
 * Extend lease time during long-running tasks.
 * Valid statuses: 'claimed' or 'running'. Checks worker_id ownership.
 */
export async function extendLease(
  jobId: string,
  workerId: string,
  leaseSeconds: number = GPU_JOB_LEASE_SECONDS,
  client?: PoolClient
): Promise<ImageJobRow> {
  const sql = `
    UPDATE image_jobs
    SET lease_expires_at = NOW() + ($3 || ' seconds')::INTERVAL,
        updated_at = NOW()
    WHERE id = $1 AND status IN ('claimed', 'running') AND claimed_by = $2
    RETURNING *;
  `;
  const params = [jobId, workerId, leaseSeconds.toString()];
  const res = client ? await client.query<ImageJobRow>(sql, params) : await query<ImageJobRow>(sql, params);
  if (res.rows.length > 0) return res.rows[0];

  throw await getJobTransitionError(jobId, workerId, ["claimed", "running"], "extendLease", client);
}

/** Backward-compatible alias for extendLease */
export const renewJobLease = extendLease;

/**
 * Transition job from 'claimed' -> 'running' when worker starts rendering.
 */
export async function markRunning(
  jobId: string,
  workerId: string,
  client?: PoolClient
): Promise<ImageJobRow> {
  const sql = `
    UPDATE image_jobs
    SET status = 'running',
        updated_at = NOW()
    WHERE id = $1 AND status = 'claimed' AND claimed_by = $2
    RETURNING *;
  `;
  const params = [jobId, workerId];
  const res = client ? await client.query<ImageJobRow>(sql, params) : await query<ImageJobRow>(sql, params);
  if (res.rows.length > 0) return res.rows[0];

  throw await getJobTransitionError(jobId, workerId, ["claimed"], "running", client);
}

/**
 * Transition job from 'running' -> 'uploaded' when worker uploads the image.
 */
export async function markUploaded(
  jobId: string,
  workerId: string,
  uploadDetails: {
    storage_key: string;
    sha256: string;
  },
  client?: PoolClient
): Promise<ImageJobRow> {
  const sql = `
    UPDATE image_jobs
    SET status = 'uploaded',
        result_storage_key = $3,
        result_sha256 = $4,
        updated_at = NOW()
    WHERE id = $1 AND status = 'running' AND claimed_by = $2
    RETURNING *;
  `;
  const params = [jobId, workerId, uploadDetails.storage_key, uploadDetails.sha256];
  const res = client ? await client.query<ImageJobRow>(sql, params) : await query<ImageJobRow>(sql, params);
  if (res.rows.length > 0) return res.rows[0];

  throw await getJobTransitionError(jobId, workerId, ["running"], "uploaded", client);
}

/**
 * Complete job after cloud verification.
 * Valid source statuses: 'uploaded' or 'reviewing'.
 */
export async function completeJob(
  jobId: string,
  workerId?: string | null,
  details: {
    media_asset_id?: string;
    storage_key?: string;
    sha256?: string;
  } = {},
  client?: PoolClient
): Promise<ImageJobRow> {
  const sql = `
    UPDATE image_jobs
    SET status = 'completed',
        completed_at = NOW(),
        media_asset_id = COALESCE($3, media_asset_id),
        result_storage_key = COALESCE($4, result_storage_key),
        result_sha256 = COALESCE($5, result_sha256),
        updated_at = NOW()
    WHERE id = $1
      AND status IN ('uploaded', 'reviewing')
      AND ($2::uuid IS NULL OR claimed_by = $2::uuid)
    RETURNING *;
  `;
  const params = [
    jobId,
    workerId || null,
    details.media_asset_id || null,
    details.storage_key || null,
    details.sha256 || null,
  ];

  const res = client ? await client.query<ImageJobRow>(sql, params) : await query<ImageJobRow>(sql, params);
  if (res.rows.length > 0) return res.rows[0];

  throw await getJobTransitionError(jobId, workerId, ["uploaded", "reviewing"], "completed", client);
}

/** Backward-compatible alias for completeJob */
export async function completeImageJob(
  jobId: string,
  workerId: string,
  result: {
    storage_key: string;
    sha256: string;
    media_asset_id?: string;
  },
  client?: PoolClient
): Promise<ImageJobRow> {
  return completeJob(jobId, workerId, result, client);
}

/**
 * Mark job failed or needs_assets (e.g. OOM, worker error, or guardrail rejection).
 * Valid source statuses: 'claimed', 'running', 'uploaded', 'reviewing'.
 */
export async function failJob(
  jobId: string,
  workerId: string | null,
  errorCode: string,
  errorMessage?: string,
  optionsOrClient?:
    | {
        guardrailReport?: Record<string, any> | null;
        targetStatus?: "failed" | "needs_assets";
      }
    | PoolClient,
  clientArg?: PoolClient
): Promise<ImageJobRow> {
  let client: PoolClient | undefined;
  let guardrailReport: Record<string, any> | null = null;
  let targetStatus: "failed" | "needs_assets" = "failed";

  if (optionsOrClient && "query" in optionsOrClient) {
    client = optionsOrClient as PoolClient;
  } else if (optionsOrClient && typeof optionsOrClient === "object") {
    guardrailReport = optionsOrClient.guardrailReport ?? null;
    if (optionsOrClient.targetStatus) {
      targetStatus = optionsOrClient.targetStatus;
    }
    client = clientArg;
  }

  const sql = `
    UPDATE image_jobs
    SET status = $5,
        error_code = $3,
        error_message = $4,
        guardrail_report = COALESCE($6::jsonb, guardrail_report),
        updated_at = NOW()
    WHERE id = $1
      AND status IN ('claimed', 'running', 'uploaded', 'reviewing')
      AND ($2::uuid IS NULL OR claimed_by = $2::uuid)
    RETURNING *;
  `;
  const params = [
    jobId,
    workerId,
    errorCode,
    errorMessage || null,
    targetStatus,
    guardrailReport ? JSON.stringify(guardrailReport) : null,
  ];
  const res = client ? await client.query<ImageJobRow>(sql, params) : await query<ImageJobRow>(sql, params);
  if (res.rows.length > 0) return res.rows[0];

  throw await getJobTransitionError(
    jobId,
    workerId,
    ["claimed", "running", "uploaded", "reviewing"],
    targetStatus,
    client
  );
}

/** Backward-compatible alias for failJob */
export const failImageJob = failJob;

/**
 * Cancel job before it finishes.
 * Valid source statuses: 'queued' or 'claimed'.
 */
export async function cancelQueuedJob(
  jobId: string,
  reason?: string,
  client?: PoolClient
): Promise<ImageJobRow> {
  const sql = `
    UPDATE image_jobs
    SET status = 'cancelled',
        error_message = $2,
        updated_at = NOW()
    WHERE id = $1 AND status IN ('queued', 'claimed')
    RETURNING *;
  `;
  const params = [jobId, reason || "Cancelled by user/system"];
  const res = client ? await client.query<ImageJobRow>(sql, params) : await query<ImageJobRow>(sql, params);
  if (res.rows.length > 0) return res.rows[0];

  throw await getJobTransitionError(jobId, null, ["queued", "claimed"], "cancelled", client);
}

export interface RequeueExpiredOptions {
  maxDeliveries?: number;
  referenceTime?: Date;
}

export interface RequeueExpiredResult {
  requeuedCount: number;
  requeuedIds: string[];
  poisonFailedCount: number;
  poisonFailedIds: string[];
}

/**
 * Reclaim jobs whose lease has expired back to 'queued' state,
 * or marks poison jobs as 'failed' with error_code 'WORKER_LOST' if delivery_count >= maxDeliveries.
 */
export async function reclaimExpiredLeasesDetailed(
  options: RequeueExpiredOptions = {},
  clientArg?: PoolClient
): Promise<RequeueExpiredResult> {
  const maxDeliveries = options.maxDeliveries ?? GPU_JOB_MAX_DELIVERIES;
  const refTime = options.referenceTime ?? new Date();

  const executeWithClient = async (c: PoolClient): Promise<RequeueExpiredResult> => {
    // 1. Find all expired jobs in claimed or running state
    const findSql = `
      SELECT id, status, delivery_count, claimed_by
      FROM image_jobs
      WHERE status IN ('claimed', 'running')
        AND lease_expires_at < $1::timestamptz
      FOR UPDATE SKIP LOCKED;
    `;
    const findRes = await c.query<{
      id: string;
      status: string;
      delivery_count: number;
      claimed_by: string | null;
    }>(findSql, [refTime.toISOString()]);

    const requeuedIds: string[] = [];
    const poisonFailedIds: string[] = [];

    for (const job of findRes.rows) {
      if (job.delivery_count < maxDeliveries) {
        await c.query(
          `UPDATE image_jobs
           SET status = 'queued',
               claimed_by = NULL,
               lease_expires_at = NULL,
               updated_at = NOW()
           WHERE id = $1;`,
          [job.id]
        );
        requeuedIds.push(job.id);
      } else {
        // Poison job: exceeded max deliveries
        await c.query(
          `UPDATE image_jobs
           SET status = 'failed',
               error_code = 'WORKER_LOST',
               error_message = 'Job delivery attempts exceeded maximum limit of ' || $2 || ' (worker lost / poison job blocked)',
               claimed_by = NULL,
               lease_expires_at = NULL,
               updated_at = NOW()
           WHERE id = $1;`,
          [job.id, maxDeliveries]
        );
        poisonFailedIds.push(job.id);
      }

      // If a worker had active_job_id pointing to this job, clear it
      if (job.claimed_by) {
        await c.query(
          `UPDATE gpu_workers
           SET active_job_id = NULL,
               updated_at = NOW()
           WHERE id = $1 AND active_job_id = $2;`,
          [job.claimed_by, job.id]
        );
      }
    }

    return {
      requeuedCount: requeuedIds.length,
      requeuedIds,
      poisonFailedCount: poisonFailedIds.length,
      poisonFailedIds,
    };
  };

  if (clientArg) {
    return executeWithClient(clientArg);
  }

  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    await conn.query("SET LOCAL app.is_worker_context = 'true'");
    const res = await executeWithClient(conn);
    await conn.query("COMMIT");
    return res;
  } catch (err) {
    await conn.query("ROLLBACK");
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Reclaim jobs whose lease has expired back to 'queued' state.
 * Returns the count of jobs requeued.
 * Supports passing either a PoolClient or RequeueExpiredOptions.
 */
export async function requeueExpiredLeases(
  clientOrOptions?: PoolClient | RequeueExpiredOptions,
  clientArg?: PoolClient
): Promise<number> {
  const options: RequeueExpiredOptions =
    clientOrOptions && !("query" in clientOrOptions)
      ? (clientOrOptions as RequeueExpiredOptions)
      : {};
  const client: PoolClient | undefined =
    clientOrOptions && "query" in clientOrOptions
      ? (clientOrOptions as PoolClient)
      : clientArg;

  const result = await reclaimExpiredLeasesDetailed(options, client);
  return result.requeuedCount;
}

/** Backward-compatible alias for requeueExpiredLeases */
export const reclaimExpiredJobs = requeueExpiredLeases;


/**
 * Spawn a child attempt under the same root_job_id when guardrail fails (seed rotation / prompt boost).
 */
export async function retryJobAttempt(
  previousJobId: string,
  options: {
    newSeed?: number;
    modifiedRequest?: Partial<ImageJobRequestPayload>;
  } = {},
  client?: PoolClient
): Promise<ImageJobRow | null> {
  const findSql = `SELECT * FROM image_jobs WHERE id = $1 LIMIT 1;`;
  const findRes = client
    ? await client.query<ImageJobRow>(findSql, [previousJobId])
    : await query<ImageJobRow>(findSql, [previousJobId]);
  const prev = findRes.rows[0];
  if (!prev) return null;

  const nextAttempt = prev.attempt + 1;
  const newSeed = options.newSeed ?? Math.floor(Math.random() * 2147483647);
  const updatedReq: ImageJobRequestPayload = {
    ...prev.request,
    seed: newSeed,
    ...(options.modifiedRequest || {}),
  };

  return createImageJob(
    {
      root_job_id: prev.root_job_id,
      attempt: nextAttempt,
      workspace_id: prev.workspace_id,
      owner: prev.owner,
      source_ref: prev.source_ref,
      request: updatedReq,
      provider_used: prev.provider_used,
    },
    client
  );
}

export async function findImageJobById(
  jobId: string,
  client?: PoolClient
): Promise<ImageJobRow | null> {
  const sql = `SELECT * FROM image_jobs WHERE id = $1 LIMIT 1;`;
  const res = client
    ? await client.query<ImageJobRow>(sql, [jobId])
    : await query<ImageJobRow>(sql, [jobId]);
  return res.rows[0] || null;
}

export async function findImageJobsByRootId(
  rootJobId: string,
  client?: PoolClient
): Promise<ImageJobRow[]> {
  const sql = `SELECT * FROM image_jobs WHERE root_job_id = $1 ORDER BY attempt ASC;`;
  const res = client
    ? await client.query<ImageJobRow>(sql, [rootJobId])
    : await query<ImageJobRow>(sql, [rootJobId]);
  return res.rows;
}

export async function listAllGpuWorkers(
  client?: PoolClient
): Promise<GpuWorkerRow[]> {
  const sql = `
    SELECT *
    FROM gpu_workers
    WHERE revoked_at IS NULL
    ORDER BY last_seen_at DESC;
  `;
  const res = client
    ? await client.query<GpuWorkerRow>(sql)
    : await query<GpuWorkerRow>(sql);
  return res.rows;
}

export async function listRecentImageJobs(
  limit: number = 20,
  client?: PoolClient
): Promise<ImageJobRow[]> {
  const sql = `
    SELECT *
    FROM image_jobs
    ORDER BY created_at DESC
    LIMIT $1;
  `;
  const res = client
    ? await client.query<ImageJobRow>(sql, [limit])
    : await query<ImageJobRow>(sql, [limit]);
  return res.rows;
}

