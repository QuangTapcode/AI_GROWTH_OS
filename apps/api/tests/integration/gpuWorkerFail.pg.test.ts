import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { POST as uploadUrlRoute } from "../../src/app/api/v1/gpu-worker/upload-url/route";
import { PUT as uploadProxyRoute } from "../../src/app/api/v1/gpu-worker/upload-proxy/route";
import { POST as failRoute } from "../../src/app/api/v1/gpu-worker/fail/route";
import { generateWorkerToken } from "../../src/modules/gpuWorkers/auth";
import {
  createImageJob,
  claimNextJob,
  findImageJobById,
  findImageJobsByRootId,
} from "../../src/modules/gpuWorkers/repository";
import {
  getUploadRootDir,
  generateStorageKey,
  validateStorageKeySafety,
} from "../../src/modules/gpuWorkers/storage";
import {
  stripCompelGuardrailTokens,
  reinforceNegativePromptForAttempt,
} from "../../src/modules/gpuWorkers/service";

const RUN = process.env.RUN_DB_TESTS === "1";
const TRIPC_WORKSPACE = "10000000-0000-4000-8000-000000000001";

interface TestWorkerInfo {
  id: string;
  name: string;
  rawToken: string;
  tokenHash: string;
}

function createMockWebpBuffer(byteSize: number = 2048): Buffer {
  const buf = Buffer.alloc(byteSize, 0x00);
  buf.write("RIFF", 0, 4, "ascii");
  buf.writeUInt32LE(byteSize - 8, 4);
  buf.write("WEBP", 8, 4, "ascii");
  buf.write("VP8 ", 12, 4, "ascii");
  buf.writeUInt32LE(byteSize - 20, 16);
  buf[20] = 0x00;
  buf[21] = 0x00;
  buf[22] = 0x00;
  buf[23] = 0x9d;
  buf[24] = 0x01;
  buf[25] = 0x2a;
  buf.writeUInt16LE(1080 & 0x3fff, 26);
  buf.writeUInt16LE(1080 & 0x3fff, 28);
  return buf;
}

describe.skipIf(!RUN)("GPU Worker Fail & Retry API (POST /api/v1/gpu-worker/fail)", () => {
  let pool: Pool;
  let workerAlpha: TestWorkerInfo;
  let workerBeta: TestWorkerInfo;
  const createdFilesToClean: string[] = [];

  beforeAll(async () => {
    const connStr =
      process.env.DATABASE_URL ||
      "postgres://ai_growth_dev:ae5a9cb1e19ca954422a6aca20206537f63c9e716a051c1f250bac717c74d4b9@127.0.0.1:15432/ai_growth_os";
    pool = new Pool({ connectionString: connStr });

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

    workerAlpha = await createTestWorker("Worker-Fail-Alpha");
    workerBeta = await createTestWorker("Worker-Fail-Beta");
  });

  afterAll(async () => {
    for (const filePath of createdFilesToClean) {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // Ignore
        }
      }
    }

    if (pool) {
      if (workerAlpha?.id && workerBeta?.id) {
        await pool.query(
          `DELETE FROM gpu_workers WHERE id IN ($1, $2);`,
          [workerAlpha.id, workerBeta.id]
        );
      }
      await pool.end();
    }
  });

  beforeEach(async () => {
    await pool.query(
      `UPDATE image_jobs SET status = 'cancelled' WHERE status IN ('queued', 'claimed', 'running', 'uploaded', 'reviewing');`
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
  // 1. UNIT TEST NEGATIVE PROMPT REINFORCEMENT & DEDUPLICATION
  // --------------------------------------------------------------------------
  describe("1. Negative Prompt Compel Weighting & Deduplication Helpers", () => {
    it("stripCompelGuardrailTokens loại bỏ sạch các token compel cũ", () => {
      const base = "blurry, low quality, no text";
      const withTokens = `${base}, (text:1.3), (price tag:1.3), (words:1.3), (letters:1.3), (numbers:1.3), (watermark:1.3)`;
      const cleaned = stripCompelGuardrailTokens(withTokens);
      expect(cleaned).toBe(base);
    });

    it("reinforceNegativePromptForAttempt tăng trọng số chính xác không cộng dồn trùng lặp", () => {
      const base = "blurry, low quality";

      // Attempt 2: trọng số 1.3
      const attempt2 = reinforceNegativePromptForAttempt(base, 2);
      expect(attempt2).toContain("(text:1.3)");
      expect(attempt2).toContain("(price tag:1.3)");
      expect(attempt2).not.toContain("1.5");

      // Attempt 3: thay thế thành 1.5, không cộng dồn 1.3
      const attempt3 = reinforceNegativePromptForAttempt(attempt2, 3);
      expect(attempt3).toContain("(text:1.5)");
      expect(attempt3).toContain("(price tag:1.5)");
      expect(attempt3).not.toContain("1.3");
    });
  });

  // --------------------------------------------------------------------------
  // 2. 3 LẦN GUARDRAIL FAIL LIÊN TIẾP -> NEEDS_ASSETS
  // --------------------------------------------------------------------------
  describe("2. 3 Lần Guardrail Fail Liên Tiếp -> needs_assets", () => {
    it("attempt 1 fail -> attempt 2 (compel 1.3) -> attempt 3 (compel 1.5) -> needs_assets", async () => {
      // 1. Khởi tạo Job Attempt 1
      const jobAttempt1 = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Luxury infinity pool with beach view",
          negative_prompt: "blurry, low quality, no text",
          width: 1080,
          height: 1080,
          seed: 1001,
        },
      });
      const rootJobId = jobAttempt1.root_job_id;

      // Worker claim attempt 1
      const claimed1 = await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);
      expect(claimed1!.id).toBe(jobAttempt1.id);

      // Attempt 1 thất bại do dính giá tiền
      const failReq1 = new NextRequest("http://localhost:4000/api/v1/gpu-worker/fail", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: jobAttempt1.id,
          error_code: "GUARDRAIL_PRICE_DETECTED",
          error_message: "Detected price 500k in image",
          retryable: true,
          details: { detected_text: "Deal 500k", ocr_engine: "tesseract_5.3" },
        }),
      });

      const res1 = await failRoute(failReq1);
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.status).toBe("failed");
      expect(data1.action).toBe("attempt_rescheduled");
      expect(data1.next_attempt).toBe(2);

      // Kiểm tra DB: Attempt 1 là failed, guardrail_report được lưu
      const dbAttempt1 = await findImageJobById(jobAttempt1.id);
      expect(dbAttempt1!.status).toBe("failed");
      expect(dbAttempt1!.error_code).toBe("GUARDRAIL_PRICE_DETECTED");
      expect(dbAttempt1!.guardrail_report).toEqual({
        detected_text: "Deal 500k",
        ocr_engine: "tesseract_5.3",
      });

      // Kiểm tra DB: Attempt 2 được tạo tự động với seed mới và negative prompt tăng 1.3
      const allJobsAfter1 = await findImageJobsByRootId(rootJobId);
      expect(allJobsAfter1.length).toBe(2);
      const dbAttempt2 = allJobsAfter1.find((j) => j.attempt === 2);
      expect(dbAttempt2).toBeDefined();
      expect(dbAttempt2!.status).toBe("queued");
      expect(dbAttempt2!.delivery_count).toBe(0);
      expect(dbAttempt2!.request.seed).not.toBe(1001);
      expect(dbAttempt2!.request.negative_prompt).toContain("(text:1.3)");
      expect(dbAttempt2!.request.negative_prompt).toContain("(price tag:1.3)");

      // 2. Worker claim Attempt 2
      const claimed2 = await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);
      expect(claimed2!.id).toBe(dbAttempt2!.id);

      // Attempt 2 tiếp tục thất bại do guardrail phát hiện chữ
      const failReq2 = new NextRequest("http://localhost:4000/api/v1/gpu-worker/fail", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: dbAttempt2!.id,
          error_code: "GUARDRAIL_TEXT_DETECTED",
          error_message: "Detected watermark text",
          retryable: true,
          details: { detected_text: "TripC Hotel", ocr_engine: "tesseract_5.3" },
        }),
      });

      const res2 = await failRoute(failReq2);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.status).toBe("failed");
      expect(data2.action).toBe("attempt_rescheduled");
      expect(data2.next_attempt).toBe(3);

      // Kiểm tra DB: Attempt 3 được tạo với compel 1.5 (không trùng lặp 1.3)
      const allJobsAfter2 = await findImageJobsByRootId(rootJobId);
      expect(allJobsAfter2.length).toBe(3);
      const dbAttempt3 = allJobsAfter2.find((j) => j.attempt === 3);
      expect(dbAttempt3).toBeDefined();
      expect(dbAttempt3!.status).toBe("queued");
      expect(dbAttempt3!.request.negative_prompt).toContain("(text:1.5)");
      expect(dbAttempt3!.request.negative_prompt).toContain("(price tag:1.5)");
      expect(dbAttempt3!.request.negative_prompt).not.toContain("1.3");

      // 3. Worker claim Attempt 3
      const claimed3 = await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);
      expect(claimed3!.id).toBe(dbAttempt3!.id);

      // Attempt 3 thất bại tiếp -> HẾT LƯỢT (max attempts = 3)
      const failReq3 = new NextRequest("http://localhost:4000/api/v1/gpu-worker/fail", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: dbAttempt3!.id,
          error_code: "GUARDRAIL_PRICE_DETECTED",
          error_message: "Still detected price pattern",
          retryable: true,
          details: { detected_text: "Price tag", ocr_engine: "tesseract_5.3" },
        }),
      });

      const res3 = await failRoute(failReq3);
      expect(res3.status).toBe(200);
      const data3 = await res3.json();
      expect(data3.status).toBe("needs_assets");
      expect(data3.action).toBe("needs_assets");
      expect(data3.next_attempt).toBeNull();

      // Kiểm tra DB: Attempt 3 chuyển thành needs_assets, KHÔNG có attempt 4
      const dbAttempt3Final = await findImageJobById(dbAttempt3!.id);
      expect(dbAttempt3Final!.status).toBe("needs_assets");

      const allJobsFinal = await findImageJobsByRootId(rootJobId);
      expect(allJobsFinal.length).toBe(3);
    });
  });

  // --------------------------------------------------------------------------
  // 3. OOM / LỖI KỸ THUẬT -> ATTEMPT MỚI NHƯNG NEGATIVE PROMPT KHÔNG ĐỔI
  // --------------------------------------------------------------------------
  describe("3. Technical Errors (OOM) -> Only Rotate Seed", () => {
    it("OOM tạo attempt mới với seed mới nhưng giữ nguyên negative_prompt", async () => {
      const originalNegative = "blurry, low quality, distorted anatomy, ugly";
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Huge detailed cityscape",
          negative_prompt: originalNegative,
          width: 1080,
          height: 1080,
          seed: 5555,
        },
      });

      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);

      // Báo lỗi OOM
      const failReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/fail", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          error_code: "CUDA_OUT_OF_MEMORY",
          error_message: "CUDA out of memory while allocating 4GB for unet",
          retryable: true,
          details: { vram_free_mb: 120 },
        }),
      });

      const res = await failRoute(failReq);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.action).toBe("attempt_rescheduled");
      expect(data.next_attempt).toBe(2);

      // Kiểm tra Attempt 2: seed đổi ngẫu nhiên, nhưng negative_prompt KHÔNG THAY ĐỔI
      const siblings = await findImageJobsByRootId(job.root_job_id);
      expect(siblings.length).toBe(2);
      const attempt2 = siblings.find((j) => j.attempt === 2);
      expect(attempt2).toBeDefined();
      expect(attempt2!.request.seed).not.toBe(5555);
      expect(attempt2!.request.negative_prompt).toBe(originalNegative);
      expect(attempt2!.request.negative_prompt).not.toContain("text:1.3");
    });

    it("lỗi kỹ thuật khi hết 3 lượt thì chuyển 'failed' (không phải needs_assets)", async () => {
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        attempt: 3, // Giả lập đang ở attempt 3
        request: {
          prompt: "City view",
          negative_prompt: "blurry",
          width: 1080,
          height: 1080,
          seed: 999,
        },
      });

      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);

      const failReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/fail", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          error_code: "CUDA_OUT_OF_MEMORY",
          error_message: "CUDA out of memory",
          retryable: true,
        }),
      });

      const res = await failRoute(failReq);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("failed");
      expect(data.action).toBe("failed");
      expect(data.next_attempt).toBeNull();

      const finalJob = await findImageJobById(job.id);
      expect(finalJob!.status).toBe("failed");
    });
  });

  // --------------------------------------------------------------------------
  // 4. IDEMPOTENCY (GỌI LẶP LẠI KHÔNG TẠO 2 ATTEMPT CON)
  // --------------------------------------------------------------------------
  describe("4. Idempotency (Gọi lặp lại)", () => {
    it("worker gọi fail nhiều lần cho cùng 1 job không sinh thêm attempt con thừa", async () => {
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Idempotency fail test",
          negative_prompt: "blurry",
          width: 1080,
          height: 1080,
          seed: 888,
        },
      });

      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);

      const payload = {
        worker_id: workerAlpha.id,
        job_id: job.id,
        error_code: "GUARDRAIL_PRICE_DETECTED",
        error_message: "Price detected",
        retryable: true,
      };

      // Lần 1
      const req1 = new NextRequest("http://localhost:4000/api/v1/gpu-worker/fail", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify(payload),
      });
      const res1 = await failRoute(req1);
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.action).toBe("attempt_rescheduled");
      expect(data1.next_attempt).toBe(2);

      // Đếm số job dưới root_job_id
      const count1 = await findImageJobsByRootId(job.root_job_id);
      expect(count1.length).toBe(2);

      // Lần 2 (gọi lại cùng payload)
      const req2 = new NextRequest("http://localhost:4000/api/v1/gpu-worker/fail", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify(payload),
      });
      const res2 = await failRoute(req2);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.action).toBe("attempt_rescheduled");
      expect(data2.next_attempt).toBe(2);

      // Kiểm tra: vẫn chỉ có 2 jobs (không tạo thêm attempt con thứ 3)
      const count2 = await findImageJobsByRootId(job.root_job_id);
      expect(count2.length).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // 5. NON-RETRYABLE ERRORS & FILE CLEANUP
  // --------------------------------------------------------------------------
  describe("5. Non-Retryable Errors & File Cleanup", () => {
    it("lỗi không thể retry (MODEL_NOT_SUPPORTED) -> failed ngay lập tức", async () => {
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Non-retryable test",
          negative_prompt: "blurry",
          width: 1080,
          height: 1080,
          seed: 111,
        },
      });

      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);

      const failReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/fail", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          error_code: "MODEL_NOT_SUPPORTED",
          error_message: "Requested model is not installed on worker",
          retryable: false,
        }),
      });

      const res = await failRoute(failReq);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("failed");
      expect(data.action).toBe("failed");
      expect(data.next_attempt).toBeNull();

      const updated = await findImageJobById(job.id);
      expect(updated!.status).toBe("failed");
      expect(updated!.error_code).toBe("MODEL_NOT_SUPPORTED");

      const siblings = await findImageJobsByRootId(job.root_job_id);
      expect(siblings.length).toBe(1);
    });

    it("xoá object đã upload của attempt khi bị fail", async () => {
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "File cleanup on fail test",
          negative_prompt: "blurry",
          width: 1080,
          height: 1080,
          seed: 222,
        },
      });

      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);

      // 1. Worker xin upload target và tải file lên
      const urlReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/upload-url", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          content_type: "image/webp",
          byte_size: 2048,
        }),
      });
      const urlRes = await uploadUrlRoute(urlReq);
      const target = await urlRes.json();

      const uploadReq = new NextRequest(`http://localhost:4000${target.upload_url}`, {
        method: "PUT",
        headers: { "content-type": "image/webp" },
        body: createMockWebpBuffer(2048) as any,
      });
      await uploadProxyRoute(uploadReq);

      const rootDir = getUploadRootDir();
      const diskPath = validateStorageKeySafety(target.storage_key, rootDir);
      createdFilesToClean.push(diskPath);
      expect(fs.existsSync(diskPath)).toBe(true);

      // 2. Worker sau đó phát hiện lỗi OCR và gọi fail
      const failReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/fail", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          error_code: "GUARDRAIL_PRICE_DETECTED",
          error_message: "Late OCR detection",
          retryable: true,
        }),
      });

      const res = await failRoute(failReq);
      expect(res.status).toBe(200);

      // File đã upload phải bị xoá khỏi ổ đĩa
      expect(fs.existsSync(diskPath)).toBe(false);
    });

    it("trả 409 khi worker khác cố fail job của workerAlpha", async () => {
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Ownership test",
          negative_prompt: "",
          width: 1080,
          height: 1080,
          seed: 333,
        },
      });

      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);

      // workerBeta gọi fail
      const failReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/fail", {
        method: "POST",
        headers: makeWorkerHeaders(workerBeta),
        body: JSON.stringify({
          worker_id: workerBeta.id,
          job_id: job.id,
          error_code: "GUARDRAIL_PRICE_DETECTED",
        }),
      });

      const res = await failRoute(failReq);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.status).toBe("lost");
    });
  });
});

