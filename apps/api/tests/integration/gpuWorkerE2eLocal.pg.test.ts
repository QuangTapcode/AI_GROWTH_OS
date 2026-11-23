import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { NextRequest } from "next/server";

import { POST as uploadUrlRoute } from "../../src/app/api/v1/gpu-worker/upload-url/route";
import { PUT as uploadProxyRoute } from "../../src/app/api/v1/gpu-worker/upload-proxy/route";
import { POST as completeRoute } from "../../src/app/api/v1/gpu-worker/complete/route";
import { POST as failRoute } from "../../src/app/api/v1/gpu-worker/fail/route";
import { POST as claimRoute } from "../../src/app/api/v1/gpu-worker/claim/route";
import { POST as heartbeatRoute } from "../../src/app/api/v1/gpu-worker/heartbeat/route";

import {
  registerWorker,
  createImageJob,
  claimNextJob,
  markRunning,
  findImageJobById,
  findImageJobsByRootId,
  reclaimExpiredLeasesDetailed,
} from "../../src/modules/gpuWorkers/repository";
import { generateWorkerToken } from "../../src/modules/gpuWorkers/auth";

const RUN = process.env.RUN_DB_TESTS === "1";
const TRIPC_WORKSPACE = "10000000-0000-4000-8000-000000000001";

interface TestWorkerInfo {
  id: string;
  name: string;
  rawToken: string;
  tokenHash: string;
}

/**
 * Creates a valid mock WebP buffer with RIFF...WEBP header and VP8 dimension chunks.
 */
function createMockWebpBuffer(
  byteSize: number = 2048,
  width: number = 1080,
  height: number = 1080
): Buffer {
  const buf = Buffer.alloc(byteSize, 0x00);
  buf.write("RIFF", 0, 4, "ascii");
  buf.writeUInt32LE(byteSize - 8, 4);
  buf.write("WEBP", 8, 4, "ascii");
  buf.write("VP8 ", 12, 4, "ascii");
  buf.writeUInt32LE(byteSize - 20, 16);

  // Keyframe tag
  buf[20] = 0x00;
  buf[21] = 0x00;
  buf[22] = 0x00;
  // Keyframe code: 0x9d, 0x01, 0x2a
  buf[23] = 0x9d;
  buf[24] = 0x01;
  buf[25] = 0x2a;

  // 16-bit LE dimensions (14 bits width, 14 bits height)
  buf.writeUInt16LE(width & 0x3fff, 26);
  buf.writeUInt16LE(height & 0x3fff, 28);
  return buf;
}

describe.skipIf(!RUN)("GPU Worker E2E Local Integration Test (All 7 Scenarios)", () => {
  let pool: Pool;
  let tempStorageDir: string;
  let originalStorageDir: string | undefined;

  beforeAll(async () => {
    const connStr =
      process.env.DATABASE_URL ||
      "postgres://ai_growth_dev:ae5a9cb1e19ca954422a6aca20206537f63c9e716a051c1f250bac717c74d4b9@127.0.0.1:15432/ai_growth_os";
    pool = new Pool({ connectionString: connStr });

    // Setup temporary storage directory for storage proxy
    tempStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), "gpu-e2e-storage-"));
    originalStorageDir = process.env.STORAGE_LOCAL_DIR;
    process.env.STORAGE_LOCAL_DIR = tempStorageDir;
    process.env.UPLOAD_DIR = tempStorageDir;

    // Clean slate: cancel any remaining pending/active jobs
    await pool.query(
      `UPDATE image_jobs SET status = 'cancelled' WHERE status IN ('queued', 'claimed', 'running');`
    );
  });

  afterAll(async () => {
    // Restore environment variable
    if (originalStorageDir !== undefined) {
      process.env.STORAGE_LOCAL_DIR = originalStorageDir;
    } else {
      delete process.env.STORAGE_LOCAL_DIR;
    }
    delete process.env.UPLOAD_DIR;

    // Clean up temporary files
    if (fs.existsSync(tempStorageDir)) {
      try {
        fs.rmSync(tempStorageDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    await pool.query(
      `UPDATE image_jobs SET status = 'cancelled' WHERE status IN ('queued', 'claimed', 'running');`
    );
  });

  async function createTestWorker(name: string): Promise<TestWorkerInfo> {
    const { rawToken, tokenHash } = generateWorkerToken();
    const res = await registerWorker(
      {
        name,
        token_hash: tokenHash,
        status: "online",
        model_key: "a327ebf7-c854-4319-b160-00dbd6498427",
        vram_free_mb: 24576,
      },
      pool
    );
    return { id: res.id, name, rawToken, tokenHash };
  }

  function makeAuthHeaders(rawToken: string): HeadersInit {
    return {
      Authorization: `Bearer ${rawToken}`,
      "Content-Type": "application/json",
      "x-forwarded-proto": "https",
    };
  }

  // --------------------------------------------------------------------------
  // KỊCH BẢN (1): Không có worker → job queued; bật worker → tự claim & completed, có media_assets, ảnh tải được
  // --------------------------------------------------------------------------
  it("(1) không có worker → job queued; bật worker → tự claim và completed, có media_assets, ảnh tải được", async () => {
    // 1. Submit a job when no worker is claiming
    const job = await createImageJob(
      {
        workspace_id: TRIPC_WORKSPACE,
        owner: "user_test_scenario1@tripc.vn",
        request: {
          prompt: "Son Tra peninsula golden hour ocean view, cinematic lighting",
          negative_prompt: "text, numbers, price tags, logo",
          aspect_ratio: "1:1",
          width: 1080,
          height: 1080,
          seed: 428192,
          steps: 30,
          cfg_scale: 7.0,
          scheduler: "euler_a",
          model_key: "a327ebf7-c854-4319-b160-00dbd6498427",
          model_name: "Juggernaut XL v9",
        },
      },
      pool
    );

    // Job initially in queued status
    const initialJob = await findImageJobById(job.id, pool);
    expect(initialJob?.status).toBe("queued");
    expect(initialJob?.claimed_by).toBeNull();

    // 2. Start worker and claim
    const worker = await createTestWorker("Worker-Scenario-1");
    const claimReq = new NextRequest("http://localhost:3000/api/v1/gpu-worker/claim", {
      method: "POST",
      headers: makeAuthHeaders(worker.rawToken),
      body: JSON.stringify({
        wait_seconds: 0,
        supported_models: ["a327ebf7-c854-4319-b160-00dbd6498427"],
      }),
    });
    const claimRes = await claimRoute(claimReq);
    expect(claimRes.status).toBe(200);
    const claimedData = await claimRes.json();
    expect(claimedData.job_id).toBe(job.id);

    // 3. Worker sends heartbeat (transitions claimed -> running)
    const hbReq = new NextRequest("http://localhost:3000/api/v1/gpu-worker/heartbeat", {
      method: "POST",
      headers: makeAuthHeaders(worker.rawToken),
      body: JSON.stringify({
        job_id: job.id,
        vram_used_mb: 4096,
      }),
    });
    const hbRes = await heartbeatRoute(hbReq);
    expect(hbRes.status).toBe(200);

    const runningJob = await findImageJobById(job.id, pool);
    expect(runningJob?.status).toBe("running");

    // 4. Mock GPU generates valid 1080x1080 WebP image
    const imageBytes = createMockWebpBuffer(3000, 1080, 1080);
    const contentHash = createHash("sha256").update(imageBytes).digest("hex");

    // 5. Worker requests upload URL
    const uploadUrlReq = new NextRequest("http://localhost:3000/api/v1/gpu-worker/upload-url", {
      method: "POST",
      headers: makeAuthHeaders(worker.rawToken),
      body: JSON.stringify({
        job_id: job.id,
        content_type: "image/webp",
        byte_size: imageBytes.length,
      }),
    });
    const uploadUrlRes = await uploadUrlRoute(uploadUrlReq);
    expect(uploadUrlRes.status).toBe(200);
    const { upload_url, storage_key } = await uploadUrlRes.json();

    // 6. Worker uploads image via PUT upload-proxy
    const uploadProxyReq = new NextRequest(new URL(upload_url, "http://localhost:3000").toString(), {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${worker.rawToken}`,
        "Content-Type": "image/webp",
        "Content-Length": imageBytes.length.toString(),
        "x-forwarded-proto": "https",
      },
      body: imageBytes,
    });
    const uploadProxyRes = await uploadProxyRoute(uploadProxyReq);
    expect(uploadProxyRes.status).toBe(200);

    // 7. Worker completes job with pre-guardrail passed
    const completeReq = new NextRequest("http://localhost:3000/api/v1/gpu-worker/complete", {
      method: "POST",
      headers: makeAuthHeaders(worker.rawToken),
      body: JSON.stringify({
        job_id: job.id,
        content_hash: contentHash,
        width: 1080,
        height: 1080,
        byte_size: imageBytes.length,
        seed: 428192,
        generation_time_ms: 1250,
        pre_guardrail: {
          ocr_engine: "tesseract_v5_vie+eng",
          passed: true,
          detected_text: "",
          detected_prices: [],
        },
      }),
    });
    const completeRes = await completeRoute(completeReq);
    expect(completeRes.status).toBe(200);
    const completeData = await completeRes.json();
    expect(completeData.status).toBe("completed");
    expect(completeData.media_asset_id).toBeTruthy();
    expect(completeData.image_url).toBeTruthy();

    // 8. Verify media_assets table record
    const assetRes = await pool.query(
      `SELECT * FROM media_assets WHERE id = $1 LIMIT 1;`,
      [completeData.media_asset_id]
    );
    expect(assetRes.rows.length).toBe(1);
    const asset = assetRes.rows[0];
    expect(asset.content_hash).toBe(contentHash);
    expect(asset.is_ai_generated).toBe(true);
    expect(asset.license).toBe("Internal AI Generated");
    expect(asset.attribution).toBe("TripC AI Growth OS");
    expect(asset.cost_usd).toBe("0.0000");

    // 9. Verify image file is readable/downloadable from storage proxy directory
    const expectedFilePath = path.join(tempStorageDir, storage_key.replace(/^uploads[\\/]/, ""));
    expect(fs.existsSync(expectedFilePath)).toBe(true);
    const downloadedBytes = fs.readFileSync(expectedFilePath);
    expect(downloadedBytes.length).toBe(imageBytes.length);
    const downloadedHash = createHash("sha256").update(downloadedBytes).digest("hex");
    expect(downloadedHash).toBe(contentHash);
  });

  // --------------------------------------------------------------------------
  // KỊCH BẢN (2): Guardrail từ chối 1 lần rồi đạt (attempt 2); từ chối 3 lần → needs_assets
  // --------------------------------------------------------------------------
  it("(2.1) guardrail từ chối 1 lần rồi đạt (attempt 2)", async () => {
    const worker = await createTestWorker("Worker-Scenario-2A");

    // Submit Job
    const job = await createImageJob(
      {
        workspace_id: TRIPC_WORKSPACE,
        owner: "user_test_scenario2a@tripc.vn",
        request: {
          prompt: "Voucher resort Da Nang luxury package",
          aspect_ratio: "1:1",
          width: 1080,
          height: 1080,
          seed: 111222,
          steps: 30,
          cfg_scale: 7.0,
          scheduler: "euler_a",
          model_key: "a327ebf7-c854-4319-b160-00dbd6498427",
        },
      },
      pool
    );

    // Worker claims attempt 1
    const claimRes1 = await claimNextJob(worker.id, ["a327ebf7-c854-4319-b160-00dbd6498427"], 0, pool);
    expect(claimRes1?.id).toBe(job.id);
    expect(claimRes1?.attempt).toBe(1);

    // Mock OCR detects price text "199.000 VNĐ" -> Worker calls /fail
    const failReq1 = new NextRequest("http://localhost:3000/api/v1/gpu-worker/fail", {
      method: "POST",
      headers: makeAuthHeaders(worker.rawToken),
      body: JSON.stringify({
        job_id: job.id,
        error_code: "GUARDRAIL_PRICE_DETECTED",
        error_message: "Pre-guardrail OCR detected unverified price text: 199.000 VNĐ",
        retryable: true,
        details: {
          detected_prices: ["199.000 VNĐ"],
          detected_text: "Gia chi 199.000 VND duy nhat hom nay",
        },
      }),
    });
    const failRes1 = await failRoute(failReq1);
    expect(failRes1.status).toBe(200);
    const failData1 = await failRes1.json();
    expect(failData1.action).toBe("attempt_rescheduled");
    expect(failData1.next_attempt).toBe(2);

    // Worker claims attempt 2
    const claimRes2 = await claimNextJob(worker.id, ["a327ebf7-c854-4319-b160-00dbd6498427"], 0, pool);
    expect(claimRes2).not.toBeNull();
    expect(claimRes2?.root_job_id).toBe(job.id);
    expect(claimRes2?.attempt).toBe(2);
    // Negative prompt has increased weight on attempt 2
    expect(claimRes2?.request.negative_prompt).toContain("1.3");

    // Attempt 2 produces clean image -> completes
    const cleanImg = createMockWebpBuffer(2048, 1080, 1080);
    const cleanHash = createHash("sha256").update(cleanImg).digest("hex");

    const uploadUrlRes = await uploadUrlRoute(
      new NextRequest("http://localhost:3000/api/v1/gpu-worker/upload-url", {
        method: "POST",
        headers: makeAuthHeaders(worker.rawToken),
        body: JSON.stringify({
          job_id: claimRes2!.id,
          content_type: "image/webp",
          byte_size: cleanImg.length,
        }),
      })
    );
    const { upload_url } = await uploadUrlRes.json();

    await uploadProxyRoute(
      new NextRequest(new URL(upload_url, "http://localhost:3000").toString(), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${worker.rawToken}`,
          "Content-Type": "image/webp",
          "Content-Length": cleanImg.length.toString(),
          "x-forwarded-proto": "https",
        },
        body: cleanImg,
      })
    );

    const completeRes = await completeRoute(
      new NextRequest("http://localhost:3000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeAuthHeaders(worker.rawToken),
        body: JSON.stringify({
          job_id: claimRes2!.id,
          content_hash: cleanHash,
          width: 1080,
          height: 1080,
          byte_size: cleanImg.length,
          seed: claimRes2!.request.seed,
          generation_time_ms: 1100,
          pre_guardrail: {
            ocr_engine: "tesseract",
            passed: true,
            detected_text: "",
            detected_prices: [],
          },
        }),
      })
    );
    expect(completeRes.status).toBe(200);

    const finalAttempt = await findImageJobById(claimRes2!.id, pool);
    expect(finalAttempt?.status).toBe("completed");
  });

  it("(2.2) guardrail từ chối 3 lần liên tiếp → needs_assets", async () => {
    const worker = await createTestWorker("Worker-Scenario-2B");

    const rootJob = await createImageJob(
      {
        workspace_id: TRIPC_WORKSPACE,
        owner: "user_test_scenario2b@tripc.vn",
        request: {
          prompt: "Phòng khách sạn giá rẻ Đà Nẵng",
          aspect_ratio: "1:1",
          width: 1080,
          height: 1080,
          seed: 999888,
          model_key: "a327ebf7-c854-4319-b160-00dbd6498427",
        },
      },
      pool
    );

    let currentJobId = rootJob.id;

    // Run 3 consecutive guardrail rejections
    for (let attempt = 1; attempt <= 3; attempt++) {
      const claimRes = await claimNextJob(worker.id, ["a327ebf7-c854-4319-b160-00dbd6498427"], 0, pool);
      expect(claimRes?.attempt).toBe(attempt);
      currentJobId = claimRes!.id;

      const failReq = new NextRequest("http://localhost:3000/api/v1/gpu-worker/fail", {
        method: "POST",
        headers: makeAuthHeaders(worker.rawToken),
        body: JSON.stringify({
          job_id: currentJobId,
          error_code: "GUARDRAIL_PRICE_DETECTED",
          error_message: `Attempt ${attempt} detected price text`,
          retryable: true,
          details: { detected_prices: ["500.000d"] },
        }),
      });
      const failRes = await failRoute(failReq);
      expect(failRes.status).toBe(200);
      const failData = await failRes.json();

      if (attempt < 3) {
        expect(failData.action).toBe("attempt_rescheduled");
        expect(failData.next_attempt).toBe(attempt + 1);
      } else {
        // Attempt 3 exhausted -> needs_assets
        expect(failData.action).toBe("needs_assets");
        expect(failData.next_attempt).toBeNull();
      }
    }

    // Verify all attempts under rootJob
    const allAttempts = await findImageJobsByRootId(rootJob.id, pool);
    expect(allAttempts.length).toBe(3);
    const finalJob = allAttempts[allAttempts.length - 1];
    expect(finalJob.status).toBe("needs_assets");
  });

  // --------------------------------------------------------------------------
  // KỊCH BẢN (3): Kill worker giữa chừng → lease hết hạn → job quay lại → worker khởi động lại hoàn tất
  // --------------------------------------------------------------------------
  it("(3) kill worker giữa chừng → lease hết hạn → job quay lại → worker khởi động lại hoàn tất", async () => {
    const worker1 = await createTestWorker("Worker-Scenario-3-Initial");

    const job = await createImageJob(
      {
        workspace_id: TRIPC_WORKSPACE,
        owner: "user_test_scenario3@tripc.vn",
        request: {
          prompt: "Linh Ung pagoda Quan Am statue sunrise",
          aspect_ratio: "1:1",
          width: 1080,
          height: 1080,
          seed: 555444,
          model_key: "a327ebf7-c854-4319-b160-00dbd6498427",
        },
      },
      pool
    );

    // Worker 1 claims job
    const claimed = await claimNextJob(worker1.id, ["a327ebf7-c854-4319-b160-00dbd6498427"], 0, pool);
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.delivery_count).toBe(1);

    // Worker 1 starts running
    await markRunning(job.id, worker1.id);
    const runningJob = await findImageJobById(job.id, pool);
    expect(runningJob?.status).toBe("running");

    // SIMULATE: Worker 1 is killed / crashes midway (no heartbeat, no fail call)
    // Time passes: lease expires in database
    await pool.query(
      `UPDATE image_jobs SET lease_expires_at = NOW() - INTERVAL '10 seconds' WHERE id = $1;`,
      [job.id]
    );

    // Recovery scanner runs
    const reclaimResult = await reclaimExpiredLeasesDetailed({ maxDeliveries: 5 });
    expect(reclaimResult.requeuedCount).toBe(1);

    // Job returns to 'queued' state with delivery_count = 1, claimed_by = null
    const requeuedJob = await findImageJobById(job.id, pool);
    expect(requeuedJob?.status).toBe("queued");
    expect(requeuedJob?.claimed_by).toBeNull();
    expect(requeuedJob?.delivery_count).toBe(1);

    // WORKER RESTARTS (simulated by Worker 1 revived or new worker instance)
    const workerRestarted = await createTestWorker("Worker-Scenario-3-Restarted");
    const reclaimedJob = await claimNextJob(
      workerRestarted.id,
      ["a327ebf7-c854-4319-b160-00dbd6498427"],
      0,
      pool
    );
    expect(reclaimedJob?.id).toBe(job.id);
    expect(reclaimedJob?.delivery_count).toBe(2);
    expect(reclaimedJob?.attempt).toBe(1); // Same attempt, not a new attempt

    // Restarted worker completes job
    const imgBuf = createMockWebpBuffer(2048, 1080, 1080);
    const imgHash = createHash("sha256").update(imgBuf).digest("hex");

    const uploadUrlRes = await uploadUrlRoute(
      new NextRequest("http://localhost:3000/api/v1/gpu-worker/upload-url", {
        method: "POST",
        headers: makeAuthHeaders(workerRestarted.rawToken),
        body: JSON.stringify({
          job_id: job.id,
          content_type: "image/webp",
          byte_size: imgBuf.length,
        }),
      })
    );
    const { upload_url } = await uploadUrlRes.json();

    await uploadProxyRoute(
      new NextRequest(new URL(upload_url, "http://localhost:3000").toString(), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${workerRestarted.rawToken}`,
          "Content-Type": "image/webp",
          "Content-Length": imgBuf.length.toString(),
          "x-forwarded-proto": "https",
        },
        body: imgBuf,
      })
    );

    const completeRes = await completeRoute(
      new NextRequest("http://localhost:3000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeAuthHeaders(workerRestarted.rawToken),
        body: JSON.stringify({
          job_id: job.id,
          content_hash: imgHash,
          width: 1080,
          height: 1080,
          byte_size: imgBuf.length,
          seed: 555444,
          generation_time_ms: 1200,
          pre_guardrail: {
            ocr_engine: "tesseract",
            passed: true,
            detected_text: "",
            detected_prices: [],
          },
        }),
      })
    );
    expect(completeRes.status).toBe(200);

    const completedJob = await findImageJobById(job.id, pool);
    expect(completedJob?.status).toBe("completed");
    expect(completedJob?.claimed_by).toBe(workerRestarted.id);
  });

  // --------------------------------------------------------------------------
  // KỊCH BẢN (4): 2 worker song song, không job nào bị xử lý 2 lần
  // --------------------------------------------------------------------------
  it("(4) 2 worker song song, không job nào bị xử lý 2 lần", async () => {
    const workerA = await createTestWorker("Worker-4A");
    const workerB = await createTestWorker("Worker-4B");

    // Create 3 queued jobs
    const job1 = await createImageJob(
      {
        workspace_id: TRIPC_WORKSPACE,
        owner: "user_multi@tripc.vn",
        request: { prompt: "Job 1", aspect_ratio: "1:1", width: 1080, height: 1080, model_key: "a327ebf7-c854-4319-b160-00dbd6498427" },
      },
      pool
    );
    const job2 = await createImageJob(
      {
        workspace_id: TRIPC_WORKSPACE,
        owner: "user_multi@tripc.vn",
        request: { prompt: "Job 2", aspect_ratio: "1:1", width: 1080, height: 1080, model_key: "a327ebf7-c854-4319-b160-00dbd6498427" },
      },
      pool
    );
    const job3 = await createImageJob(
      {
        workspace_id: TRIPC_WORKSPACE,
        owner: "user_multi@tripc.vn",
        request: { prompt: "Job 3", aspect_ratio: "1:1", width: 1080, height: 1080, model_key: "a327ebf7-c854-4319-b160-00dbd6498427" },
      },
      pool
    );

    // Concurrently claim jobs using SKIP LOCKED
    const [claimA1, claimB1] = await Promise.all([
      claimNextJob(workerA.id, ["a327ebf7-c854-4319-b160-00dbd6498427"], 0, pool),
      claimNextJob(workerB.id, ["a327ebf7-c854-4319-b160-00dbd6498427"], 0, pool),
    ]);

    expect(claimA1).not.toBeNull();
    expect(claimB1).not.toBeNull();
    // Must be two distinct jobs!
    expect(claimA1?.id).not.toBe(claimB1?.id);

    // Third claim gets the last job
    const claimRemaining = await claimNextJob(workerA.id, ["a327ebf7-c854-4319-b160-00dbd6498427"], 0, pool);
    expect(claimRemaining).not.toBeNull();
    const claimedIds = new Set([claimA1?.id, claimB1?.id, claimRemaining?.id]);
    expect(claimedIds.size).toBe(3);
    expect(claimedIds.has(job1.id)).toBe(true);
    expect(claimedIds.has(job2.id)).toBe(true);
    expect(claimedIds.has(job3.id)).toBe(true);

    // Subsequent claims return null (queue empty)
    const emptyClaimA = await claimNextJob(workerA.id, ["a327ebf7-c854-4319-b160-00dbd6498427"], 0, pool);
    const emptyClaimB = await claimNextJob(workerB.id, ["a327ebf7-c854-4319-b160-00dbd6498427"], 0, pool);
    expect(emptyClaimA).toBeNull();
    expect(emptyClaimB).toBeNull();
  });

  // --------------------------------------------------------------------------
  // KỊCH BẢN (5): Hủy job đang chạy → worker dừng
  // --------------------------------------------------------------------------
  it("(5) huỷ job đang chạy → worker dừng", async () => {
    const worker = await createTestWorker("Worker-Scenario-5");

    const job = await createImageJob(
      {
        workspace_id: TRIPC_WORKSPACE,
        owner: "user_cancel@tripc.vn",
        request: { prompt: "Job to be cancelled", aspect_ratio: "1:1", width: 1080, height: 1080, model_key: "a327ebf7-c854-4319-b160-00dbd6498427" },
      },
      pool
    );

    // Worker claims job
    await claimNextJob(worker.id, ["a327ebf7-c854-4319-b160-00dbd6498427"], 0, pool);
    await markRunning(job.id, worker.id);

    // User/System cancels the job while it is running
    await pool.query(`UPDATE image_jobs SET status = 'cancelled' WHERE id = $1;`, [job.id]);

    // Worker's background heartbeat loop checks status
    const hbReq = new NextRequest("http://localhost:3000/api/v1/gpu-worker/heartbeat", {
      method: "POST",
      headers: makeAuthHeaders(worker.rawToken),
      body: JSON.stringify({
        job_id: job.id,
        vram_used_mb: 4096,
      }),
    });
    const hbRes = await heartbeatRoute(hbReq);
    expect(hbRes.status).toBe(409);
    const hbData = await hbRes.json();

    // Heartbeat returns cancelled status signal to worker
    expect(hbData.status).toBe("cancelled");

    // If worker tried to complete a cancelled job, server rejects it
    const dummyWebp = createMockWebpBuffer(2048, 1080, 1080);
    const dummyHash = createHash("sha256").update(dummyWebp).digest("hex");
    const completeReq = new NextRequest("http://localhost:3000/api/v1/gpu-worker/complete", {
      method: "POST",
      headers: makeAuthHeaders(worker.rawToken),
      body: JSON.stringify({
        job_id: job.id,
        content_hash: dummyHash,
        width: 1080,
        height: 1080,
        byte_size: dummyWebp.length,
        seed: 12345,
        generation_time_ms: 1000,
        pre_guardrail: { ocr_engine: "tesseract", passed: true, detected_text: "", detected_prices: [] },
      }),
    });
    const completeRes = await completeRoute(completeReq);
    expect(completeRes.status).toBe(409);
    const completeData = await completeRes.json();
    expect(completeData.status).toBe("cancelled");

    const checkJob = await findImageJobById(job.id, pool);
    expect(checkJob?.status).toBe("cancelled");
  });

  // --------------------------------------------------------------------------
  // KỊCH BẢN (6): Token bị disable → worker dừng claim, báo lỗi rõ
  // --------------------------------------------------------------------------
  it("(6) token bị disable → worker dừng claim, báo lỗi rõ", async () => {
    const worker = await createTestWorker("Worker-Scenario-6");

    // Worker can claim normally before revocation
    const claimReqBefore = new NextRequest("http://localhost:3000/api/v1/gpu-worker/claim", {
      method: "POST",
      headers: makeAuthHeaders(worker.rawToken),
      body: JSON.stringify({ wait_seconds: 0, supported_models: ["a327ebf7-c854-4319-b160-00dbd6498427"] }),
    });
    const claimResBefore = await claimRoute(claimReqBefore);
    expect(claimResBefore.status).toBe(204); // No job, but authenticated successfully!

    // REVOKE / DISABLE WORKER TOKEN
    await pool.query(`UPDATE gpu_workers SET revoked_at = NOW() WHERE id = $1;`, [worker.id]);

    // Worker attempts to claim again
    const claimReqAfter = new NextRequest("http://localhost:3000/api/v1/gpu-worker/claim", {
      method: "POST",
      headers: makeAuthHeaders(worker.rawToken),
      body: JSON.stringify({ wait_seconds: 0, supported_models: ["a327ebf7-c854-4319-b160-00dbd6498427"] }),
    });
    const claimResAfter = await claimRoute(claimReqAfter);
    expect(claimResAfter.status).toBe(401);
    const errData = await claimResAfter.json();
    expect(errData.error.code).toBe("UNAUTHORIZED");
    expect(errData.error.message).toContain("revoked");
  });

  // --------------------------------------------------------------------------
  // KỊCH BẢN (7): /complete gọi lặp (Idempotent)
  // --------------------------------------------------------------------------
  it("(7) /complete gọi lặp: trả kết quả cũ, không tạo thêm media_assets", async () => {
    const worker = await createTestWorker("Worker-Scenario-7");

    const job = await createImageJob(
      {
        workspace_id: TRIPC_WORKSPACE,
        owner: "user_idempotent@tripc.vn",
        request: { prompt: "Idempotent complete test", aspect_ratio: "1:1", width: 1080, height: 1080, model_key: "a327ebf7-c854-4319-b160-00dbd6498427" },
      },
      pool
    );

    await claimNextJob(worker.id, ["a327ebf7-c854-4319-b160-00dbd6498427"], 0, pool);
    await markRunning(job.id, worker.id);

    const imgBuf = createMockWebpBuffer(2048, 1080, 1080);
    const imgHash = createHash("sha256").update(imgBuf).digest("hex");

    // Upload via proxy
    const uploadUrlRes = await uploadUrlRoute(
      new NextRequest("http://localhost:3000/api/v1/gpu-worker/upload-url", {
        method: "POST",
        headers: makeAuthHeaders(worker.rawToken),
        body: JSON.stringify({ job_id: job.id, content_type: "image/webp", byte_size: imgBuf.length }),
      })
    );
    const { upload_url } = await uploadUrlRes.json();

    await uploadProxyRoute(
      new NextRequest(new URL(upload_url, "http://localhost:3000").toString(), {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${worker.rawToken}`,
          "Content-Type": "image/webp",
          "Content-Length": imgBuf.length.toString(),
          "x-forwarded-proto": "https",
        },
        body: imgBuf,
      })
    );

    const completePayload = {
      job_id: job.id,
      content_hash: imgHash,
      width: 1080,
      height: 1080,
      byte_size: imgBuf.length,
      seed: 777111,
      generation_time_ms: 950,
      pre_guardrail: { ocr_engine: "tesseract", passed: true, detected_text: "", detected_prices: [] },
    };

    // First call to /complete
    const completeRes1 = await completeRoute(
      new NextRequest("http://localhost:3000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeAuthHeaders(worker.rawToken),
        body: JSON.stringify(completePayload),
      })
    );
    expect(completeRes1.status).toBe(200);
    const data1 = await completeRes1.json();
    expect(data1.status).toBe("completed");
    const firstAssetId = data1.media_asset_id;
    expect(firstAssetId).toBeTruthy();

    // SECOND CALL TO /complete (Network retry or duplicate delivery)
    const completeRes2 = await completeRoute(
      new NextRequest("http://localhost:3000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeAuthHeaders(worker.rawToken),
        body: JSON.stringify(completePayload),
      })
    );
    expect(completeRes2.status).toBe(200);
    const data2 = await completeRes2.json();
    expect(data2.status).toBe("completed");
    expect(data2.media_asset_id).toBe(firstAssetId);
    expect(data2.image_url).toBe(data1.image_url);

    // Verify DB: exactly 1 media_asset record was created for this content_hash
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS count FROM media_assets WHERE content_hash = $1;`,
      [imgHash]
    );
    expect(countRes.rows[0].count).toBe(1);
  });
});
