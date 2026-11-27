import { randomUUID, createHash } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import {
  registerWorker,
  updateWorkerHeartbeat,
  createImageJob,
  claimNextJob,
  findImageJobById,
  gpuIsOnline,
  isGpuOnline,
  requeueExpiredLeases,
} from "../../src/modules/gpuWorkers/repository";
import {
  runGpuRecoveryScan,
  markStaleWorkersOffline,
  evaluateQueuedJobsPolicy,
} from "../../src/modules/gpuWorkers/recovery";

const RUN = process.env.RUN_DB_TESTS === "1";
const TRIPC_WORKSPACE = "10000000-0000-4000-8000-000000000001";

describe.skipIf(!RUN)("Live DB Integration: GPU Recovery Scanner (Prompt 10)", () => {
  let pool: Pool;

  beforeAll(async () => {
    const connStr =
      process.env.DATABASE_URL ||
      "postgres://ai_growth_dev:ae5a9cb1e19ca954422a6aca20206537f63c9e716a051c1f250bac717c74d4b9@127.0.0.1:15432/ai_growth_os";
    pool = new Pool({ connectionString: connStr });

    // Cancel existing queued/active jobs to ensure clean slate
    await pool.query(
      `UPDATE image_jobs SET status = 'cancelled' WHERE status IN ('queued', 'claimed', 'running');`
    );
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    await pool.query(
      `UPDATE image_jobs SET status = 'cancelled' WHERE status IN ('queued', 'claimed', 'running');`
    );
  });

  async function createTestWorker(prefix: string) {
    const rawSecret = `gwk_live_${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const tokenHash = createHash("sha256").update(rawSecret).digest("hex");
    const worker = await registerWorker({
      name: `Recovery Worker ${prefix}`,
      token_hash: tokenHash,
      status: "online",
      model_key: "a327ebf7-c854-4319-b160-00dbd6498427",
    });
    return { worker, rawSecret, tokenHash };
  }

  it("1. Worker dies / lease expires -> job returns to queued exactly once and delivery_count increases on next claim", async () => {
    const { worker: worker1 } = await createTestWorker("dead_worker1");
    const { worker: worker2 } = await createTestWorker("healthy_worker2");

    const job = await createImageJob({
      workspace_id: TRIPC_WORKSPACE,
      owner: "editor@tripc.test",
      request: {
        prompt: "A beautiful tropical beach resort",
        negative_prompt: "blurry, low quality",
        width: 1080,
        height: 1080,
        seed: 123456,
        model_key: "a327ebf7-c854-4319-b160-00dbd6498427",
      },
    });
    expect(job.delivery_count).toBe(0);
    expect(job.status).toBe("queued");

    // Worker 1 claims the job
    const claimed1 = await claimNextJob(worker1.id);
    expect(claimed1).not.toBeNull();
    expect(claimed1?.id).toBe(job.id);
    expect(claimed1?.claimed_by).toBe(worker1.id);
    expect(claimed1?.status).toBe("claimed");
    expect(claimed1?.delivery_count).toBe(1);

    // Simulate time advancing past lease expiration (120s lease -> +130s)
    const simulatedCrashTime = new Date(Date.now() + 130_000);

    // Run recovery scanner with simulated clock
    const scanResult1 = await runGpuRecoveryScan(pool, {}, simulatedCrashTime);
    expect(scanResult1.requeuedLeases).toContain(job.id);
    expect(scanResult1.failedPoisonJobs).not.toContain(job.id);

    // Verify job in database: returned to queued, lease and worker cleared, delivery_count preserved
    const afterCrashJob = await findImageJobById(job.id);
    expect(afterCrashJob?.status).toBe("queued");
    expect(afterCrashJob?.claimed_by).toBeNull();
    expect(afterCrashJob?.lease_expires_at).toBeNull();
    expect(afterCrashJob?.delivery_count).toBe(1);

    // Run recovery scanner again at the same timestamp -> should NOT requeue again (requeued exactly once!)
    const scanResultSecond = await runGpuRecoveryScan(pool, {}, simulatedCrashTime);
    expect(scanResultSecond.requeuedLeases).not.toContain(job.id);

    // Worker 2 claims the recovered job
    const claimed2 = await claimNextJob(worker2.id);
    expect(claimed2).not.toBeNull();
    expect(claimed2?.id).toBe(job.id);
    expect(claimed2?.claimed_by).toBe(worker2.id);
    expect(claimed2?.status).toBe("claimed");
    expect(claimed2?.delivery_count).toBe(2); // delivery_count successfully incremented!
  });

  it("2. Poison pill job: repeatedly crashes worker -> blocked and marked failed with WORKER_LOST after 5 deliveries", async () => {
    const { worker } = await createTestWorker("poison_victim");

    const poisonJob = await createImageJob({
      workspace_id: TRIPC_WORKSPACE,
      owner: "editor@tripc.test",
      request: {
        prompt: "Poison prompt that triggers CUDA crash",
        negative_prompt: "blurry",
        width: 1080,
        height: 1080,
        seed: 999999,
        model_key: "a327ebf7-c854-4319-b160-00dbd6498427",
      },
    });

    let currentSimulatedTime = Date.now();

    // Deliveries 1 through 4: worker claims -> lease expires -> scanner requeues
    for (let delivery = 1; delivery <= 4; delivery++) {
      const claimed = await claimNextJob(worker.id);
      expect(claimed?.id).toBe(poisonJob.id);
      expect(claimed?.delivery_count).toBe(delivery);

      currentSimulatedTime += 130_000;
      const res = await runGpuRecoveryScan(
        pool,
        { maxDeliveries: 5 },
        new Date(currentSimulatedTime)
      );
      expect(res.requeuedLeases).toContain(poisonJob.id);
      expect(res.failedPoisonJobs).not.toContain(poisonJob.id);

      const check = await findImageJobById(poisonJob.id);
      expect(check?.status).toBe("queued");
      expect(check?.delivery_count).toBe(delivery);
    }

    // Delivery 5: worker claims the job for the 5th time
    const claimed5 = await claimNextJob(worker.id);
    expect(claimed5?.id).toBe(poisonJob.id);
    expect(claimed5?.delivery_count).toBe(5);

    // Worker crashes again on 5th delivery -> lease expires
    currentSimulatedTime += 130_000;
    const poisonScanResult = await runGpuRecoveryScan(
      pool,
      { maxDeliveries: 5 },
      new Date(currentSimulatedTime)
    );

    // Verify poison job was failed instead of requeued
    expect(poisonScanResult.requeuedLeases).not.toContain(poisonJob.id);
    expect(poisonScanResult.failedPoisonJobs).toContain(poisonJob.id);

    const finalJob = await findImageJobById(poisonJob.id);
    expect(finalJob?.status).toBe("failed");
    expect(finalJob?.error_code).toBe("WORKER_LOST");
    expect(finalJob?.error_message).toContain("Job delivery attempts exceeded maximum limit");

    // Verify subsequent claims do not pick up the poison job
    const nextClaim = await claimNextJob(worker.id);
    expect(nextClaim).toBeNull();
  });

  it("3. Stale worker detection: worker with no heartbeat > GPU_WORKER_OFFLINE_AFTER_SECONDS is marked offline and active_job_id cleared", async () => {
    const { worker } = await createTestWorker("stale_node");

    // Associate a dummy active_job_id
    const job = await createImageJob({
      workspace_id: TRIPC_WORKSPACE,
      owner: "editor@tripc.test",
      request: {
        prompt: "Test job",
        negative_prompt: "",
        width: 1080,
        height: 1080,
        seed: 111,
      },
    });

    await pool.query(
      `UPDATE gpu_workers SET status = 'online', last_seen_at = NOW(), active_job_id = $1 WHERE id = $2`,
      [job.id, worker.id]
    );

    // Advance simulated time by 75 seconds (threshold default is 60s)
    const simulatedTime = new Date(Date.now() + 75_000);
    const workerResult = await markStaleWorkersOffline(
      { offlineThresholdSeconds: 60, referenceTime: simulatedTime },
      pool
    );

    expect(workerResult.offlineWorkers).toContain(worker.id);

    const workerCheck = await pool.query<{ status: string; active_job_id: string | null }>(
      `SELECT status, active_job_id FROM gpu_workers WHERE id = $1`,
      [worker.id]
    );
    expect(workerCheck.rows[0].status).toBe("offline");
    expect(workerCheck.rows[0].active_job_id).toBeNull();
  });

  it("4. Queued jobs TTL policy: queue_wait preserves queued state and logs metric", async () => {
    const job = await createImageJob({
      workspace_id: TRIPC_WORKSPACE,
      owner: "editor@tripc.test",
      request: {
        prompt: "Overdue queued job with queue_wait policy",
        negative_prompt: "",
        width: 1080,
        height: 1080,
        seed: 222,
      },
    });

    // Advance simulated time by 650 seconds (exceeds default TTL 600s)
    const simulatedTime = new Date(Date.now() + 650_000);

    const policyRes = await evaluateQueuedJobsPolicy({
      queueTtlSeconds: 600,
      offlinePolicy: "queue_wait",
      maxAgeSeconds: 0,
      referenceTime: simulatedTime,
    });

    expect(policyRes.overdueQueuedJobs).toContain(job.id);
    expect(policyRes.rejectedTtlJobs).not.toContain(job.id);

    const jobCheck = await findImageJobById(job.id);
    expect(jobCheck?.status).toBe("queued");
  });

  it("5. Queued jobs TTL policy: reject transitions overdue queued job to needs_assets", async () => {
    const job = await createImageJob({
      workspace_id: TRIPC_WORKSPACE,
      owner: "editor@tripc.test",
      request: {
        prompt: "Overdue queued job with reject policy",
        negative_prompt: "",
        width: 1080,
        height: 1080,
        seed: 333,
      },
    });

    const simulatedTime = new Date(Date.now() + 650_000);

    const policyRes = await evaluateQueuedJobsPolicy({
      queueTtlSeconds: 600,
      offlinePolicy: "reject",
      maxAgeSeconds: 0,
      referenceTime: simulatedTime,
    });

    expect(policyRes.rejectedTtlJobs).toContain(job.id);

    const jobCheck = await findImageJobById(job.id);
    expect(jobCheck?.status).toBe("needs_assets");
    expect(jobCheck?.error_code).toBe("QUEUE_TTL_EXCEEDED");
    expect(jobCheck?.error_message).toContain("Job queued for longer than queue TTL");
  });

  it("6. Hard max age check: job queued > GPU_JOB_MAX_AGE_SECONDS transitions to needs_assets regardless of policy", async () => {
    const job = await createImageJob({
      workspace_id: TRIPC_WORKSPACE,
      owner: "editor@tripc.test",
      request: {
        prompt: "Job exceeding hard max age limit",
        negative_prompt: "",
        width: 1080,
        height: 1080,
        seed: 444,
      },
    });

    // Advance simulated time by 3700 seconds with maxAgeSeconds = 3600
    const simulatedTime = new Date(Date.now() + 3700_000);

    const policyRes = await evaluateQueuedJobsPolicy({
      queueTtlSeconds: 600,
      offlinePolicy: "queue_wait", // Even with queue_wait, hard maxAge takes precedence!
      maxAgeSeconds: 3600,
      referenceTime: simulatedTime,
    });

    expect(policyRes.maxAgeExceededJobs).toContain(job.id);

    const jobCheck = await findImageJobById(job.id);
    expect(jobCheck?.status).toBe("needs_assets");
    expect(jobCheck?.error_code).toBe("MAX_AGE_EXCEEDED");
    expect(jobCheck?.error_message).toContain("Job queued for longer than maximum allowed age limit");
  });

  it("7. Shared gpuIsOnline() helper: returns true when worker heartbeat is fresh, false when offline/stale", async () => {
    const { worker } = await createTestWorker("online_tester");

    // Worker is online and heartbeat is fresh
    await pool.query(
      `UPDATE gpu_workers SET status = 'online', last_seen_at = NOW(), revoked_at = NULL WHERE id = $1`,
      [worker.id]
    );

    const onlineNow = await gpuIsOnline(pool, { offlineThresholdSeconds: 60 });
    expect(onlineNow).toBe(true);

    const isOnlineAlias = await isGpuOnline(pool, { offlineThresholdSeconds: 60 });
    expect(isOnlineAlias).toBe(true);

    // Stale heartbeat (> 60s ago)
    await pool.query(
      `UPDATE gpu_workers SET status = 'online', last_seen_at = NOW() - INTERVAL '70 seconds' WHERE id = $1`,
      [worker.id]
    );
    // Ensure other test workers aren't keeping it online
    await pool.query(
      `UPDATE gpu_workers SET status = 'offline' WHERE id != $1 AND status IN ('online', 'busy')`,
      [worker.id]
    );

    const onlineStale = await gpuIsOnline(pool, { offlineThresholdSeconds: 60 });
    expect(onlineStale).toBe(false);

    // Worker status is offline or disabled
    await pool.query(`UPDATE gpu_workers SET status = 'disabled' WHERE id = $1`, [worker.id]);
    const onlineDisabled = await gpuIsOnline(pool, { offlineThresholdSeconds: 60 });
    expect(onlineDisabled).toBe(false);
  });
});
