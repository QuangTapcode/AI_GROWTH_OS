import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { POST as uploadUrlRoute } from "../../src/app/api/v1/gpu-worker/upload-url/route";
import { PUT as uploadProxyRoute } from "../../src/app/api/v1/gpu-worker/upload-proxy/route";
import { POST as completeRoute } from "../../src/app/api/v1/gpu-worker/complete/route";
import { generateWorkerToken } from "../../src/modules/gpuWorkers/auth";
import {
  createImageJob,
  claimNextJob,
  markRunning,
  findImageJobById,
} from "../../src/modules/gpuWorkers/repository";
import {
  getUploadRootDir,
  generateStorageKey,
  validateStorageKeySafety,
} from "../../src/modules/gpuWorkers/storage";

const RUN = process.env.RUN_DB_TESTS === "1";
const TRIPC_WORKSPACE = "10000000-0000-4000-8000-000000000001";

interface TestWorkerInfo {
  id: string;
  name: string;
  rawToken: string;
  tokenHash: string;
}

/**
 * Creates a valid WebP buffer with embedded VP8 header encoding width & height.
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

describe.skipIf(!RUN)("GPU Worker Complete API (POST /api/v1/gpu-worker/complete)", () => {
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

    workerAlpha = await createTestWorker("Worker-Complete-Alpha");
    workerBeta = await createTestWorker("Worker-Complete-Beta");
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

  // Helper to create, claim, and upload a valid WebP file for a job
  async function setupJobAndUpload(
    worker: TestWorkerInfo,
    customDimensions: { width: number; height: number } = { width: 1080, height: 1080 },
    customByteSize: number = 4096,
    isCorruptedWebp: boolean = false
  ) {
    const job = await createImageJob({
      workspace_id: TRIPC_WORKSPACE,
      owner: "test-user-owner",
      request: {
        prompt: "A luxury resort swimming pool with tropical garden, sunny 8k",
        negative_prompt: "blurry, low quality, price, text",
        width: 1080,
        height: 1080,
        seed: 424242,
      },
    });

    const claimed = await claimNextJob(worker.id, ["sdxl_juggernaut_v9"], 120);
    expect(claimed).not.toBeNull();

    // 1. Get upload URL
    const urlReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/upload-url", {
      method: "POST",
      headers: makeWorkerHeaders(worker),
      body: JSON.stringify({
        worker_id: worker.id,
        job_id: job.id,
        content_type: "image/webp",
        byte_size: customByteSize,
      }),
    });
    const urlRes = await uploadUrlRoute(urlReq);
    expect(urlRes.status).toBe(200);
    const target = await urlRes.json();

    // 2. Upload file
    const fileBuf = isCorruptedWebp
      ? Buffer.alloc(customByteSize, "NOT_WEBP_DATA")
      : createMockWebpBuffer(customByteSize, customDimensions.width, customDimensions.height);

    const contentHash = createHash("sha256").update(fileBuf).digest("hex");

    const uploadReq = new NextRequest(`http://localhost:4000${target.upload_url}`, {
      method: "PUT",
      headers: { "content-type": "image/webp" },
      body: fileBuf as any,
    });
    const uploadRes = await uploadProxyRoute(uploadReq);

    const rootDir = getUploadRootDir();
    const diskPath = path.resolve(rootDir, target.storage_key);
    createdFilesToClean.push(diskPath);

    return { job, target, fileBuf, contentHash, diskPath, uploadRes };
  }

  // --------------------------------------------------------------------------
  // 1. HAPPY PATH & TRANSACTION INTEGRITY
  // --------------------------------------------------------------------------
  describe("1. Happy Path & Atomic State Transition", () => {
    it("hoàn thành job thành công: tạo media_assets, cập nhật completed, giải phóng worker", async () => {
      const { job, target, contentHash } = await setupJobAndUpload(workerAlpha);

      // Worker gọi POST /api/v1/gpu-worker/complete
      const completeReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          storage_key: target.storage_key,
          content_hash: contentHash,
          width: 1080,
          height: 1080,
          byte_size: 4096,
          seed: 424242,
          cost_usd: 0.0,
          generation_time_ms: 12500,
          pre_guardrail: {
            ocr_engine: "tesseract_5.3",
            passed: true,
            detected_text: "",
            detected_prices: [],
          },
        }),
      });

      const res = await completeRoute(completeReq);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.job_id).toBe(job.id);
      expect(data.status).toBe("completed");
      expect(data).toHaveProperty("media_asset_id");
      expect(data).toHaveProperty("image_url");
      expect(data.image_url).toContain(target.storage_key);

      // Verify image_jobs in DB
      const updatedJob = await findImageJobById(job.id);
      expect(updatedJob).not.toBeNull();
      expect(updatedJob!.status).toBe("completed");
      expect(updatedJob!.completed_at).not.toBeNull();
      expect(updatedJob!.media_asset_id).toBe(data.media_asset_id);
      expect(updatedJob!.guardrail_report).toEqual({
        ocr_engine: "tesseract_5.3",
        passed: true,
        detected_text: "",
        detected_prices: [],
      });

      // Verify media_assets in DB
      const assetRes = await pool.query(
        `SELECT * FROM media_assets WHERE id = $1;`,
        [data.media_asset_id]
      );
      expect(assetRes.rows.length).toBe(1);
      const asset = assetRes.rows[0];
      expect(asset.is_ai_generated).toBe(true);
      expect(asset.license).toBe("Internal AI Generated");
      expect(asset.attribution).toBe("TripC AI Growth OS");
      expect(asset.content_hash).toBe(contentHash);
      expect(asset.source_type).toBe("ai_generated");
      expect(asset.width).toBe(1080);
      expect(asset.height).toBe(1080);
      expect(Number(asset.cost_usd)).toBe(0.0);

      // Verify worker status released to 'online'
      const workerRes = await pool.query(`SELECT status, active_job_id FROM gpu_workers WHERE id = $1;`, [
        workerAlpha.id,
      ]);
      expect(workerRes.rows[0].status).toBe("online");
      expect(workerRes.rows[0].active_job_id).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 2. IDEMPOTENCY
  // --------------------------------------------------------------------------
  describe("2. Idempotency (Gọi lặp lại)", () => {
    it("gọi complete lần 2 trả đúng kết quả cũ, không tạo thêm media_assets", async () => {
      const { job, target, contentHash } = await setupJobAndUpload(workerAlpha);

      const payload = {
        worker_id: workerAlpha.id,
        job_id: job.id,
        storage_key: target.storage_key,
        content_hash: contentHash,
        width: 1080,
        height: 1080,
        byte_size: 4096,
        seed: 424242,
        cost_usd: 0.0,
        pre_guardrail: {
          ocr_engine: "tesseract_5.3",
          passed: true,
          detected_text: "",
          detected_prices: [],
        },
      };

      // Lần 1
      const req1 = new NextRequest("http://localhost:4000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify(payload),
      });
      const res1 = await completeRoute(req1);
      expect(res1.status).toBe(200);
      const data1 = await res1.json();

      // Đếm số lượng media_assets trước lần 2
      const countBefore = await pool.query(`SELECT COUNT(*) FROM media_assets;`);

      // Lần 2
      const req2 = new NextRequest("http://localhost:4000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify(payload),
      });
      const res2 = await completeRoute(req2);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();

      // Kết quả giống hệt nhau
      expect(data2.job_id).toBe(data1.job_id);
      expect(data2.status).toBe("completed");
      expect(data2.media_asset_id).toBe(data1.media_asset_id);
      expect(data2.image_url).toBe(data1.image_url);

      // Không tạo thêm bản ghi media_assets nào
      const countAfter = await pool.query(`SELECT COUNT(*) FROM media_assets;`);
      expect(countAfter.rows[0].count).toBe(countBefore.rows[0].count);
    });
  });

  // --------------------------------------------------------------------------
  // 3. INTEGRITY CHECKS & AUTO-CLEANUP ON FAILURE
  // --------------------------------------------------------------------------
  describe("3. Integrity Checks & Error Handling (INTEGRITY_*)", () => {
    it("từ chối khi content_hash sai lệch: xoá file và đánh dấu failed (INTEGRITY_CHECKSUM_MISMATCH)", async () => {
      const { job, target, diskPath } = await setupJobAndUpload(workerAlpha);

      // Worker báo cáo hash giả mạo
      const fakeHash = "0000000000000000000000000000000000000000000000000000000000000000";

      const completeReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          storage_key: target.storage_key,
          content_hash: fakeHash,
          width: 1080,
          height: 1080,
          byte_size: 4096,
          pre_guardrail: { passed: true },
        }),
      });

      const res = await completeRoute(completeReq);
      expect(res.status).toBe(400);

      const errData = await res.json();
      expect(errData.error.code).toBe("INTEGRITY_CHECKSUM_MISMATCH");

      // File phải bị xoá khỏi ổ đĩa
      expect(fs.existsSync(diskPath)).toBe(false);

      // Job trong DB phải chuyển sang status = 'failed' với error_code
      const failedJob = await findImageJobById(job.id);
      expect(failedJob!.status).toBe("failed");
      expect(failedJob!.error_code).toBe("INTEGRITY_CHECKSUM_MISMATCH");
    });

    it("từ chối khi kích thước ảnh sai lệch so với preset > 1.5% (INTEGRITY_DIMENSIONS_MISMATCH)", async () => {
      // Setup ảnh có kích thước 512x512 trong khi job yêu cầu 1080x1080
      const { job, target, contentHash, diskPath } = await setupJobAndUpload(
        workerAlpha,
        { width: 512, height: 512 },
        4096
      );

      const completeReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          storage_key: target.storage_key,
          content_hash: contentHash,
          width: 512,
          height: 512,
          byte_size: 4096,
          pre_guardrail: { passed: true },
        }),
      });

      const res = await completeRoute(completeReq);
      expect(res.status).toBe(400);

      const errData = await res.json();
      expect(errData.error.code).toBe("INTEGRITY_DIMENSIONS_MISMATCH");

      // File bị xoá
      expect(fs.existsSync(diskPath)).toBe(false);

      // Job đánh dấu failed
      const failedJob = await findImageJobById(job.id);
      expect(failedJob!.status).toBe("failed");
      expect(failedJob!.error_code).toBe("INTEGRITY_DIMENSIONS_MISMATCH");
    });

    it("từ chối khi file không phải định dạng WebP hợp lệ (INTEGRITY_INVALID_MAGIC_BYTES)", async () => {
      // Upload trực tiếp file giả mạo vào vị trí serverStorageKey
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Corrupted file test",
          negative_prompt: "",
          width: 1080,
          height: 1080,
          seed: 111,
        },
      });
      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);

      const serverKey = generateStorageKey(job.id);
      const rootDir = getUploadRootDir();
      const targetPath = validateStorageKeySafety(serverKey, rootDir);
      createdFilesToClean.push(targetPath);

      await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
      // Ghi dữ liệu không phải WebP
      const badBuffer = Buffer.alloc(2048, "NON_WEBP_BINARY_DATA");
      await fs.promises.writeFile(targetPath, badBuffer);
      const badHash = createHash("sha256").update(badBuffer).digest("hex");

      const completeReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          content_hash: badHash,
          width: 1080,
          height: 1080,
          byte_size: 2048,
          pre_guardrail: { passed: true },
        }),
      });

      const res = await completeRoute(completeReq);
      expect(res.status).toBe(400);

      const errData = await res.json();
      expect(errData.error.code).toBe("INTEGRITY_INVALID_MAGIC_BYTES");
      expect(fs.existsSync(targetPath)).toBe(false);
    });

    it("từ chối khi pre_guardrail.passed không phải là true (INTEGRITY_GUARDRAIL_REJECTED)", async () => {
      const { job, target, contentHash, diskPath } = await setupJobAndUpload(workerAlpha);

      const completeReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          storage_key: target.storage_key,
          content_hash: contentHash,
          width: 1080,
          height: 1080,
          byte_size: 4096,
          pre_guardrail: {
            passed: false,
            detected_text: "500.000 VNĐ",
            detected_prices: ["500000"],
          },
        }),
      });

      const res = await completeRoute(completeReq);
      expect(res.status).toBe(400);

      const errData = await res.json();
      expect(errData.error.code).toBe("INTEGRITY_GUARDRAIL_REJECTED");
      expect(fs.existsSync(diskPath)).toBe(false);

      const failedJob = await findImageJobById(job.id);
      expect(failedJob!.status).toBe("failed");
      expect(failedJob!.error_code).toBe("INTEGRITY_GUARDRAIL_REJECTED");
    });
  });

  // --------------------------------------------------------------------------
  // 4. CONFLICTS & REASSIGNMENTS (HTTP 409)
  // --------------------------------------------------------------------------
  describe("4. Ownership Conflicts & State Enforcement (409)", () => {
    it("trả 409 khi worker khác cố complete job không thuộc về mình", async () => {
      const { job, target, contentHash } = await setupJobAndUpload(workerAlpha);

      // workerBeta gọi complete cho job của workerAlpha
      const completeReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeWorkerHeaders(workerBeta),
        body: JSON.stringify({
          worker_id: workerBeta.id,
          job_id: job.id,
          storage_key: target.storage_key,
          content_hash: contentHash,
          width: 1080,
          height: 1080,
          byte_size: 4096,
          pre_guardrail: { passed: true },
        }),
      });

      const res = await completeRoute(completeReq);
      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.status).toBe("lost");
    });

    it("trả 409 khi job đã bị huỷ (cancelled)", async () => {
      const { job, target, contentHash } = await setupJobAndUpload(workerAlpha);

      // Huỷ job
      await pool.query(`UPDATE image_jobs SET status = 'cancelled' WHERE id = $1;`, [job.id]);

      const completeReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          storage_key: target.storage_key,
          content_hash: contentHash,
          width: 1080,
          height: 1080,
          byte_size: 4096,
          pre_guardrail: { passed: true },
        }),
      });

      const res = await completeRoute(completeReq);
      expect(res.status).toBe(409);

      const data = await res.json();
      expect(data.status).toBe("cancelled");
    });
  });

  // --------------------------------------------------------------------------
  // 5. SERVER-DERIVED STORAGE KEY ENFORCEMENT
  // --------------------------------------------------------------------------
  describe("5. Server-derived Storage Key Enforcement", () => {
    it("server tự suy ra storage_key và bỏ qua storage_key giả mạo của client", async () => {
      const { job, target, contentHash } = await setupJobAndUpload(workerAlpha);

      // Client cố tình gửi storage_key sai hoặc giả mạo
      const maliciousStorageKey = "arbitrary/path/injected.webp";

      const completeReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/complete", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          storage_key: maliciousStorageKey,
          content_hash: contentHash,
          width: 1080,
          height: 1080,
          byte_size: 4096,
          pre_guardrail: { passed: true },
        }),
      });

      const res = await completeRoute(completeReq);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("completed");
      // Server sử dụng đúng serverStorageKey chuẩn, không dùng maliciousStorageKey
      expect(data.image_url).toContain(target.storage_key);
      expect(data.image_url).not.toContain(maliciousStorageKey);
    });
  });
});

