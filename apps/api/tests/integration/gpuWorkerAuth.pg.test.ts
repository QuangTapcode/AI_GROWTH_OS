import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import { NextRequest } from "next/server";
import {
  generateWorkerToken,
  hashWorkerToken,
  verifyTokenHashConstantTime,
  GpuWorkerRateLimiter,
  validateHttpsRequirement,
  sanitizeLogString,
  findWorkerByTokenHashWithContext,
  authenticateGpuWorker,
  validatePayloadWorkerId,
  requireGpuWorker,
  withWorkerTransaction,
  handleWorkerError,
  GPU_WORKER_TOKEN_PREFIX,
} from "../../src/modules/gpuWorkers/auth";
import { createGpuWorker } from "../../scripts/create-gpu-worker";
import { revokeGpuWorker } from "../../scripts/revoke-gpu-worker";
import { AppError } from "../../src/lib/errors";

const RUN = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!RUN)("GPU Worker Authentication & Middleware (Zero-Leakage)", () => {
  let pool: Pool;
  let validRawToken: string;
  let validTokenHash: string;
  let testWorkerId: string;
  const testWorkerName = "Test-GPU-Worker-Node-Alpha";

  beforeAll(async () => {
    const connStr =
      process.env.DATABASE_URL ||
      "postgres://ai_growth_dev:ae5a9cb1e19ca954422a6aca20206537f63c9e716a051c1f250bac717c74d4b9@127.0.0.1:15432/ai_growth_os";
    pool = new Pool({ connectionString: connStr });

    // Clean up any existing test worker
    await pool.query(
      `DELETE FROM gpu_workers WHERE name IN ($1, $2, $3);`,
      [testWorkerName, "Test-Disabled-Worker", "Test-Script-Worker"]
    );

    // Create a valid active worker
    const tokenInfo = generateWorkerToken();
    validRawToken = tokenInfo.rawToken;
    validTokenHash = tokenInfo.tokenHash;

    const res = await pool.query<{ id: string }>(
      `INSERT INTO gpu_workers (
         name, token_hash, status, model_key, vram_free_mb, created_at, updated_at
       ) VALUES (
         $1, $2, 'online', 'sdxl_juggernaut_v9', 24576, NOW(), NOW()
       ) RETURNING id;`,
      [testWorkerName, validTokenHash]
    );
    testWorkerId = res.rows[0].id;
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(
        `DELETE FROM gpu_workers WHERE name IN ($1, $2, $3);`,
        [testWorkerName, "Test-Disabled-Worker", "Test-Script-Worker"]
      );
      await pool.end();
    }
  });

  // --------------------------------------------------------------------------
  // 1. TOKEN FORMAT & CRYPTO VERIFICATION
  // --------------------------------------------------------------------------
  describe("1. Token Format & Cryptographic Verification", () => {
    it("phải tạo token đúng chuẩn gwk_live_<64 hex chars> (tổng 73 ký tự)", () => {
      const { rawToken, tokenHash } = generateWorkerToken();
      expect(rawToken.startsWith(GPU_WORKER_TOKEN_PREFIX)).toBe(true);
      expect(rawToken.length).toBe(73); // 9 ('gwk_live_') + 64 hex
      expect(tokenHash.length).toBe(64); // SHA-256 hex
      expect(hashWorkerToken(rawToken)).toBe(tokenHash);
    });

    it("timingSafeEqual phải so sánh chính xác và bất biến thời gian", () => {
      const { rawToken, tokenHash } = generateWorkerToken();
      expect(verifyTokenHashConstantTime(tokenHash, tokenHash)).toBe(true);

      const replacementChar = tokenHash[0] === "a" ? "b" : "a";
      const tamperedHash = replacementChar + tokenHash.substring(1);
      expect(verifyTokenHashConstantTime(tamperedHash, tokenHash)).toBe(false);
      expect(verifyTokenHashConstantTime("invalid", tokenHash)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. AUTHENTICATION & TOKEN CHECKS
  // --------------------------------------------------------------------------
  describe("2. Worker Authentication Guard", () => {
    it("phải từ chối khi thiếu Authorization header (401)", async () => {
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
      });

      await expect(authenticateGpuWorker(req)).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 401,
          code: "UNAUTHORIZED",
        })
      );
    });

    it("phải từ chối khi Authorization không phải Bearer (401)", async () => {
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from("user:pass").toString("base64")}`,
        },
      });

      await expect(authenticateGpuWorker(req)).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 401,
          code: "UNAUTHORIZED",
        })
      );
    });

    it("phải từ chối khi token sai định dạng (không phải gwk_live_<64hex>) (401)", async () => {
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: {
          authorization: "Bearer invalid_token_12345",
        },
      });

      await expect(authenticateGpuWorker(req)).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 401,
          code: "UNAUTHORIZED",
          message: "Invalid GPU worker token format.",
        })
      );
    });

    it("phải từ chối khi token đúng định dạng nhưng không tồn tại trong DB (401)", async () => {
      const fakeToken = `gwk_live_${"f".repeat(64)}`;
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: {
          authorization: `Bearer ${fakeToken}`,
        },
      });

      await expect(authenticateGpuWorker(req)).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 401,
          code: "UNAUTHORIZED",
        })
      );
    });

    it("phải xác thực thành công khi token hợp lệ", async () => {
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: {
          authorization: `Bearer ${validRawToken}`,
        },
      });

      const worker = await authenticateGpuWorker(req);
      expect(worker.id).toBe(testWorkerId);
      expect(worker.name).toBe(testWorkerName);
    });
  });

  // --------------------------------------------------------------------------
  // 3. WORKER STATUS & REVOCATION CHECKS
  // --------------------------------------------------------------------------
  describe("3. Worker Disabled & Revoked Handling", () => {
    let disabledWorkerToken: string;
    let disabledWorkerId: string;

    beforeAll(async () => {
      const { rawToken, tokenHash } = generateWorkerToken();
      disabledWorkerToken = rawToken;

      const res = await pool.query<{ id: string }>(
        `INSERT INTO gpu_workers (
           name, token_hash, status, created_at, updated_at
         ) VALUES (
           'Test-Disabled-Worker', $1, 'disabled', NOW(), NOW()
         ) RETURNING id;`,
        [tokenHash]
      );
      disabledWorkerId = res.rows[0].id;
    });

    it("phải từ chối khi worker có status='disabled' (401)", async () => {
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: {
          authorization: `Bearer ${disabledWorkerToken}`,
        },
      });

      await expect(authenticateGpuWorker(req)).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 401,
          code: "UNAUTHORIZED",
          message: "GPU worker has been disabled or revoked.",
        })
      );
    });

    it("phải từ chối khi worker đã bị thu hồi (revoked_at IS NOT NULL) (401)", async () => {
      // Temporarily mark active worker as revoked
      await pool.query(
        `UPDATE gpu_workers SET revoked_at = NOW() WHERE id = $1;`,
        [disabledWorkerId]
      );

      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: {
          authorization: `Bearer ${disabledWorkerToken}`,
        },
      });

      await expect(authenticateGpuWorker(req)).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 401,
          code: "UNAUTHORIZED",
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. WORKER ID MISMATCH CHECK
  // --------------------------------------------------------------------------
  describe("4. Worker ID Mismatch Verification", () => {
    it("phải từ chối nếu worker_id trong body khác worker đã xác thực (403 WORKER_ID_MISMATCH)", () => {
      const fakeWorker = {
        id: testWorkerId,
        name: testWorkerName,
      } as any;

      const badBody = {
        worker_id: "00000000-0000-0000-0000-000000000999",
        task: "claim",
      };

      expect(() => validatePayloadWorkerId(badBody, fakeWorker)).toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: "WORKER_ID_MISMATCH",
        })
      );
    });

    it("phải chấp nhận nếu worker_id trong body trùng id hoặc trùng name của worker", () => {
      const worker = {
        id: testWorkerId,
        name: testWorkerName,
      } as any;

      expect(() => validatePayloadWorkerId({ worker_id: testWorkerId }, worker)).not.toThrow();
      expect(() => validatePayloadWorkerId({ worker_id: testWorkerName }, worker)).not.toThrow();
      expect(() => validatePayloadWorkerId({ other_field: "foo" }, worker)).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 5. PRODUCTION HTTPS REQUIREMENT
  // --------------------------------------------------------------------------
  describe("5. Production HTTPS Enforcement", () => {
    const originalEnv = process.env.NODE_ENV;

    afterAll(() => {
      (process.env as any).NODE_ENV = originalEnv;
    });

    it("phải từ chối HTTP thuần túy khi đang ở production (403 HTTPS_REQUIRED)", () => {
      (process.env as any).NODE_ENV = "production";

      const plainHttpReq = new NextRequest("http://api.tripc.vn/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: {
          "x-forwarded-proto": "http",
        },
      });

      expect(() => validateHttpsRequirement(plainHttpReq)).toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: "HTTPS_REQUIRED",
        })
      );
    });

    it("phải chấp nhận HTTPS khi đang ở production", () => {
      (process.env as any).NODE_ENV = "production";

      const httpsReq = new NextRequest("https://api.tripc.vn/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: {
          "x-forwarded-proto": "https",
        },
      });

      expect(() => validateHttpsRequirement(httpsReq)).not.toThrow();
    });

    it("cho phép HTTP trong môi trường development hoặc test", () => {
      (process.env as any).NODE_ENV = "development";

      const devReq = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
      });

      expect(() => validateHttpsRequirement(devReq)).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // 6. RATE LIMITING
  // --------------------------------------------------------------------------
  describe("6. GPU Worker Dedicated Rate Limiting", () => {
    it("phải chặn khi vượt quá số lượng request trong window (429 RATE_LIMIT_EXCEEDED)", () => {
      const limiter = new GpuWorkerRateLimiter(3, 5000); // 3 requests per 5s
      const workerId = "test-rate-worker-1";

      expect(limiter.check(workerId).allowed).toBe(true);
      expect(limiter.check(workerId).allowed).toBe(true);
      expect(limiter.check(workerId).allowed).toBe(true);

      const fourth = limiter.check(workerId);
      expect(fourth.allowed).toBe(false);
      expect(fourth.remaining).toBe(0);
      expect(fourth.resetMs).toBeGreaterThan(0);
    });

    it("requireGpuWorker phải throw 429 khi rate limit bị vi phạm", async () => {
      const restrictiveLimiter = new GpuWorkerRateLimiter(1, 10000);

      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: {
          authorization: `Bearer ${validRawToken}`,
        },
      });

      // 1st request succeeds
      await requireGpuWorker(req, { rateLimiter: restrictiveLimiter });

      // 2nd request throws 429
      await expect(
        requireGpuWorker(req, { rateLimiter: restrictiveLimiter })
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 429,
          code: "RATE_LIMIT_EXCEEDED",
        })
      );
    });
  });

  // --------------------------------------------------------------------------
  // 7. SECURITY: TOKEN NEVER APPEARS IN LOGS OR ERRORS
  // --------------------------------------------------------------------------
  describe("7. Zero-Token Leakage in Logs & Responses", () => {
    it("sanitizeLogString phải che giấu token gwk_live_", () => {
      const rawSecret = `gwk_live_${"a1b2c3d4e5f6".repeat(5)}1234`;
      const logMessage = `Worker failed to authenticate with token ${rawSecret} at gateway`;

      const sanitized = sanitizeLogString(logMessage);
      expect(sanitized).not.toContain(rawSecret);
      expect(sanitized).toContain("gwk_live_***[REDACTED]***");
    });

    it("handleWorkerError không bao giờ chứa chuỗi raw token trong message hay detail", () => {
      const rawSecret = `gwk_live_${"beef".repeat(16)}`;
      const leakedError = new AppError(
        400,
        "LEAK_TEST",
        `Database connection rejected for token ${rawSecret}`
      );

      const response = handleWorkerError(leakedError);
      return response.json().then((jsonBody: any) => {
        expect(JSON.stringify(jsonBody)).not.toContain(rawSecret);
        expect(jsonBody.error.message).toContain("gwk_live_***[REDACTED]***");
      });
    });
  });

  // --------------------------------------------------------------------------
  // 8. ISOLATED WORKER TRANSACTION & RLS CONTEXT
  // --------------------------------------------------------------------------
  describe("8. SET LOCAL app.is_worker_context in Transaction", () => {
    it("withWorkerTransaction phải kích hoạt app.is_worker_context = 'true' trong transaction", async () => {
      const dummyWorker = { id: testWorkerId, name: testWorkerName } as any;

      const contextSetting = await withWorkerTransaction(dummyWorker, async (client) => {
        const res = await client.query<{ val: string }>(
          `SELECT current_setting('app.is_worker_context', true) AS val;`
        );
        return res.rows[0].val;
      });

      expect(contextSetting).toBe("true");

      // Verify that after transaction ends, pool connection does not have context leaked
      const outsideRes = await pool.query<{ val: string | null }>(
        `SELECT current_setting('app.is_worker_context', true) AS val;`
      );
      expect(outsideRes.rows[0].val).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 9. SCRIPTS: CREATE & REVOKE GPU WORKER
  // --------------------------------------------------------------------------
  describe("9. Scripts: createGpuWorker and revokeGpuWorker", () => {
    let scriptCreatedToken: string;
    let scriptCreatedWorkerId: string;
    const scriptWorkerName = "Test-Script-Worker";

    it("createGpuWorker phải tạo worker và trả về token bí mật", async () => {
      const { worker, rawToken } = await createGpuWorker({
        name: scriptWorkerName,
        vramMb: 16384,
        modelKey: "sdxl_juggernaut_v9",
      });

      expect(worker.id).toBeDefined();
      expect(worker.name).toBe(scriptWorkerName);
      expect(worker.status).toBe("offline");
      expect(rawToken.startsWith(GPU_WORKER_TOKEN_PREFIX)).toBe(true);

      scriptCreatedWorkerId = worker.id;
      scriptCreatedToken = rawToken;

      // Verify worker can authenticate
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: {
          authorization: `Bearer ${scriptCreatedToken}`,
        },
      });
      const authWorker = await authenticateGpuWorker(req);
      expect(authWorker.id).toBe(scriptCreatedWorkerId);
    });

    it("revokeGpuWorker phải chuyển worker sang status='disabled' và set revoked_at", async () => {
      const revoked = await revokeGpuWorker(scriptCreatedWorkerId);
      expect(revoked).toBeDefined();
      expect(revoked!.status).toBe("disabled");
      expect(revoked!.revoked_at).toBeDefined();

      // Subsequent auth MUST fail with 401
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/gpu-worker/claim", {
        method: "POST",
        headers: {
          authorization: `Bearer ${scriptCreatedToken}`,
        },
      });

      await expect(authenticateGpuWorker(req)).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 401,
          code: "UNAUTHORIZED",
        })
      );
    });
  });
});
