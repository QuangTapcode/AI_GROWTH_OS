import { randomUUID, createHash } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool, PoolClient } from "pg";
import {
  registerWorker,
  findWorkerByTokenHash,
  updateWorkerHeartbeat,
  createImageJob,
  claimNextJob,
  extendLease,
  markRunning,
  markUploaded,
  completeJob,
  failJob,
  cancelQueuedJob,
  requeueExpiredLeases,
  retryJobAttempt,
  findImageJobById,
  findImageJobsByRootId,
} from "../../src/modules/gpuWorkers/repository";
import {
  InvalidJobStateTransitionError,
  JobNotFoundError,
  JobWorkerMismatchError,
} from "../../src/modules/gpuWorkers/models";

const RUN = process.env.RUN_DB_TESTS === "1";
const TRIPC_WORKSPACE = "10000000-0000-4000-8000-000000000001";

describe.skipIf(!RUN)("Live DB Integration: gpu_workers & image_jobs queue", () => {
  let pool: Pool;

  beforeAll(async () => {
    const connStr =
      process.env.DATABASE_URL ||
      "postgres://ai_growth_dev:ae5a9cb1e19ca954422a6aca20206537f63c9e716a051c1f250bac717c74d4b9@127.0.0.1:15432/ai_growth_os";
    pool = new Pool({ connectionString: connStr });

    await pool.query(`UPDATE image_jobs SET status = 'cancelled' WHERE status = 'queued';`);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    // Ensure clean queue state before each test case
    await pool.query(`UPDATE image_jobs SET status = 'cancelled' WHERE status IN ('queued', 'claimed', 'running');`);
  });

  it("1. Worker registration, token lookup & heartbeat telemetry", async () => {
    const rawSecret = `gwk_live_test_${Date.now()}`;
    const tokenHash = createHash("sha256").update(rawSecret).digest("hex");

    const worker = await registerWorker({
      name: "RTX 4090 Test Station",
      token_hash: tokenHash,
      status: "online",
      worker_version: "1.0.0",
      engine_version: "7.0.0-alpha.4",
      model_key: "a327ebf7-c854-4319-b160-00dbd6498427",
      vram_free_mb: 24576,
    });

    expect(worker).toBeDefined();
    expect(worker.name).toBe("RTX 4090 Test Station");
    expect(worker.token_hash).toBe(tokenHash);

    const found = await findWorkerByTokenHash(tokenHash);
    expect(found).toBeDefined();
    expect(found?.id).toBe(worker.id);

    const updated = await updateWorkerHeartbeat(worker.id, {
      status: "busy",
      vram_free_mb: 18000,
    });
    expect(updated?.status).toBe("busy");
    expect(updated?.vram_free_mb).toBe(18000);
    expect(updated?.last_seen_at).toBeDefined();
  });

  it("2. Single-worker job lifecycle: enqueue -> claim -> markRunning -> markUploaded -> complete", async () => {
    const tokenHash = createHash("sha256").update(`worker_${Date.now()}`).digest("hex");
    const worker = await registerWorker({
      name: "Worker Lifecycle Test",
      token_hash: tokenHash,
      status: "online",
    });

    // Enqueue
    const job = await createImageJob({
      workspace_id: TRIPC_WORKSPACE,
      owner: "content_agent",
      source_ref: "article:demo-1",
      request: {
        prompt: "Sunset over Son Tra Peninsula",
        negative_prompt: "blurry, text, watermark",
        width: 1080,
        height: 1080,
        seed: 123456,
        steps: 30,
        cfg_scale: 7.0,
        model_key: "a327ebf7-c854-4319-b160-00dbd6498427",
      },
    });

    expect(job.status).toBe("queued");
    expect(job.attempt).toBe(1);
    expect(job.delivery_count).toBe(0);

    // Claim
    const claimed = await claimNextJob(worker.id, ["a327ebf7-c854-4319-b160-00dbd6498427"], 120);
    expect(claimed).toBeDefined();
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("claimed");
    expect(claimed?.claimed_by).toBe(worker.id);
    expect(claimed?.delivery_count).toBe(1);
    expect(claimed?.lease_expires_at).toBeDefined();

    // Extend lease
    const extended = await extendLease(job.id, worker.id, 180);
    expect(extended.status).toBe("claimed");

    // Mark running
    const running = await markRunning(job.id, worker.id);
    expect(running.status).toBe("running");

    // Mark uploaded
    const uploaded = await markUploaded(job.id, worker.id, {
      storage_key: "generated/test_sunset.webp",
      sha256: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    });
    expect(uploaded.status).toBe("uploaded");
    expect(uploaded.result_storage_key).toBe("generated/test_sunset.webp");

    // Complete job
    const completed = await completeJob(job.id, worker.id);
    expect(completed.status).toBe("completed");
    expect(completed.completed_at).toBeDefined();
  });

  it("3. Chuyển trạng thái sai bị từ chối với lỗi có kiểu (Typed Error Rejection)", async () => {
    const worker1Hash = createHash("sha256").update(`worker_sm_1_${Date.now()}`).digest("hex");
    const worker1 = await registerWorker({ name: "Worker SM 1", token_hash: worker1Hash, status: "online" });

    const worker2Hash = createHash("sha256").update(`worker_sm_2_${Date.now()}`).digest("hex");
    const worker2 = await registerWorker({ name: "Worker SM 2", token_hash: worker2Hash, status: "online" });

    const job = await createImageJob({
      workspace_id: TRIPC_WORKSPACE,
      owner: "content_agent",
      request: { prompt: "State Machine Test", negative_prompt: "", width: 1080, height: 1080, seed: 101 },
    });

    // 3.1: Không thể markRunning khi job còn ở queued -> InvalidJobStateTransitionError
    await expect(markRunning(job.id, worker1.id)).rejects.toThrow(InvalidJobStateTransitionError);

    // 3.2: Không thể completeJob khi job còn ở queued -> InvalidJobStateTransitionError
    await expect(completeJob(job.id, worker1.id)).rejects.toThrow(InvalidJobStateTransitionError);

    // 3.3: Worker 1 claim job
    const claimed = await claimNextJob(worker1.id);
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.status).toBe("claimed");

    // 3.4: Worker 2 cố tình cập nhật job của Worker 1 -> Bị từ chối bằng JobWorkerMismatchError
    await expect(markRunning(job.id, worker2.id)).rejects.toThrow(JobWorkerMismatchError);
    await expect(extendLease(job.id, worker2.id)).rejects.toThrow(JobWorkerMismatchError);

    // 3.5: Worker 1 chuyển claimed -> running thành công
    const running = await markRunning(job.id, worker1.id);
    expect(running.status).toBe("running");

    // 3.6: Không thể chuyển running -> running lần 2
    await expect(markRunning(job.id, worker1.id)).rejects.toThrow(InvalidJobStateTransitionError);

    // 3.7: Worker 1 chuyển running -> uploaded
    const uploaded = await markUploaded(job.id, worker1.id, { storage_key: "key.webp", sha256: "hash123" });
    expect(uploaded.status).toBe("uploaded");

    // 3.8: Complete job
    const completed = await completeJob(job.id, worker1.id);
    expect(completed.status).toBe("completed");

    // 3.9: Trạng thái completed là terminal: không thể failJob hoặc cancelQueuedJob
    await expect(failJob(job.id, worker1.id, "SOME_ERR")).rejects.toThrow(InvalidJobStateTransitionError);
    await expect(cancelQueuedJob(job.id)).rejects.toThrow(InvalidJobStateTransitionError);

    // 3.10: Gọi ID không tồn tại -> JobNotFoundError
    const fakeId = randomUUID();
    await expect(markRunning(fakeId, worker1.id)).rejects.toThrow(JobNotFoundError);
  });

  it("4. Lease hết hạn thì requeue và worker khác claim lại được với delivery_count tăng", async () => {
    const worker1Hash = createHash("sha256").update(`worker_req_1_${Date.now()}`).digest("hex");
    const worker1 = await registerWorker({ name: "Worker Expire 1", token_hash: worker1Hash, status: "online" });

    const worker2Hash = createHash("sha256").update(`worker_req_2_${Date.now()}`).digest("hex");
    const worker2 = await registerWorker({ name: "Worker Expire 2", token_hash: worker2Hash, status: "online" });

    // Enqueue job
    const job = await createImageJob({
      workspace_id: TRIPC_WORKSPACE,
      owner: "content_agent",
      request: { prompt: "Requeue Test", negative_prompt: "", width: 1080, height: 1080, seed: 999 },
    });

    // Worker 1 claims job
    const claimed1 = await claimNextJob(worker1.id);
    expect(claimed1?.id).toBe(job.id);
    expect(claimed1?.delivery_count).toBe(1);

    // Simulate expired lease in past
    await pool.query(
      `UPDATE image_jobs SET lease_expires_at = NOW() - INTERVAL '10 seconds' WHERE id = $1`,
      [job.id]
    );

    // Requeue expired leases
    const requeuedCount = await requeueExpiredLeases();
    expect(requeuedCount).toBeGreaterThanOrEqual(1);

    const checkJob = await findImageJobById(job.id);
    expect(checkJob?.status).toBe("queued");
    expect(checkJob?.claimed_by).toBeNull();
    expect(checkJob?.lease_expires_at).toBeNull();

    // Worker 2 claims the requeued job
    const claimed2 = await claimNextJob(worker2.id);
    expect(claimed2?.id).toBe(job.id);
    expect(claimed2?.claimed_by).toBe(worker2.id);
    expect(claimed2?.status).toBe("claimed");
    expect(claimed2?.delivery_count).toBe(2); // delivery_count successfully incremented!

    // Clean up
    await failJob(job.id, worker2.id, "TEST_DONE");
  });

  it("5. Concurrent claim (2–5 workers claim đồng thời): mỗi job CHỈ đúng một worker nhận được", async () => {
    // 5.1. Tạo 5 workers riêng biệt
    const workers = [];
    for (let i = 1; i <= 5; i++) {
      const hash = createHash("sha256").update(`worker_concurrent_${i}_${Date.now()}`).digest("hex");
      const w = await registerWorker({
        name: `Concurrent Worker ${i}`,
        token_hash: hash,
        status: "online",
      });
      workers.push(w);
    }

    // 5.2. Clear any lingering queued jobs
    await pool.query(`UPDATE image_jobs SET status = 'cancelled' WHERE status = 'queued';`);

    // 5.3. Tạo đúng 3 queued jobs
    const jobs = [];
    for (let i = 1; i <= 3; i++) {
      const j = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "concurrent_suite",
        source_ref: `article:concurrency-${i}`,
        request: {
          prompt: `Concurrent Job Item ${i}`,
          negative_prompt: "",
          width: 1080,
          height: 1080,
          seed: 1000 + i,
        },
      });
      jobs.push(j);
    }

    // 5.4. Mở 5 connection client PostgreSQL độc lập
    const clients: PoolClient[] = [];
    for (let i = 0; i < 5; i++) {
      clients.push(await pool.connect());
    }

    try {
      // 5.5. Cả 5 workers đồng thời gọi claim qua Promise.all
      const claimPromises = workers.map((w, idx) => claimNextJob(w.id, undefined, 120, clients[idx]));
      const results = await Promise.all(claimPromises);

      // 5.6. Kiểm tra kết quả
      const winningClaims = results.filter((r) => r !== null) as NonNullable<(typeof results)[0]>[];
      const nullClaims = results.filter((r) => r === null);

      // Vì chỉ có 3 jobs, đúng 3 worker nhận được job và 2 worker nhận null
      expect(winningClaims.length).toBe(3);
      expect(nullClaims.length).toBe(2);

      // Các job ID được nhận phải hoàn toàn khác nhau (không ai nhận trùng job)
      const claimedJobIds = winningClaims.map((c) => c.id);
      const uniqueJobIds = new Set(claimedJobIds);
      expect(uniqueJobIds.size).toBe(3);

      // Mọi job nhận được đều có delivery_count = 1 và status = 'claimed'
      for (const claimed of winningClaims) {
        expect(claimed.status).toBe("claimed");
        expect(claimed.delivery_count).toBe(1);
      }

      // Mỗi worker nhận đúng job mang worker.id của chính họ
      for (let i = 0; i < 5; i++) {
        const res = results[i];
        if (res) {
          expect(res.claimed_by).toBe(workers[i].id);
        }
      }

      // Clean up claimed jobs
      for (let i = 0; i < 5; i++) {
        const res = results[i];
        if (res) {
          await failJob(res.id, workers[i].id, "TEST_CLEANUP", undefined, clients[i]);
        }
      }
    } finally {
      for (const client of clients) {
        client.release();
      }
    }
  });

  it("6. Guardrail retry attempt logic: giữ nguyên root_job_id, tăng attempt, delivery_count = 0", async () => {
    const workerHash = createHash("sha256").update(`worker_retry_${Date.now()}`).digest("hex");
    const worker = await registerWorker({ name: "Worker Retry Test", token_hash: workerHash, status: "online" });

    const job1 = await createImageJob({
      workspace_id: TRIPC_WORKSPACE,
      owner: "content_agent",
      request: { prompt: "Promo with price", negative_prompt: "", width: 1080, height: 1080, seed: 111 },
    });

    const claimed1 = await claimNextJob(worker.id);
    await failJob(job1.id, worker.id, "OCR_PRICE_DETECTED", "500k detected");

    const job2 = await retryJobAttempt(job1.id, {
      newSeed: 777,
      modifiedRequest: { negative_prompt: "blurry, (text:1.3)" },
    });

    expect(job2?.root_job_id).toBe(job1.root_job_id);
    expect(job2?.attempt).toBe(2);
    expect(job2?.delivery_count).toBe(0);
    expect(job2?.status).toBe("queued");
    expect(job2?.request.seed).toBe(777);

    const history = await findImageJobsByRootId(job1.root_job_id);
    expect(history.length).toBe(2);
    expect(history[0].status).toBe("failed");
    expect(history[1].status).toBe("queued");

    // Clean up
    const claimed2 = await claimNextJob(worker.id);
    if (claimed2) await failJob(claimed2.id, worker.id, "TEST_CLEANUP");
  });
});
