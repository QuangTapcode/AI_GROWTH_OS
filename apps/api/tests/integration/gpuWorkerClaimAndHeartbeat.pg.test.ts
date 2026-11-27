import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { POST as claimRoute } from "../../src/app/api/v1/gpu-worker/claim/route";
import { POST as heartbeatRoute } from "../../src/app/api/v1/gpu-worker/heartbeat/route";
import { generateWorkerToken } from "../../src/modules/gpuWorkers/auth";
import { createImageJob } from "../../src/modules/gpuWorkers/repository";

const RUN = process.env.RUN_DB_TESTS === "1";
const TRIPC_WORKSPACE = "10000000-0000-4000-8000-000000000001";

interface TestWorkerInfo {
  id: string;
  name: string;
  rawToken: string;
  tokenHash: string;
}

describe.skipIf(!RUN)("GPU Worker Claim & Heartbeat API (Section 2.2)", () => {
  let pool: Pool;
  let workerAlpha: TestWorkerInfo;
  let workerBeta: TestWorkerInfo;
  let workerGamma: TestWorkerInfo;

  beforeAll(async () => {
    const connStr =
      process.env.DATABASE_URL ||
      "postgres://ai_growth_dev:ae5a9cb1e19ca954422a6aca20206537f63c9e716a051c1f250bac717c74d4b9@127.0.0.1:15432/ai_growth_os";
    pool = new Pool({ connectionString: connStr });

    // Helper to register test workers
    async function createTestWorker(name: string): Promise<TestWorkerInfo> {
      const { rawToken, tokenHash } = generateWorkerToken();
      const res = await pool.query<{ id: string }>(
        `INSERT INTO gpu_workers (
           name, token_hash, status, model_key, vram_free_mb, created_at, updated_at
         ) VALUES (
           $1, $2, 'online', 'sdxl_juggernaut_v9', 24576, NOW(), NOW()
         ) RETURNING id;`,
        [name, tokenHash]
      );
      return { id: res.rows[0].id, name, rawToken, tokenHash };
    }

    workerAlpha = await createTestWorker("Worker-Alpha-RTX4090");
    workerBeta = await createTestWorker("Worker-Beta-RTX4090");
    workerGamma = await createTestWorker("Worker-Gamma-A100");
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(
        `DELETE FROM gpu_workers WHERE id IN ($1, $2, $3);`,
        [workerAlpha.id, workerBeta.id, workerGamma.id]
      );
      await pool.end();
    }
  });

  beforeEach(async () => {
    // Clean up any lingering active jobs in queue before each test
    await pool.query(
      `UPDATE image_jobs SET status = 'cancelled' WHERE status IN ('queued', 'claimed', 'running');`
    );
  });

  function makeWorkerHeaders(worker: TestWorkerInfo, extra: Record<string, string> = {}) {
    return {
      authorization: `Bearer ${worker.rawToken}`,
      "content-type": "application/json",
      ...extra,
    };
  }

  // --------------------------------------------------------------------------
  // 1. CLAIM JOB (POST /api/v1/gpu-worker/claim)
  // --------------------------------------------------------------------------
  describe("1. Claim Job with Long Polling & Atomic SKIP LOCKED", () => {
    it("trả 204 No Content khi hàng đợi trống sau wait_seconds", async () => {
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          wait_seconds: 1, // Short wait for fast test execution
          vram_available_mb: 24000,
        }),
      });

      const start = Date.now();
      const res = await claimRoute(req);
      const duration = Date.now() - start;

      expect(res.status).toBe(204);
      expect(duration).toBeGreaterThanOrEqual(900); // Waited approximately 1s

      // Verify worker telemetry updated to online
      const workerRes = await pool.query(
        `SELECT status, vram_free_mb FROM gpu_workers WHERE id = $1;`,
        [workerAlpha.id]
      );
      expect(workerRes.rows[0].status).toBe("online");
      expect(workerRes.rows[0].vram_free_mb).toBe(24000);
    });

    it("claim thành công trả về đúng JSON đặc tả mục 2.2", async () => {
      // Enqueue a job
      const created = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test_caller",
        request: {
          prompt: "Futuristic luxury villa on tropical cliff overlooking ocean",
          negative_prompt: "blurry, dark",
          aspect_ratio: "16:9",
          width: 1920,
          height: 1080,
          steps: 35,
          cfg_scale: 8.0,
          seed: 4829104812,
          model_key: "sdxl_juggernaut_v9",
        },
      });

      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          wait_seconds: 2,
          supported_models: ["sdxl_juggernaut_v9"],
        }),
      });

      const res = await claimRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.job_id).toBe(created.id);
      expect(data.root_job_id).toBe(created.root_job_id);
      expect(data.attempt).toBe(1);
      expect(data.model_key).toBe("sdxl_juggernaut_v9");
      expect(data.prompt).toBe("Futuristic luxury villa on tropical cliff overlooking ocean");
      expect(data.negative_prompt).toBe("blurry, dark");
      expect(data.aspect_ratio).toBe("16:9");
      expect(data.width).toBe(1920);
      expect(data.height).toBe(1080);
      expect(data.steps).toBe(35);
      expect(data.cfg_scale).toBe(8.0);
      expect(data.seed).toBe(4829104812);
      expect(data.lease_seconds).toBe(120);
      expect(data.lease_expires_at).toBeDefined();

      // Verify DB state
      const dbCheck = await pool.query(
        `SELECT status, claimed_by, delivery_count FROM image_jobs WHERE id = $1;`,
        [created.id]
      );
      expect(dbCheck.rows[0].status).toBe("claimed");
      expect(dbCheck.rows[0].claimed_by).toBe(workerAlpha.id);
      expect(dbCheck.rows[0].delivery_count).toBe(1);

      // Verify worker state
      const workerCheck = await pool.query(
        `SELECT status, active_job_id FROM gpu_workers WHERE id = $1;`,
        [workerAlpha.id]
      );
      expect(workerCheck.rows[0].status).toBe("busy");
      expect(workerCheck.rows[0].active_job_id).toBe(created.id);
    });

    it("claim đồng thời: 3 workers cùng claim khi chỉ có 1 job, đúng 1 worker nhận được", async () => {
      // Enqueue exactly 1 job
      const created = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test_caller",
        request: {
          prompt: "Solo concurrent job",
          negative_prompt: "",
          width: 1080,
          height: 1080,
          seed: 123456,
        },
      });

      // 3 workers claim concurrently
      const callClaim = (worker: TestWorkerInfo) => {
        const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
          method: "POST",
          headers: makeWorkerHeaders(worker),
          body: JSON.stringify({
            worker_id: worker.id,
            wait_seconds: 1, // Short wait so losers exit promptly
          }),
        });
        return claimRoute(req);
      };

      const [resA, resB, resC] = await Promise.all([
        callClaim(workerAlpha),
        callClaim(workerBeta),
        callClaim(workerGamma),
      ]);

      const statuses = [resA.status, resB.status, resC.status];
      const count200 = statuses.filter((s) => s === 200).length;
      const count204 = statuses.filter((s) => s === 204).length;

      // Exactly 1 winner gets 200, the other 2 get 204
      expect(count200).toBe(1);
      expect(count204).toBe(2);

      // The job in DB was claimed by whichever worker won
      const checkJob = await pool.query(
        `SELECT status, claimed_by, delivery_count FROM image_jobs WHERE id = $1;`,
        [created.id]
      );
      expect(checkJob.rows[0].status).toBe("claimed");
      expect([workerAlpha.id, workerBeta.id, workerGamma.id]).toContain(checkJob.rows[0].claimed_by);
      expect(checkJob.rows[0].delivery_count).toBe(1);
    });

    it("lọc theo supported_models: worker chỉ nhận model mình hỗ trợ", async () => {
      // Enqueue job requiring model 'flux_dev'
      const fluxJob = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test_caller",
        request: {
          prompt: "Flux specific prompt",
          negative_prompt: "",
          width: 1080,
          height: 1080,
          seed: 777,
          model_key: "flux_dev",
        },
      });

      // Worker Gamma supports only 'sdxl_juggernaut_v9' -> should NOT receive flux_dev job
      const reqGamma = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: makeWorkerHeaders(workerGamma),
        body: JSON.stringify({
          worker_id: workerGamma.id,
          wait_seconds: 0, // No wait, immediate return
          supported_models: ["sdxl_juggernaut_v9"],
        }),
      });

      const resGamma = await claimRoute(reqGamma);
      expect(resGamma.status).toBe(204);

      // Worker Alpha supports 'flux_dev' -> receives it immediately
      const reqAlpha = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          wait_seconds: 0,
          supported_models: ["flux_dev"],
        }),
      });

      const resAlpha = await claimRoute(reqAlpha);
      expect(resAlpha.status).toBe(200);
      const dataAlpha = await resAlpha.json();
      expect(dataAlpha.job_id).toBe(fluxJob.id);
    });
  });

  // --------------------------------------------------------------------------
  // 2. HEARTBEAT & LEASE RENEWAL (POST /api/v1/gpu-worker/heartbeat)
  // --------------------------------------------------------------------------
  describe("2. Heartbeat & Lease Renewal", () => {
    let activeJobId: string;

    beforeEach(async () => {
      // Create and assign a job to workerAlpha
      const created = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test_caller",
        request: { prompt: "Heartbeat test", negative_prompt: "", width: 1080, height: 1080, seed: 1 },
      });

      // Simulate claim by workerAlpha
      await pool.query(
        `UPDATE image_jobs
         SET status = 'claimed',
             claimed_by = $1,
             lease_expires_at = NOW() + INTERVAL '120 seconds'
         WHERE id = $2;`,
        [workerAlpha.id, created.id]
      );
      activeJobId = created.id;
    });

    it("heartbeat đầu tiên của job chuyển claimed -> running và gia hạn lease", async () => {
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/heartbeat", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: activeJobId,
          step_current: 5,
          step_total: 30,
          gpu_temp_celsius: 68,
          vram_used_mb: 9410,
        }),
      });

      const res = await heartbeatRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("renewed");
      expect(data.lease_expires_at).toBeDefined();

      // Verify status in DB transitioned to 'running'
      const checkJob = await pool.query(
        `SELECT status, lease_expires_at FROM image_jobs WHERE id = $1;`,
        [activeJobId]
      );
      expect(checkJob.rows[0].status).toBe("running");

      // Verify worker telemetry updated
      const checkWorker = await pool.query(
        `SELECT status, active_job_id FROM gpu_workers WHERE id = $1;`,
        [workerAlpha.id]
      );
      expect(checkWorker.rows[0].status).toBe("busy");
      expect(checkWorker.rows[0].active_job_id).toBe(activeJobId);
    });

    it("heartbeat tiếp theo khi đang running tiếp tục gia hạn lease (200 renewed)", async () => {
      // Set to running first
      await pool.query(`UPDATE image_jobs SET status = 'running' WHERE id = $1;`, [activeJobId]);

      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/heartbeat", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: activeJobId,
          step_current: 25,
          step_total: 30,
        }),
      });

      const res = await heartbeatRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("renewed");
    });

    it("heartbeat của worker khác gửi cho job này bị từ chối (409 lost)", async () => {
      // Worker Beta attempts to send heartbeat for job claimed by Worker Alpha
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/heartbeat", {
        method: "POST",
        headers: makeWorkerHeaders(workerBeta),
        body: JSON.stringify({
          worker_id: workerBeta.id,
          job_id: activeJobId,
        }),
      });

      const res = await heartbeatRoute(req);
      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.status).toBe("lost");
      expect(data.message).toContain("claimed by another worker");
    });

    it("job bị huỷ giữa chừng: heartbeat trả về 409 { status: 'cancelled' } để worker dừng ngay", async () => {
      // User or system cancels the job during inference
      await pool.query(
        `UPDATE image_jobs SET status = 'cancelled' WHERE id = $1;`,
        [activeJobId]
      );

      // Worker Alpha sends heartbeat
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/heartbeat", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: activeJobId,
          step_current: 12,
          step_total: 30,
        }),
      });

      const res = await heartbeatRoute(req);
      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.status).toBe("cancelled");
      expect(data.message).toContain("cancelled");
    });

    it("job không tồn tại trong hệ thống: heartbeat trả về 409 { status: 'lost' }", async () => {
      const nonExistentJobId = randomUUID();
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/heartbeat", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: nonExistentJobId,
        }),
      });

      const res = await heartbeatRoute(req);
      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.status).toBe("lost");
    });
  });
});

