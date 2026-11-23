import type { Pool, PoolClient } from 'pg';

export type GpuOfflinePolicy = 'queue_wait' | 'reject' | 'fallback_flux';

export interface GpuRecoveryOptions {
  maxDeliveries?: number;           // GPU_JOB_MAX_DELIVERIES, default 5
  offlineAfterSeconds?: number;     // GPU_WORKER_OFFLINE_AFTER_SECONDS, default 60
  queueTtlSeconds?: number;         // GPU_JOB_QUEUE_TTL_SECONDS, default 600
  offlinePolicy?: GpuOfflinePolicy; // GPU_OFFLINE_POLICY, default 'queue_wait'
  maxAgeSeconds?: number;           // GPU_JOB_MAX_AGE_SECONDS, default 0
}

export interface GpuRecoveryScanResult {
  requeuedLeases: string[];
  failedPoisonJobs: string[];
  offlineWorkers: string[];
  cleanedCurrentJobs: string[];
  rejectedTtlJobs: string[];
  maxAgeExceededJobs: string[];
  overdueQueuedJobs: string[];
}

/**
 * GpuRecoveryScanner (Prompt 10)
 * Periodic recovery scanner for GPU Worker reverse-connection architecture.
 *
 * Rules:
 * (1) Jobs claimed/running past lease_expires_at:
 *     - If delivery_count < maxDeliveries (default 5): requeue to 'queued'
 *     - Otherwise (delivery_count >= maxDeliveries): mark 'failed' with error_code 'WORKER_LOST' (poison job defense)
 * (2) Workers with no heartbeat past offlineAfterSeconds (default 60s):
 *     - Mark status 'offline' and clear active_job_id
 * (3) Jobs queued past queueTtlSeconds (default 600s):
 *     - Apply GPU_OFFLINE_POLICY:
 *       * queue_wait: keep queued, emit log/metric 'queue_overdue'
 *       * reject: transition to 'needs_assets' with 'QUEUE_TTL_EXCEEDED'
 *       * fallback_flux: log warning, behave as queue_wait
 *     - If maxAgeSeconds > 0 and queued age > maxAgeSeconds: transition to 'needs_assets' with 'MAX_AGE_EXCEEDED'
 */
export class GpuRecoveryScanner {
  private readonly maxDeliveries: number;
  private readonly offlineAfterSeconds: number;
  private readonly queueTtlSeconds: number;
  private readonly offlinePolicy: GpuOfflinePolicy;
  private readonly maxAgeSeconds: number;

  constructor(
    private readonly pool: Pool,
    options: GpuRecoveryOptions = {}
  ) {
    this.maxDeliveries =
      options.maxDeliveries ??
      parseInt(process.env.GPU_JOB_MAX_DELIVERIES || '5', 10);
    this.offlineAfterSeconds =
      options.offlineAfterSeconds ??
      parseInt(process.env.GPU_WORKER_OFFLINE_AFTER_SECONDS || '60', 10);
    this.queueTtlSeconds =
      options.queueTtlSeconds ??
      parseInt(process.env.GPU_JOB_QUEUE_TTL_SECONDS || '600', 10);
    this.offlinePolicy =
      options.offlinePolicy ??
      ((process.env.GPU_OFFLINE_POLICY as GpuOfflinePolicy) || 'queue_wait');
    this.maxAgeSeconds =
      options.maxAgeSeconds ??
      parseInt(process.env.GPU_JOB_MAX_AGE_SECONDS || '0', 10);
  }

  /**
   * Helper to check whether any GPU worker is currently active and online.
   */
  async isGpuOnline(
    options: { offlineThresholdSeconds?: number; asOfDate?: Date } = {}
  ): Promise<boolean> {
    const threshold = options.offlineThresholdSeconds ?? this.offlineAfterSeconds;
    const asOf = options.asOfDate ?? new Date();

    const sql = `
      SELECT EXISTS (
        SELECT 1 FROM gpu_workers
        WHERE status IN ('online', 'busy')
          AND revoked_at IS NULL
          AND last_seen_at >= ($1::timestamptz - ($2 || ' seconds')::INTERVAL)
      ) AS is_online;
    `;

    const conn = await this.pool.connect();
    try {
      await conn.query('BEGIN');
      await conn.query("SET LOCAL app.is_worker_context = 'true'");
      const res = await conn.query<{ is_online: boolean }>(sql, [
        asOf.toISOString(),
        threshold.toString(),
      ]);
      await conn.query('COMMIT');
      return Boolean(res.rows[0]?.is_online);
    } catch {
      await conn.query('ROLLBACK');
      return false;
    } finally {
      conn.release();
    }
  }

  /**
   * Execute one complete recovery scan cycle.
   * Can accept a simulatedNow date for deterministic time-machine testing.
   */
  async runOnce(simulatedNow?: Date): Promise<GpuRecoveryScanResult> {
    const refTime = simulatedNow ?? new Date();
    const conn = await this.pool.connect();

    try {
      await conn.query('BEGIN');
      await conn.query("SET LOCAL app.is_worker_context = 'true'");

      // ======================================================================
      // RULE 1: Expired lease recovery (claimed / running past lease_expires_at)
      // ======================================================================
      const expiredJobsSql = `
        SELECT id, status, delivery_count, claimed_by
        FROM image_jobs
        WHERE status IN ('claimed', 'running')
          AND lease_expires_at < $1::timestamptz
        FOR UPDATE SKIP LOCKED;
      `;
      const expiredRes = await conn.query<{
        id: string;
        status: string;
        delivery_count: number;
        claimed_by: string | null;
      }>(expiredJobsSql, [refTime.toISOString()]);

      const requeuedLeases: string[] = [];
      const failedPoisonJobs: string[] = [];

      for (const job of expiredRes.rows) {
        if (job.delivery_count < this.maxDeliveries) {
          // Requeue back to queued
          await conn.query(
            `UPDATE image_jobs
             SET status = 'queued',
                 claimed_by = NULL,
                 lease_expires_at = NULL,
                 updated_at = NOW()
             WHERE id = $1;`,
            [job.id]
          );
          requeuedLeases.push(job.id);
        } else {
          // Poison job defense: delivery limit exceeded
          await conn.query(
            `UPDATE image_jobs
             SET status = 'failed',
                 error_code = 'WORKER_LOST',
                 error_message = 'Job delivery attempts exceeded maximum limit of ' || $2 || ' (worker lost / poison job blocked)',
                 claimed_by = NULL,
                 lease_expires_at = NULL,
                 updated_at = NOW()
             WHERE id = $1;`,
            [job.id, this.maxDeliveries]
          );
          failedPoisonJobs.push(job.id);
        }

        // Clean worker's active_job_id if it pointed to this job
        if (job.claimed_by) {
          await conn.query(
            `UPDATE gpu_workers
             SET active_job_id = NULL,
                 updated_at = NOW()
             WHERE id = $1 AND active_job_id = $2;`,
            [job.claimed_by, job.id]
          );
        }
      }

      // ======================================================================
      // RULE 2: Stale worker detection (no heartbeat > offlineAfterSeconds)
      // ======================================================================
      const staleWorkersSql = `
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
      const staleRes = await conn.query<{ id: string }>(staleWorkersSql, [
        refTime.toISOString(),
        this.offlineAfterSeconds.toString(),
      ]);

      // Also clean active_job_id on any worker currently offline but retaining an active_job_id
      const cleanOfflineWorkersSql = `
        UPDATE gpu_workers
        SET active_job_id = NULL,
            updated_at = NOW()
        WHERE status = 'offline'
          AND active_job_id IS NOT NULL
        RETURNING id;
      `;
      const cleanOfflineRes = await conn.query<{ id: string }>(cleanOfflineWorkersSql);

      const offlineWorkers = staleRes.rows.map((r) => r.id);
      const cleanedCurrentJobs = cleanOfflineRes.rows.map((r) => r.id);

      // ======================================================================
      // RULE 3: Queued jobs policy & TTL evaluation
      // ======================================================================
      const queuedJobsSql = `
        SELECT id, queued_at, created_at,
               EXTRACT(EPOCH FROM ($1::timestamptz - COALESCE(queued_at, created_at)))::numeric AS age_seconds
        FROM image_jobs
        WHERE status = 'queued'
        ORDER BY COALESCE(queued_at, created_at) ASC
        FOR UPDATE SKIP LOCKED;
      `;
      const queuedRes = await conn.query<{
        id: string;
        queued_at: string | null;
        created_at: string;
        age_seconds: string;
      }>(queuedJobsSql, [refTime.toISOString()]);

      const rejectedTtlJobs: string[] = [];
      const maxAgeExceededJobs: string[] = [];
      const overdueQueuedJobs: string[] = [];

      for (const row of queuedRes.rows) {
        const age = Number(row.age_seconds);

        // 1. Hard maximum age limit (overrides policy if set)
        if (this.maxAgeSeconds > 0 && age >= this.maxAgeSeconds) {
          await conn.query(
            `UPDATE image_jobs
             SET status = 'needs_assets',
                 error_code = 'MAX_AGE_EXCEEDED',
                 error_message = 'Job queued for longer than maximum allowed age limit (' || $2 || 's)',
                 updated_at = NOW()
             WHERE id = $1 AND status = 'queued';`,
            [row.id, this.maxAgeSeconds]
          );
          maxAgeExceededJobs.push(row.id);
          continue;
        }

        // 2. Queue TTL check
        if (this.queueTtlSeconds > 0 && age >= this.queueTtlSeconds) {
          if (this.offlinePolicy === 'reject') {
            await conn.query(
              `UPDATE image_jobs
               SET status = 'needs_assets',
                   error_code = 'QUEUE_TTL_EXCEEDED',
                   error_message = 'Job queued for longer than queue TTL (' || $2 || 's) and GPU_OFFLINE_POLICY is reject',
                   updated_at = NOW()
               WHERE id = $1 AND status = 'queued';`,
              [row.id, this.queueTtlSeconds]
            );
            rejectedTtlJobs.push(row.id);
          } else {
            if (this.offlinePolicy === 'fallback_flux') {
              console.warn(
                `[gpu-recovery] Warning: fallback_flux policy not implemented; falling back to queue_wait for job ${row.id}`
              );
            }
            // Default queue_wait: keep in queued, log metric
            console.info(
              `[gpu-recovery] metric=queue_overdue job_id=${row.id} age_seconds=${Math.floor(age)}`
            );
            overdueQueuedJobs.push(row.id);
          }
        }
      }

      await conn.query('COMMIT');

      return {
        requeuedLeases,
        failedPoisonJobs,
        offlineWorkers,
        cleanedCurrentJobs,
        rejectedTtlJobs,
        maxAgeExceededJobs,
        overdueQueuedJobs,
      };
    } catch (err) {
      await conn.query('ROLLBACK');
      throw err;
    } finally {
      conn.release();
    }
  }
}

