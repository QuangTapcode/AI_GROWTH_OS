import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgres://ai_growth_dev:ae5a9cb1e19ca954422a6aca20206537f63c9e716a051c1f250bac717c74d4b9@127.0.0.1:15432/ai_growth_os";
}

import { Pool } from "pg";
import { NextRequest } from "next/server";
import { POST as createJobRoute } from "../../src/app/api/v1/image-jobs/route";
import { GET as getJobRoute } from "../../src/app/api/v1/image-jobs/[id]/route";
import { POST as cancelJobRoute } from "../../src/app/api/v1/image-jobs/[id]/cancel/route";
import { registerWorker } from "../../src/modules/gpuWorkers/repository";
import { hashWorkerToken } from "../../src/modules/gpuWorkers/auth";
import { ASPECT_PRESETS } from "../../src/modules/imageJobs/constants";

const RUN = process.env.RUN_DB_TESTS === "1";

const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "20000000-0000-4000-8000-000000000002";

const USER_OWNER_A = "11111111-0000-4000-8000-000000000001";
const USER_EDITOR_A = "11111111-0000-4000-8000-000000000002";
const USER_VIEWER_A = "11111111-0000-4000-8000-000000000003";
const USER_OWNER_B = "22222222-0000-4000-8000-000000000001";

const AUTOMATION_TOKEN = process.env.AUTOMATION_INTERNAL_TOKEN || "dev_internal_secret_token_123";

function makeAuthHeaders(userId: string, role: string, extra: Record<string, string> = {}) {
  return {
    authorization: `Bearer dev_user_${userId}_${role}`,
    "content-type": "application/json",
    ...extra,
  };
}

describe.skipIf(!RUN)("User-Facing Image Jobs API (Section 2.1)", () => {
  let pool: Pool;

  beforeAll(async () => {
    const connStr =
      process.env.DATABASE_URL ||
      "postgres://ai_growth_dev:ae5a9cb1e19ca954422a6aca20206537f63c9e716a051c1f250bac717c74d4b9@127.0.0.1:15432/ai_growth_os";
    pool = new Pool({ connectionString: connStr });

    // Seed test workspaces
    await pool.query(`
      INSERT INTO workspaces (id, name, slug)
      VALUES 
        ('${WORKSPACE_A}', 'Workspace A (TripC Test)', 'tripc-test-a'),
        ('${WORKSPACE_B}', 'Workspace B (TripC Test)', 'tripc-test-b')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed test users
    await pool.query(`
      INSERT INTO users (id, email, full_name)
      VALUES 
        ('${USER_OWNER_A}', 'owner_a@tripc.local', 'Owner A'),
        ('${USER_EDITOR_A}', 'editor_a@tripc.local', 'Editor A'),
        ('${USER_VIEWER_A}', 'viewer_a@tripc.local', 'Viewer A'),
        ('${USER_OWNER_B}', 'owner_b@tripc.local', 'Owner B')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed memberships
    await pool.query(`
      INSERT INTO memberships (id, user_id, workspace_id, role, status)
      VALUES 
        (gen_random_uuid(), '${USER_OWNER_A}', '${WORKSPACE_A}', 'owner', 'active'),
        (gen_random_uuid(), '${USER_EDITOR_A}', '${WORKSPACE_A}', 'editor', 'active'),
        (gen_random_uuid(), '${USER_VIEWER_A}', '${WORKSPACE_A}', 'viewer', 'active'),
        (gen_random_uuid(), '${USER_OWNER_B}', '${WORKSPACE_B}', 'owner', 'active')
      ON CONFLICT DO NOTHING;
    `);

    // Clean up test image jobs
    await pool.query(`DELETE FROM image_jobs WHERE owner LIKE '%test%' OR source_ref LIKE '%idempotency:%';`);
  });

  afterAll(async () => {
    if (pool) {
      await pool.query(`DELETE FROM image_jobs WHERE owner LIKE '%test%' OR source_ref LIKE '%idempotency:%';`);
      await pool.end();
    }
  });

  // --------------------------------------------------------------------------
  // 1. JOB CREATION (POST /api/v1/image-jobs)
  // --------------------------------------------------------------------------
  describe("1. Job Creation & Parameter Validation", () => {
    it("tạo job thành công với aspect_ratio 1:1 mặc định (1080x1080) và seed an toàn", async () => {
      const payload = {
        workspace_id: WORKSPACE_A,
        prompt: "A beautiful tropical boutique resort in Da Nang",
        negative_prompt: "blurry, low quality",
      };

      const req = new NextRequest("http://127.0.0.1:4000/api/v1/image-jobs", {
        method: "POST",
        headers: makeAuthHeaders(USER_OWNER_A, "owner"),
        body: JSON.stringify(payload),
      });

      const res = await createJobRoute(req);
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.job_id).toBeDefined();
      expect(data.root_job_id).toBe(data.job_id);
      expect(data.attempt).toBe(1);
      expect(data.status).toBe("queued");
      expect(data.aspect_ratio).toBe("1:1");
      expect(data.width).toBe(1080);
      expect(data.height).toBe(1080);
      expect(data.seed).toBeGreaterThan(0);
      expect(data.position_in_queue).toBeGreaterThanOrEqual(1);
      expect(typeof data.gpu_online).toBe("boolean");
    });

    it("tạo job với preset 9:16 và 16:9 đúng kích thước chuẩn", async () => {
      // 9:16
      const req916 = new NextRequest("http://127.0.0.1:4000/api/v1/image-jobs", {
        method: "POST",
        headers: makeAuthHeaders(USER_EDITOR_A, "editor"),
        body: JSON.stringify({
          workspace_id: WORKSPACE_A,
          prompt: "Vertical video background for TikTok",
          aspect_ratio: "9:16",
        }),
      });
      const res916 = await createJobRoute(req916);
      expect(res916.status).toBe(201);
      const data916 = await res916.json();
      expect(data916.width).toBe(ASPECT_PRESETS["9:16"].width);
      expect(data916.height).toBe(ASPECT_PRESETS["9:16"].height);

      // 16:9
      const req169 = new NextRequest("http://127.0.0.1:4000/api/v1/image-jobs", {
        method: "POST",
        headers: makeAuthHeaders(USER_EDITOR_A, "editor"),
        body: JSON.stringify({
          workspace_id: WORKSPACE_A,
          prompt: "Wide panoramic header banner",
          aspect_ratio: "16:9",
        }),
      });
      const res169 = await createJobRoute(req169);
      expect(res169.status).toBe(201);
      const data169 = await res169.json();
      expect(data169.width).toBe(ASPECT_PRESETS["16:9"].width);
      expect(data169.height).toBe(ASPECT_PRESETS["16:9"].height);
    });

    it("chấp nhận AUTOMATION_INTERNAL_TOKEN kèm workspace_id", async () => {
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/image-jobs", {
        method: "POST",
        headers: {
          authorization: `Bearer ${AUTOMATION_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: WORKSPACE_A,
          prompt: "Generated from background automated pipeline",
        }),
      });

      const res = await createJobRoute(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.job_id).toBeDefined();
    });

    it("từ chối AUTOMATION_INTERNAL_TOKEN nếu thiếu workspace_id (400)", async () => {
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/image-jobs", {
        method: "POST",
        headers: {
          authorization: `Bearer ${AUTOMATION_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prompt: "Missing workspace_id",
        }),
      });

      const res = await createJobRoute(req);
      expect(res.status).toBe(400);
      const err = await res.json();
      expect(err.error.code).toBe("WORKSPACE_ID_REQUIRED");
    });

    it("từ chối người dùng có role viewer (403 PERMISSION_DENIED)", async () => {
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/image-jobs", {
        method: "POST",
        headers: makeAuthHeaders(USER_VIEWER_A, "viewer"),
        body: JSON.stringify({
          workspace_id: WORKSPACE_A,
          prompt: "Viewer attempt to create job",
        }),
      });

      const res = await createJobRoute(req);
      expect(res.status).toBe(403);
      const err = await res.json();
      expect(err.error.code).toBe("PERMISSION_DENIED");
    });

    it("validation: từ chối prompt > 1000 ký tự (422)", async () => {
      const longPrompt = "a".repeat(1001);
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/image-jobs", {
        method: "POST",
        headers: makeAuthHeaders(USER_OWNER_A, "owner"),
        body: JSON.stringify({
          workspace_id: WORKSPACE_A,
          prompt: longPrompt,
        }),
      });

      const res = await createJobRoute(req);
      expect(res.status).toBe(422);
      const err = await res.json();
      expect(err.error.code).toBe("VALIDATION_FAILED");
      expect(err.error.field_errors?.prompt).toBeDefined();
    });

    it("validation: từ chối aspect_ratio không thuộc ASPECT_PRESETS (422)", async () => {
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/image-jobs", {
        method: "POST",
        headers: makeAuthHeaders(USER_OWNER_A, "owner"),
        body: JSON.stringify({
          workspace_id: WORKSPACE_A,
          prompt: "Invalid ratio test",
          aspect_ratio: "4:3",
        }),
      });

      const res = await createJobRoute(req);
      expect(res.status).toBe(422);
      const err = await res.json();
      expect(err.error.code).toBe("VALIDATION_FAILED");
      expect(err.error.field_errors?.aspect_ratio).toBeDefined();
    });

    it("validation: từ chối steps hoặc cfg_scale ngoài khoảng an toàn (422)", async () => {
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/image-jobs", {
        method: "POST",
        headers: makeAuthHeaders(USER_OWNER_A, "owner"),
        body: JSON.stringify({
          workspace_id: WORKSPACE_A,
          prompt: "Out of bounds steps",
          steps: 100, // max 50
          cfg_scale: 0.5, // min 1.0
        }),
      });

      const res = await createJobRoute(req);
      expect(res.status).toBe(422);
      const err = await res.json();
      expect(err.error.code).toBe("VALIDATION_FAILED");
      expect(err.error.field_errors?.steps).toBeDefined();
      expect(err.error.field_errors?.cfg_scale).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 2. IDEMPOTENCY KEY SUPPORT (2 lần cùng key = 1 job)
  // --------------------------------------------------------------------------
  describe("2. Idempotency-Key Support", () => {
    it("gửi 2 lần cùng Idempotency-Key trả về cùng 1 job_id duy nhất", async () => {
      const idempotencyKey = `idem_key_${Date.now()}_${randomUUID()}`;
      const payload = {
        workspace_id: WORKSPACE_A,
        prompt: "Unique idempotent test image concept",
      };

      // Request 1
      const req1 = new NextRequest("http://127.0.0.1:4000/api/v1/image-jobs", {
        method: "POST",
        headers: makeAuthHeaders(USER_OWNER_A, "owner", {
          "idempotency-key": idempotencyKey,
        }),
        body: JSON.stringify(payload),
      });
      const res1 = await createJobRoute(req1);
      expect(res1.status).toBe(201);
      const data1 = await res1.json();
      const createdJobId = data1.job_id;

      // Request 2 (identical key)
      const req2 = new NextRequest("http://127.0.0.1:4000/api/v1/image-jobs", {
        method: "POST",
        headers: makeAuthHeaders(USER_OWNER_A, "owner", {
          "idempotency-key": idempotencyKey,
        }),
        body: JSON.stringify(payload),
      });
      const res2 = await createJobRoute(req2);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();

      // Must be the exact same job ID
      expect(data2.job_id).toBe(createdJobId);

      // Verify in DB that only 1 record exists
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS count FROM image_jobs WHERE workspace_id = $1 AND request->>'idempotency_key' = $2;`,
        [WORKSPACE_A, idempotencyKey]
      );
      expect(countRes.rows[0].count).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // 3. GET IMAGE JOB (GET /api/v1/image-jobs/{id})
  // --------------------------------------------------------------------------
  describe("3. Get Image Job & Customer-Facing Status", () => {
    let testJobId: string;
    let testRootJobId: string;

    beforeAll(async () => {
      // Create initial attempt 1
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/image-jobs", {
        method: "POST",
        headers: makeAuthHeaders(USER_OWNER_A, "owner"),
        body: JSON.stringify({
          workspace_id: WORKSPACE_A,
          prompt: "Root job consolidation test",
        }),
      });
      const res = await createJobRoute(req);
      const data = await res.json();
      testJobId = data.job_id;
      testRootJobId = data.root_job_id;
    });

    it("gộp theo root_job_id và hiển thị attempt mới nhất", async () => {
      // Simulate that attempt 1 failed with price guardrail, and attempt 2 was scheduled under same root_job_id
      await pool.query(
        `UPDATE image_jobs SET status = 'failed', error_code = 'GUARDRAIL_PRICE_DETECTED' WHERE id = $1;`,
        [testJobId]
      );

      const attempt2Id = randomUUID();
      await pool.query(
        `INSERT INTO image_jobs (
           id, root_job_id, attempt, workspace_id, owner, status, request, queued_at, created_at, updated_at
         ) VALUES (
           $1, $2, 2, $3, 'system', 'queued', '{"prompt": "Retry attempt 2", "width": 1080, "height": 1080}'::jsonb, NOW(), NOW(), NOW()
         );`,
        [attempt2Id, testRootJobId, WORKSPACE_A]
      );

      // Query by original testJobId or testRootJobId
      const req = new NextRequest(`http://127.0.0.1:4000/api/v1/image-jobs/${testJobId}`, {
        method: "GET",
        headers: makeAuthHeaders(USER_VIEWER_A, "viewer"),
      });

      const res = await getJobRoute(req, { params: { id: testJobId } });
      expect(res.status).toBe(200);

      const data = await res.json();
      // Must consolidate to attempt 2
      expect(data.job_id).toBe(attempt2Id);
      expect(data.root_job_id).toBe(testRootJobId);
      expect(data.attempt).toBe(2);
      expect(data.status).toBe("queued");
      expect(data.customer_status).toBe("queued");
    });

    it("trả message 'đang chờ máy GPU' khi queued mà GPU offline", async () => {
      // Ensure no active workers in DB
      await pool.query(`UPDATE gpu_workers SET status = 'offline', last_seen_at = NOW() - INTERVAL '10 minutes';`);

      const req = new NextRequest(`http://127.0.0.1:4000/api/v1/image-jobs/${testJobId}`, {
        method: "GET",
        headers: makeAuthHeaders(USER_OWNER_A, "owner"),
      });

      const res = await getJobRoute(req, { params: { id: testJobId } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.gpu_online).toBe(false);
      expect(data.message.toLowerCase()).toContain("đang chờ máy gpu");
    });

    it("trả image_url và content_hash khi job hoàn thành (completed)", async () => {
      const completedJobId = randomUUID();
      const fakeSha = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
      await pool.query(
        `INSERT INTO image_jobs (
           id, root_job_id, attempt, workspace_id, owner, status, request,
           result_storage_key, result_sha256, completed_at, queued_at, created_at, updated_at
         ) VALUES (
           $1, $1, 1, $2, 'test_user', 'completed', '{"prompt": "Done job", "width": 1080, "height": 1080}'::jsonb,
           'generated/2026/11/11/sample.webp', $3, NOW(), NOW(), NOW(), NOW()
         );`,
        [completedJobId, WORKSPACE_A, fakeSha]
      );

      const req = new NextRequest(`http://127.0.0.1:4000/api/v1/image-jobs/${completedJobId}`, {
        method: "GET",
        headers: makeAuthHeaders(USER_OWNER_A, "owner"),
      });

      const res = await getJobRoute(req, { params: { id: completedJobId } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.status).toBe("completed");
      expect(data.customer_status).toBe("completed");
      expect(data.image_url).toBe("/uploads/generated/2026/11/11/sample.webp");
      expect(data.content_hash).toBe(fakeSha);
    });

    it("ánh xạ error_code thân thiện cho người dùng", async () => {
      const failedJobId = randomUUID();
      await pool.query(
        `INSERT INTO image_jobs (
           id, root_job_id, attempt, workspace_id, owner, status, request,
           error_code, error_message, queued_at, created_at, updated_at
         ) VALUES (
           $1, $1, 1, $2, 'test_user', 'failed', '{"prompt": "Price fail", "width": 1080, "height": 1080}'::jsonb,
           'GUARDRAIL_PRICE_DETECTED', 'Price pattern found', NOW(), NOW(), NOW()
         );`,
        [failedJobId, WORKSPACE_A]
      );

      const req = new NextRequest(`http://127.0.0.1:4000/api/v1/image-jobs/${failedJobId}`, {
        method: "GET",
        headers: makeAuthHeaders(USER_OWNER_A, "owner"),
      });

      const res = await getJobRoute(req, { params: { id: failedJobId } });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.customer_status).toBe("failed");
      expect(data.error_code).toBe("CONTENT_SAFETY_PRICE_DETECTED");
      expect(data.error_message).toContain("giá tiền");
    });
  });

  // --------------------------------------------------------------------------
  // 4. CANCEL IMAGE JOB (POST /api/v1/image-jobs/{id}/cancel)
  // --------------------------------------------------------------------------
  describe("4. Job Cancellation (Strictly When Queued)", () => {
    it("huỷ thành công job đang ở trạng thái queued", async () => {
      // Create job
      const req = new NextRequest("http://127.0.0.1:4000/api/v1/image-jobs", {
        method: "POST",
        headers: makeAuthHeaders(USER_OWNER_A, "owner"),
        body: JSON.stringify({
          workspace_id: WORKSPACE_A,
          prompt: "Job to be cancelled",
        }),
      });
      const res = await createJobRoute(req);
      const data = await res.json();
      const jobId = data.job_id;

      // Cancel job
      const cancelReq = new NextRequest(`http://127.0.0.1:4000/api/v1/image-jobs/${jobId}/cancel`, {
        method: "POST",
        headers: makeAuthHeaders(USER_OWNER_A, "owner"),
      });

      const cancelRes = await cancelJobRoute(cancelReq, { params: { id: jobId } });
      expect(cancelRes.status).toBe(200);

      const cancelData = await cancelRes.json();
      expect(cancelData.job_id).toBe(jobId);
      expect(cancelData.status).toBe("cancelled");
      expect(cancelData.cancelled_at).toBeDefined();

      // Check DB
      const dbCheck = await pool.query(`SELECT status FROM image_jobs WHERE id = $1;`, [jobId]);
      expect(dbCheck.rows[0].status).toBe("cancelled");
    });

    it("từ chối huỷ khi job đã running hoặc completed (400 CANNOT_CANCEL_JOB)", async () => {
      const runningJobId = randomUUID();
      await pool.query(
        `INSERT INTO image_jobs (
           id, root_job_id, attempt, workspace_id, owner, status, request, queued_at, created_at, updated_at
         ) VALUES (
           $1, $1, 1, $2, 'test_user', 'running', '{"prompt": "Running job"}'::jsonb, NOW(), NOW(), NOW()
         );`,
        [runningJobId, WORKSPACE_A]
      );

      const cancelReq = new NextRequest(`http://127.0.0.1:4000/api/v1/image-jobs/${runningJobId}/cancel`, {
        method: "POST",
        headers: makeAuthHeaders(USER_OWNER_A, "owner"),
      });

      const cancelRes = await cancelJobRoute(cancelReq, { params: { id: runningJobId } });
      expect(cancelRes.status).toBe(400);

      const err = await cancelRes.json();
      expect(err.error.code).toBe("CANNOT_CANCEL_JOB");
    });
  });

  // --------------------------------------------------------------------------
  // 5. CROSS-WORKSPACE ISOLATION (404 NOT FOUND)
  // --------------------------------------------------------------------------
  describe("5. Cross-Workspace Isolation & 404 Leaks Prevention", () => {
    let jobInA: string;

    beforeAll(async () => {
      const createRes = await pool.query<{ id: string }>(
        `INSERT INTO image_jobs (
           id, root_job_id, attempt, workspace_id, owner, status, request, queued_at, created_at, updated_at
         ) VALUES (
           gen_random_uuid(), gen_random_uuid(), 1, $1, 'user_a', 'queued', '{"prompt": "Secret in A"}'::jsonb, NOW(), NOW(), NOW()
         ) RETURNING id;`,
        [WORKSPACE_A]
      );
      jobInA = createRes.rows[0].id;
    });

    it("User thuộc Workspace B đọc job của Workspace A phải nhận 404 NOT_FOUND", async () => {
      const req = new NextRequest(`http://127.0.0.1:4000/api/v1/image-jobs/${jobInA}`, {
        method: "GET",
        headers: makeAuthHeaders(USER_OWNER_B, "owner"),
      });

      const res = await getJobRoute(req, { params: { id: jobInA } });
      expect(res.status).toBe(404);

      const err = await res.json();
      expect(err.error.code).toBe("NOT_FOUND");
    });

    it("User thuộc Workspace B huỷ job của Workspace A phải nhận 404 NOT_FOUND", async () => {
      const req = new NextRequest(`http://127.0.0.1:4000/api/v1/image-jobs/${jobInA}/cancel`, {
        method: "POST",
        headers: makeAuthHeaders(USER_OWNER_B, "owner"),
      });

      const res = await cancelJobRoute(req, { params: { id: jobInA } });
      expect(res.status).toBe(404);

      const err = await res.json();
      expect(err.error.code).toBe("NOT_FOUND");
    });
  });
});
