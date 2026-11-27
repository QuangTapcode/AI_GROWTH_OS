import type { Pool, PoolClient } from "pg";
import pool from "../../lib/db";
import {
  GpuRecoveryOptions,
  GpuRecoveryScanResult,
  GpuOfflinePolicy,
} from "./models";
import {
  GPU_JOB_MAX_DELIVERIES,
  GPU_WORKER_OFFLINE_AFTER_SECONDS,
  GPU_JOB_QUEUE_TTL_SECONDS,
  GPU_JOB_MAX_AGE_SECONDS,
  GPU_OFFLINE_POLICY,
  reclaimExpiredLeasesDetailed,
} from "./repository";

function isPoolClient(obj: any): obj is PoolClient {
  return Boolean(obj && typeof obj.query === "function" && typeof obj.release === "function");
}

export interface StaleWorkersResult {

  offlineWorkers: string[];
  cleanedCurrentJobs: string[];
}

export interface QueuedPolicyResult {
  rejectedTtlJobs: string[];
  maxAgeExceededJobs: string[];
  overdueQueuedJobs: string[];
}

/**
 * Rule 2: Stale Worker Detection (Heartbeat Timeout)
 * Marks workers with no heartbeat for > GPU_WORKER_OFFLINE_AFTER_SECONDS as 'offline'
 * and clears their active_job_id.
 */
export async function markStaleWorkersOffline(
  options: {
    offlineThresholdSeconds?: number;
    referenceTime?: Date;
  } = {},
  clientOrPool?: Pool | PoolClient
): Promise<StaleWorkersResult> {
  const threshold = options.offlineThresholdSeconds ?? GPU_WORKER_OFFLINE_AFTER_SECONDS;
  const refTime = options.referenceTime ?? new Date();

  const execute = async (c: PoolClient): Promise<StaleWorkersResult> => {
    // 1. Mark stale online/busy workers as offline and clear active_job_id
    const markSql = `
      UPDATE gpu_workers
      SET status = 'offline',
          active_job_id = NULL,
          updated_at = NOW()
      WHERE status IN ('online', 'busy')
        AND revoked_at IS NULL
        AND (
          last_seen_at < ($1::timestamptz - ($2 || ' seconds')::INTERVAL)
          OR (last_seen_at IS NULL AND created_at < ($1::timestamptz - ($2 || ' seconds')::INTERVAL))
        )
      RETURNING id;
    `;
    const markRes = await c.query<{ id: string }>(markSql, [
      refTime.toISOString(),
      threshold.toString(),
    ]);

    // 2. Also clean any already-offline workers that still have an active_job_id
    const cleanSql = `
      UPDATE gpu_workers
      SET active_job_id = NULL,
          updated_at = NOW()
      WHERE status = 'offline'
        AND active_job_id IS NOT NULL
      RETURNING id;
    `;
    const cleanRes = await c.query<{ id: string }>(cleanSql);

    return {
      offlineWorkers: markRes.rows.map((r) => r.id),
      cleanedCurrentJobs: cleanRes.rows.map((r) => r.id),
    };
  };

  if (clientOrPool && isPoolClient(clientOrPool)) {
    return execute(clientOrPool);
  }

  const targetPool = (clientOrPool as Pool) || pool;
  const conn = await targetPool.connect();
  try {
    await conn.query("BEGIN");
    await conn.query("SET LOCAL app.is_worker_context = 'true'");
    const res = await execute(conn);
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
 * Rule 3: Queued Jobs TTL & Max Age Evaluation
 * Evaluates overdue queued jobs against GPU_OFFLINE_POLICY and hard GPU_JOB_MAX_AGE_SECONDS.
 */
export async function evaluateQueuedJobsPolicy(
  options: {
    queueTtlSeconds?: number;
    offlinePolicy?: GpuOfflinePolicy;
    maxAgeSeconds?: number;
    referenceTime?: Date;
  } = {},
  clientOrPool?: Pool | PoolClient
): Promise<QueuedPolicyResult> {
  const queueTtl = options.queueTtlSeconds ?? GPU_JOB_QUEUE_TTL_SECONDS;
  const policy = options.offlinePolicy ?? GPU_OFFLINE_POLICY;
  const maxAge = options.maxAgeSeconds ?? GPU_JOB_MAX_AGE_SECONDS;
  const refTime = options.referenceTime ?? new Date();

  const execute = async (c: PoolClient): Promise<QueuedPolicyResult> => {
    // Select all queued jobs and compute their age in seconds
    const sql = `
      SELECT id, queued_at, created_at,
             EXTRACT(EPOCH FROM ($1::timestamptz - COALESCE(queued_at, created_at)))::numeric AS age_seconds
      FROM image_jobs
      WHERE status = 'queued'
      ORDER BY COALESCE(queued_at, created_at) ASC
      FOR UPDATE SKIP LOCKED;
    `;
    const res = await c.query<{
      id: string;
      queued_at: string | null;
      created_at: string;
      age_seconds: string;
    }>(sql, [refTime.toISOString()]);

    const rejectedTtlJobs: string[] = [];
    const maxAgeExceededJobs: string[] = [];
    const overdueQueuedJobs: string[] = [];

    for (const row of res.rows) {
      const age = Number(row.age_seconds);

      // 1. Hard maximum age check (overrides policy if set)
      if (maxAge > 0 && age >= maxAge) {
        await c.query(
          `UPDATE image_jobs
           SET status = 'needs_assets',
               error_code = 'MAX_AGE_EXCEEDED',
               error_message = 'Job queued for longer than maximum allowed age limit (' || $2 || 's)',
               updated_at = NOW()
           WHERE id = $1 AND status = 'queued';`,
          [row.id, maxAge]
        );
        maxAgeExceededJobs.push(row.id);
        continue;
      }

      // 2. Queue TTL check
      if (queueTtl > 0 && age >= queueTtl) {
        if (policy === "reject") {
          await c.query(
            `UPDATE image_jobs
             SET status = 'needs_assets',
                 error_code = 'QUEUE_TTL_EXCEEDED',
                 error_message = 'Job queued for longer than queue TTL (' || $2 || 's) and GPU_OFFLINE_POLICY is reject',
                 updated_at = NOW()
             WHERE id = $1 AND status = 'queued';`,
            [row.id, queueTtl]
          );
          rejectedTtlJobs.push(row.id);
        } else {
          if (policy === "fallback_flux") {
            console.warn(
              `[gpu-recovery] Warning: fallback_flux policy not implemented; falling back to queue_wait for job ${row.id}`
            );
          }
          // Default: queue_wait (retain queued state, emit metric)
          console.info(
            `[gpu-recovery] metric=queue_overdue job_id=${row.id} age_seconds=${Math.floor(age)}`
          );
          overdueQueuedJobs.push(row.id);
        }
      }
    }

    return {
      rejectedTtlJobs,
      maxAgeExceededJobs,
      overdueQueuedJobs,
    };
  };

  if (clientOrPool && isPoolClient(clientOrPool)) {
    return execute(clientOrPool);
  }

  const targetPool = (clientOrPool as Pool) || pool;
  const conn = await targetPool.connect();
  try {
    await conn.query("BEGIN");
    await conn.query("SET LOCAL app.is_worker_context = 'true'");
    const res = await execute(conn);
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
 * Runs a complete GPU recovery scan executing all 3 recovery rules:
 * 1. Expired Lease Recovery (claimed/running -> queued or failed if poison job >= maxDeliveries)
 * 2. Stale Worker Detection (offline after threshold, clear active_job_id)
 * 3. Overdue Queued Jobs (TTL / Max Age evaluation)
 */
export async function runGpuRecoveryScan(
  clientOrPool?: Pool | PoolClient,
  options: GpuRecoveryOptions = {},
  simulatedNow?: Date
): Promise<GpuRecoveryScanResult> {
  const refTime = simulatedNow ?? options.referenceTime ?? new Date();

  const runWithClient = async (client: PoolClient): Promise<GpuRecoveryScanResult> => {
    // Rule 1: Lease recovery
    const leaseRes = await reclaimExpiredLeasesDetailed(
      {
        maxDeliveries: options.maxDeliveries ?? GPU_JOB_MAX_DELIVERIES,
        referenceTime: refTime,
      },
      client
    );

    // Rule 2: Stale worker detection
    const workerRes = await markStaleWorkersOffline(
      {
        offlineThresholdSeconds:
          options.offlineAfterSeconds ?? GPU_WORKER_OFFLINE_AFTER_SECONDS,
        referenceTime: refTime,
      },
      client
    );

    // Rule 3: Queued jobs policy
    const queuedRes = await evaluateQueuedJobsPolicy(
      {
        queueTtlSeconds: options.queueTtlSeconds ?? GPU_JOB_QUEUE_TTL_SECONDS,
        offlinePolicy: options.offlinePolicy ?? GPU_OFFLINE_POLICY,
        maxAgeSeconds: options.maxAgeSeconds ?? GPU_JOB_MAX_AGE_SECONDS,
        referenceTime: refTime,
      },
      client
    );

    return {
      requeuedLeases: leaseRes.requeuedIds,
      failedPoisonJobs: leaseRes.poisonFailedIds,
      offlineWorkers: workerRes.offlineWorkers,
      cleanedCurrentJobs: workerRes.cleanedCurrentJobs,
      rejectedTtlJobs: queuedRes.rejectedTtlJobs,
      maxAgeExceededJobs: queuedRes.maxAgeExceededJobs,
      overdueQueuedJobs: queuedRes.overdueQueuedJobs,
    };
  };

  if (clientOrPool && isPoolClient(clientOrPool)) {
    return runWithClient(clientOrPool);
  }

  const targetPool = (clientOrPool as Pool) || pool;
  const conn = await targetPool.connect();
  try {
    await conn.query("BEGIN");
    await conn.query("SET LOCAL app.is_worker_context = 'true'");
    const res = await runWithClient(conn);
    await conn.query("COMMIT");
    return res;
  } catch (err) {
    await conn.query("ROLLBACK");
    throw err;
  } finally {
    conn.release();
  }
}
