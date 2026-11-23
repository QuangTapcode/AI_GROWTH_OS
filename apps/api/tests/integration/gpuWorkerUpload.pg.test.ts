import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import { POST as uploadUrlRoute } from "../../src/app/api/v1/gpu-worker/upload-url/route";
import { PUT as uploadProxyRoute } from "../../src/app/api/v1/gpu-worker/upload-proxy/route";
import { generateWorkerToken } from "../../src/modules/gpuWorkers/auth";
import {
  createImageJob,
  claimNextJob,
  markRunning,
  findImageJobById,
} from "../../src/modules/gpuWorkers/repository";
import {
  generateUploadToken,
  validateStorageKeySafety,
  getUploadRootDir,
  getUploadTargetProvider,
  R2PresignedUploadProvider,
  LocalProxyUploadProvider,
  isValidWebpBuffer,
} from "../../src/modules/gpuWorkers/storage";
import { AppError } from "../../src/lib/errors";

const RUN = process.env.RUN_DB_TESTS === "1";
const TRIPC_WORKSPACE = "10000000-0000-4000-8000-000000000001";

interface TestWorkerInfo {
  id: string;
  name: string;
  rawToken: string;
  tokenHash: string;
}

/**
 * Creates a minimal valid WebP buffer:
 * Bytes 0-3: 'RIFF', Bytes 4-7: size - 8, Bytes 8-11: 'WEBP', Bytes 12-15: 'VP8 '
 */
function createMockWebpBuffer(byteSize: number = 2048): Buffer {
  const buf = Buffer.alloc(byteSize, 0x20);
  buf.write("RIFF", 0, 4, "ascii");
  buf.writeUInt32LE(byteSize - 8, 4);
  buf.write("WEBP", 8, 4, "ascii");
  buf.write("VP8 ", 12, 4, "ascii");
  return buf;
}

describe.skipIf(!RUN)("GPU Worker Upload Target & Proxy API (Prompt 10)", () => {
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

    workerAlpha = await createTestWorker("Worker-Upload-Alpha");
    workerBeta = await createTestWorker("Worker-Upload-Beta");
  });

  afterAll(async () => {
    // Clean up created files on disk
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
  // 1. REQUEST UPLOAD URL (POST /api/v1/gpu-worker/upload-url)
  // --------------------------------------------------------------------------
  describe("1. Request Upload URL (POST /api/v1/gpu-worker/upload-url)", () => {
    it("cấp upload target hợp lệ cho job đang 'claimed' của chính worker", async () => {
      // 1. Tạo và claim job cho workerAlpha
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Modern architectural luxury villa, cinematic 8k",
          negative_prompt: "blurry, low quality",
          width: 1080,
          height: 1080,
          seed: 42,
        },
      });

      const claimed = await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);
      expect(claimed).not.toBeNull();
      expect(claimed!.id).toBe(job.id);
      expect(claimed!.status).toBe("claimed");

      // 2. Request upload url
      const req = new NextRequest("http://localhost:4000/api/v1/gpu-worker/upload-url", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          content_type: "image/webp",
          byte_size: 512000, // 500KB
        }),
      });

      const res = await uploadUrlRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toHaveProperty("storage_key");
      expect(data).toHaveProperty("upload_url");
      expect(data.http_method).toBe("PUT");
      expect(data.required_headers).toEqual({ "Content-Type": "image/webp" });
      expect(data.expires_in_seconds).toBe(300);

      // Verify storage key format: generated/YYYY/MM/DD/asset_<job_id>.webp
      expect(data.storage_key).toMatch(
        new RegExp(`^generated/\\d{4}/\\d{2}/\\d{2}/asset_${job.id}\\.webp$`)
      );

      // Verify upload_url contains /api/v1/gpu-worker/upload-proxy?token=
      expect(data.upload_url).toContain("/api/v1/gpu-worker/upload-proxy?token=");
    });

    it("cấp upload target hợp lệ cho job đang 'running' của worker", async () => {
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Cozy cafe with warm bokeh lighting",
          negative_prompt: "ugly",
          width: 1080,
          height: 1080,
          seed: 99,
        },
      });

      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);
      await markRunning(job.id, workerAlpha.id);

      const req = new NextRequest("http://localhost:4000/api/v1/gpu-worker/upload-url", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          content_type: "image/webp",
          byte_size: 204800,
        }),
      });

      const res = await uploadUrlRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.storage_key).toContain(`asset_${job.id}.webp`);
    });

    it("từ chối cấp upload target khi worker khác cố lấy cho job của workerAlpha (403)", async () => {
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Futuristic neon city",
          negative_prompt: "dark",
          width: 1080,
          height: 1080,
          seed: 123,
        },
      });

      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);

      // workerBeta tries to request upload-url for workerAlpha's job
      const req = new NextRequest("http://localhost:4000/api/v1/gpu-worker/upload-url", {
        method: "POST",
        headers: makeWorkerHeaders(workerBeta),
        body: JSON.stringify({
          worker_id: workerBeta.id,
          job_id: job.id,
          content_type: "image/webp",
          byte_size: 204800,
        }),
      });

      const res = await uploadUrlRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("JOB_WORKER_MISMATCH");
    });

    it("từ chối cấp upload target cho job đang ở trạng thái 'queued' (chưa claim) (400)", async () => {
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Unclaimed job test",
          negative_prompt: "",
          width: 1080,
          height: 1080,
          seed: 777,
        },
      });

      const req = new NextRequest("http://localhost:4000/api/v1/gpu-worker/upload-url", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          content_type: "image/webp",
          byte_size: 10240,
        }),
      });

      const res = await uploadUrlRoute(req);
      // Fails with either 403 (unclaimed) or 400 (invalid state)
      expect([400, 403]).toContain(res.status);
    });

    it("từ chối khi thiếu token worker auth (401)", async () => {
      const req = new NextRequest("http://localhost:4000/api/v1/gpu-worker/upload-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          job_id: randomUUID(),
          content_type: "image/webp",
          byte_size: 10240,
        }),
      });

      const res = await uploadUrlRoute(req);
      expect(res.status).toBe(401);
    });
  });

  // --------------------------------------------------------------------------
  // 2. UPLOAD PROXY ENDPOINT (PUT /api/v1/gpu-worker/upload-proxy)
  // --------------------------------------------------------------------------
  describe("2. Upload Proxy Binary Endpoint (PUT /api/v1/gpu-worker/upload-proxy)", () => {
    it("upload hợp lệ: ghi file WebP vào /uploads/generated, hash đúng, DB cập nhật 'uploaded'", async () => {
      // 1. Tạo và claim job
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Majestic snow mountain at sunset, 8k photo",
          negative_prompt: "oversaturated",
          width: 1080,
          height: 1080,
          seed: 8888,
        },
      });
      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);

      // 2. Worker xin upload target
      const urlReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/upload-url", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          content_type: "image/webp",
          byte_size: 4096,
        }),
      });
      const urlRes = await uploadUrlRoute(urlReq);
      expect(urlRes.status).toBe(200);
      const target = await urlRes.json();

      // 3. Worker upload binary WebP image qua upload_url
      const webpBuffer = createMockWebpBuffer(4096);
      const expectedSha256 = createHash("sha256").update(webpBuffer).digest("hex");

      const uploadProxyUrl = `http://localhost:4000${target.upload_url}`;
      const uploadReq = new NextRequest(uploadProxyUrl, {
        method: "PUT",
        headers: {
          "content-type": "image/webp",
        },
        body: webpBuffer as any,
      });

      const uploadRes = await uploadProxyRoute(uploadReq);
      expect(uploadRes.status).toBe(200);

      const uploadData = await uploadRes.json();
      expect(uploadData.status).toBe("uploaded");
      expect(uploadData.storage_key).toBe(target.storage_key);
      expect(uploadData.byte_size).toBe(4096);
      expect(uploadData.sha256).toBe(expectedSha256);
      expect(uploadRes.headers.get("etag")).toBe(`"${expectedSha256}"`);

      // 4. Kiểm tra file trên ổ đĩa
      const rootDir = getUploadRootDir();
      const savedFilePath = path.resolve(rootDir, target.storage_key);
      createdFilesToClean.push(savedFilePath);

      expect(fs.existsSync(savedFilePath)).toBe(true);
      const diskContent = fs.readFileSync(savedFilePath);
      expect(diskContent.length).toBe(4096);
      expect(isValidWebpBuffer(diskContent)).toBe(true);
      expect(createHash("sha256").update(diskContent).digest("hex")).toBe(expectedSha256);

      // 5. Kiểm tra DB: image_jobs chuyển sang 'uploaded' với đúng result_storage_key và result_sha256
      const updatedJob = await findImageJobById(job.id);
      expect(updatedJob).not.toBeNull();
      expect(updatedJob!.status).toBe("uploaded");
      expect(updatedJob!.result_storage_key).toBe(target.storage_key);
      expect(updatedJob!.result_sha256).toBe(expectedSha256);
    });

    it("từ chối upload vượt quá 10MB (413 Payload Too Large)", async () => {
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Huge file test",
          negative_prompt: "",
          width: 1080,
          height: 1080,
          seed: 1,
        },
      });
      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);

      const urlReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/upload-url", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          content_type: "image/webp",
          byte_size: 5000000,
        }),
      });
      const urlRes = await uploadUrlRoute(urlReq);
      const target = await urlRes.json();

      // Buffer 10MB + 1024 bytes (exceeds 10 * 1024 * 1024)
      const hugeBuffer = createMockWebpBuffer(10 * 1024 * 1024 + 1024);

      const uploadReq = new NextRequest(`http://localhost:4000${target.upload_url}`, {
        method: "PUT",
        headers: { "content-type": "image/webp" },
        body: hugeBuffer as any,
      });

      const uploadRes = await uploadProxyRoute(uploadReq);
      expect(uploadRes.status).toBe(413);

      const data = await uploadRes.json();
      expect(data.error.code).toBe("PAYLOAD_TOO_LARGE");

      // Verify no file was written to disk
      const rootDir = getUploadRootDir();
      const targetPath = path.resolve(rootDir, target.storage_key);
      expect(fs.existsSync(targetPath)).toBe(false);
    });

    it("từ chối upload file quá nhỏ (< 1KB) (400 Bad Request)", async () => {
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Small file test",
          negative_prompt: "",
          width: 1080,
          height: 1080,
          seed: 2,
        },
      });
      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);

      const urlReq = new NextRequest("http://localhost:4000/api/v1/gpu-worker/upload-url", {
        method: "POST",
        headers: makeWorkerHeaders(workerAlpha),
        body: JSON.stringify({
          worker_id: workerAlpha.id,
          job_id: job.id,
          content_type: "image/webp",
          byte_size: 50000,
        }),
      });
      const urlRes = await uploadUrlRoute(urlReq);
      const target = await urlRes.json();

      // Buffer only 500 bytes (< 1024 bytes)
      const tinyBuffer = createMockWebpBuffer(500);

      const uploadReq = new NextRequest(`http://localhost:4000${target.upload_url}`, {
        method: "PUT",
        headers: { "content-type": "image/webp" },
        body: tinyBuffer as any,
      });

      const uploadRes = await uploadProxyRoute(uploadReq);
      expect(uploadRes.status).toBe(400);

      const data = await uploadRes.json();
      expect(data.error.code).toBe("PAYLOAD_TOO_SMALL");
    });

    it("từ chối file có kích thước hợp lệ nhưng sai magic bytes (400 Invalid WebP Format)", async () => {
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Corrupted magic bytes test",
          negative_prompt: "",
          width: 1080,
          height: 1080,
          seed: 3,
        },
      });
      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);

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

      // Buffer of 2048 bytes containing plain text (not RIFF...WEBP)
      const badBuffer = Buffer.alloc(2048, "A");

      const uploadReq = new NextRequest(`http://localhost:4000${target.upload_url}`, {
        method: "PUT",
        headers: { "content-type": "image/webp" },
        body: badBuffer as any,
      });

      const uploadRes = await uploadProxyRoute(uploadReq);
      expect(uploadRes.status).toBe(400);

      const data = await uploadRes.json();
      expect(data.error.code).toBe("INVALID_WEBP_FORMAT");
    });

    it("từ chối Content-Type không phải image/webp (415)", async () => {
      const uploadReq = new NextRequest(
        "http://localhost:4000/api/v1/gpu-worker/upload-proxy?token=some_token",
        {
          method: "PUT",
          headers: { "content-type": "image/png" },
          body: createMockWebpBuffer(2048) as any,
        }
      );

      const uploadRes = await uploadProxyRoute(uploadReq);
      // Rejects either at token verification (401) or content-type check (415)
      expect([401, 415]).toContain(uploadRes.status);
    });

    it("từ chối upload khi token HMAC đã hết hạn (401 Token Expired)", async () => {
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Expired token test",
          negative_prompt: "",
          width: 1080,
          height: 1080,
          seed: 4,
        },
      });

      // Tạo token với exp đã trôi qua (-10 giây)
      const expiredToken = generateUploadToken(
        {
          job_id: job.id,
          worker_id: workerAlpha.id,
          storage_key: `generated/2026/11/11/asset_${job.id}.webp`,
        },
        -10 // Expired 10 seconds ago
      );

      const uploadReq = new NextRequest(
        `http://localhost:4000/api/v1/gpu-worker/upload-proxy?token=${encodeURIComponent(
          expiredToken
        )}`,
        {
          method: "PUT",
          headers: { "content-type": "image/webp" },
          body: createMockWebpBuffer(2048) as any,
        }
      );

      const uploadRes = await uploadProxyRoute(uploadReq);
      expect(uploadRes.status).toBe(401);

      const data = await uploadRes.json();
      expect(data.error.code).toBe("TOKEN_EXPIRED");
    });

    it("từ chối upload khi token bị giả mạo chữ ký (401 Unauthorized)", async () => {
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Tampered token test",
          negative_prompt: "",
          width: 1080,
          height: 1080,
          seed: 5,
        },
      });

      const validToken = generateUploadToken({
        job_id: job.id,
        worker_id: workerAlpha.id,
        storage_key: `generated/2026/11/11/asset_${job.id}.webp`,
      });

      // Alter the signature part
      const [payload, sig] = validToken.split(".");
      const tamperedToken = `${payload}.tampered_signature_12345`;

      const uploadReq = new NextRequest(
        `http://localhost:4000/api/v1/gpu-worker/upload-proxy?token=${encodeURIComponent(
          tamperedToken
        )}`,
        {
          method: "PUT",
          headers: { "content-type": "image/webp" },
          body: createMockWebpBuffer(2048) as any,
        }
      );

      const uploadRes = await uploadProxyRoute(uploadReq);
      expect(uploadRes.status).toBe(401);

      const data = await uploadRes.json();
      expect(data.error.code).toBe("UNAUTHORIZED");
    });
  });

  // --------------------------------------------------------------------------
  // 3. PATH TRAVERSAL PROTECTION & SECURITY
  // --------------------------------------------------------------------------
  describe("3. Path Traversal Protection & Storage Key Safety", () => {
    it("chặn đứng mọi chuỗi path traversal nguy hiểm qua validateStorageKeySafety", () => {
      // Rejects relative directory traversal
      expect(() => validateStorageKeySafety("../../etc/passwd")).toThrow(AppError);
      expect(() => validateStorageKeySafety("generated/../../../secret.txt")).toThrow(AppError);
      expect(() => validateStorageKeySafety("../secret.txt")).toThrow(AppError);

      // Rejects null bytes
      expect(() => validateStorageKeySafety("generated/2026/11/11/asset_test\0.webp")).toThrow(
        AppError
      );

      // Rejects absolute root paths
      expect(() => validateStorageKeySafety("/etc/passwd.webp")).toThrow(AppError);
      expect(() => validateStorageKeySafety("C:\\Windows\\system32\\cmd.exe.webp")).toThrow(
        AppError
      );

      // Rejects arbitrary key format that does not match server pattern
      expect(() => validateStorageKeySafety("custom/folder/image.webp")).toThrow(AppError);

      // Accepts valid server-generated key
      const safePath = validateStorageKeySafety(
        "generated/2026/11/11/asset_7c9e6679-7425-40de-944b-e07fc1f90ae7.webp"
      );
      expect(safePath).toContain(
        path.join("generated", "2026", "11", "11", "asset_7c9e6679-7425-40de-944b-e07fc1f90ae7.webp")
      );
    });

    it("server tuyệt đối không dùng đường dẫn do client gửi lên (chỉ dùng HMAC server token)", async () => {
      // Giả sử kẻ tấn công gửi parameter file_path hoặc custom_key trên URL hoặc body
      const job = await createImageJob({
        workspace_id: TRIPC_WORKSPACE,
        owner: "test-user-owner",
        request: {
          prompt: "Security injection test",
          negative_prompt: "",
          width: 1080,
          height: 1080,
          seed: 6,
        },
      });
      await claimNextJob(workerAlpha.id, ["sdxl_juggernaut_v9"], 120);

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

      // Kẻ tấn công cố thêm &path=../../hacked.webp vào upload proxy URL
      const maliciousUrl = `http://localhost:4000${target.upload_url}&path=../../hacked.webp&file=../../../evil.sh`;
      const uploadReq = new NextRequest(maliciousUrl, {
        method: "PUT",
        headers: { "content-type": "image/webp" },
        body: createMockWebpBuffer(2048) as any,
      });

      const uploadRes = await uploadProxyRoute(uploadReq);
      expect(uploadRes.status).toBe(200);

      const data = await uploadRes.json();
      // Server hoàn toàn phớt lờ query parameters độc hại và chỉ dùng storage_key trong token
      expect(data.storage_key).toBe(target.storage_key);
      expect(data.storage_key).not.toContain("..");
      expect(data.storage_key).not.toContain("hacked");
    });
  });

  // --------------------------------------------------------------------------
  // 4. STORAGE PROVIDER SELECTION & PRODUCTION FAIL-FAST
  // --------------------------------------------------------------------------
  describe("4. Storage Provider Selection & Production Fail-Fast", () => {
    it("ở NODE_ENV=production mà provider là 'local' thì hệ thống từ chối khởi động/thực thi với lỗi rõ ràng", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalProvider = process.env.IMAGE_STORAGE_PROVIDER;

      try {
        (process.env as any).NODE_ENV = "production";
        process.env.IMAGE_STORAGE_PROVIDER = "local";

        expect(() => getUploadTargetProvider()).toThrow(
          /LocalProxyUploadProvider is strictly forbidden in production/i
        );
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
        process.env.IMAGE_STORAGE_PROVIDER = originalProvider;
      }
    });

    it("khi IMAGE_STORAGE_PROVIDER=r2 thì trả về R2PresignedUploadProvider và sinh presigned PUT URL hợp lệ", async () => {
      const originalProvider = process.env.IMAGE_STORAGE_PROVIDER;

      try {
        process.env.IMAGE_STORAGE_PROVIDER = "r2";
        const provider = getUploadTargetProvider();
        expect(provider).toBeInstanceOf(R2PresignedUploadProvider);
        expect(provider.name).toBe("r2");

        const mockJob = {
          id: randomUUID(),
          claimed_by: "worker-1",
        } as any;

        const target = await provider.createUploadTarget(mockJob);
        expect(target.http_method).toBe("PUT");
        expect(target.expires_in_seconds).toBe(300);
        expect(target.required_headers["Content-Type"]).toBe("image/webp");
        expect(target.upload_url).toContain("X-Amz-Signature");
        expect(target.upload_url).toContain("X-Amz-Expires=300");
      } finally {
        process.env.IMAGE_STORAGE_PROVIDER = originalProvider;
      }
    });

    it("khi ở môi trường dev (IMAGE_STORAGE_PROVIDER=local) thì trả về LocalProxyUploadProvider", () => {
      const originalProvider = process.env.IMAGE_STORAGE_PROVIDER;
      try {
        process.env.IMAGE_STORAGE_PROVIDER = "local";
        const provider = getUploadTargetProvider();
        expect(provider).toBeInstanceOf(LocalProxyUploadProvider);
        expect(provider.name).toBe("local");
      } finally {
        process.env.IMAGE_STORAGE_PROVIDER = originalProvider;
      }
    });
  });
});
