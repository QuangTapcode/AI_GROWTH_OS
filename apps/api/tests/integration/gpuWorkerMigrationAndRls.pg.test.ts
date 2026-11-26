import { randomUUID, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool, PoolClient } from "pg";

const RUN = process.env.RUN_DB_TESTS === "1";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "20000000-0000-4000-8000-000000000002";

describe.skipIf(!RUN)("Migration 024: Schema, Idempotency & RLS Tenant Isolation", () => {
  let pool: Pool;

  beforeAll(async () => {
    const connStr =
      process.env.DATABASE_URL ||
      "postgres://ai_growth_dev:ae5a9cb1e19ca954422a6aca20206537f63c9e716a051c1f250bac717c74d4b9@127.0.0.1:15432/ai_growth_os";
    pool = new Pool({ connectionString: connStr });

    // Apply migration 024 DDL
    const migrationSqlPath = resolve(__dirname, "../../../../database/migrations/024_gpu_worker_and_image_jobs.sql");
    const migrationSql = readFileSync(migrationSqlPath, "utf-8").replace(/^\uFEFF/, "");
    await pool.query(migrationSql);

    // Ensure Workspace B exists in workspaces table for foreign key reference
    await pool.query(`
      INSERT INTO workspaces (id, name, slug)
      VALUES ($1, 'Workspace B for Testing', 'workspace-b-test')
      ON CONFLICT (id) DO NOTHING;
    `, [WORKSPACE_B]);

    // Ensure non-superuser test role exists to verify RLS enforcement
    await pool.query(`
      DO $$
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'test_app_user') THEN
              CREATE ROLE test_app_user NOBYPASSRLS;
          END IF;
          GRANT ALL ON ALL TABLES IN SCHEMA public TO test_app_user;
          GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO test_app_user;
          GRANT ALL ON SCHEMA public TO test_app_user;
      END $$;
    `);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it("1. Schema verification: tất cả các cột và index đều tồn tại đúng đặc tả", async () => {
    // Check columns of image_jobs
    const imgColumnsRes = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'image_jobs'
    `);
    const imgColumns = imgColumnsRes.rows.map((r) => r.column_name);

    const requiredImageCols = [
      "id", "root_job_id", "attempt", "delivery_count", "workspace_id", "owner",
      "source_ref", "status", "request", "claimed_by", "lease_expires_at",
      "queued_at", "claimed_at", "completed_at", "result_storage_key",
      "result_sha256", "provider_used", "error_code", "error_message",
      "media_asset_id", "created_at", "updated_at"
    ];
    for (const col of requiredImageCols) {
      expect(imgColumns).toContain(col);
    }

    // Check indexes on image_jobs
    const imgIndexesRes = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'image_jobs'
    `);
    const imgIndexes = imgIndexesRes.rows.map((r) => r.indexname);
    expect(imgIndexes).toContain("idx_image_jobs_status_queued_at");
    expect(imgIndexes).toContain("idx_image_jobs_lease_expires_at");

    // Check columns of gpu_workers
    const workerColumnsRes = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'gpu_workers'
    `);
    const workerColumns = workerColumnsRes.rows.map((r) => r.column_name);

    const requiredWorkerCols = [
      "id", "name", "token_hash", "status", "last_seen_at", "worker_version",
      "engine_version", "model_key", "vram_free_mb", "active_job_id",
      "revoked_at", "created_at", "updated_at"
    ];
    for (const col of requiredWorkerCols) {
      expect(workerColumns).toContain(col);
    }

    // Check media_assets R0 columns
    const mediaColumnsRes = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'media_assets'
    `);
    const mediaColumns = mediaColumnsRes.rows.map((r) => r.column_name);
    for (const col of ["storage_key", "prompt", "model_name", "seed", "cost_usd", "width", "height", "is_ai_generated"]) {
      expect(mediaColumns).toContain(col);
    }
  });

  it("2. RLS Tenant Isolation: Workspace A tuyệt đối không thấy job của Workspace B, và gpu_workers ẩn hoàn toàn với tenant", async () => {
    const client: PoolClient = await pool.connect();

    try {
      await client.query("BEGIN");

      const jobAId = randomUUID();
      const jobBId = randomUUID();
      const workerId = randomUUID();
      const workerHash = createHash("sha256").update("sec_" + Date.now()).digest("hex");

      // Insert Job A and Job B directly as admin
      await client.query(`
        INSERT INTO image_jobs (id, root_job_id, attempt, delivery_count, workspace_id, owner, request)
        VALUES ($1, $1, 1, 0, $2, 'tenant_a', '{"prompt": "Job in workspace A"}'::jsonb);
      `, [jobAId, WORKSPACE_A]);

      await client.query(`
        INSERT INTO image_jobs (id, root_job_id, attempt, delivery_count, workspace_id, owner, request)
        VALUES ($1, $1, 1, 0, $2, 'tenant_b', '{"prompt": "Job in workspace B"}'::jsonb);
      `, [jobBId, WORKSPACE_B]);

      // Insert Worker
      await client.query(`
        INSERT INTO gpu_workers (id, name, token_hash, status)
        VALUES ($1, 'Private Worker Node', $2, 'online');
      `, [workerId, workerHash]);

      // Switch to non-superuser role to enforce Row Level Security
      await client.query("SET ROLE test_app_user;");

      // --- SCENARIO 1: Tenant Context Workspace A ---
      await client.query(`SET LOCAL app.current_workspace_id = '${WORKSPACE_A}';`);
      await client.query(`SET LOCAL app.is_worker_context = 'false';`);

      const queryA = await client.query("SELECT id FROM image_jobs WHERE id IN ($1, $2)", [jobAId, jobBId]);
      expect(queryA.rows.length).toBe(1);
      expect(queryA.rows[0].id).toBe(jobAId); // Only Job A visible!

      // Worker table MUST return 0 rows for tenant
      const workerQueryA = await client.query("SELECT id FROM gpu_workers WHERE id = $1", [workerId]);
      expect(workerQueryA.rows.length).toBe(0);

      // --- SCENARIO 2: Tenant Context Workspace B ---
      await client.query(`SET LOCAL app.current_workspace_id = '${WORKSPACE_B}';`);
      await client.query(`SET LOCAL app.is_worker_context = 'false';`);

      const queryB = await client.query("SELECT id FROM image_jobs WHERE id IN ($1, $2)", [jobAId, jobBId]);
      expect(queryB.rows.length).toBe(1);
      expect(queryB.rows[0].id).toBe(jobBId); // Only Job B visible!

      const workerQueryB = await client.query("SELECT id FROM gpu_workers WHERE id = $1", [workerId]);
      expect(workerQueryB.rows.length).toBe(0);

      // --- SCENARIO 3: Worker Context (SET LOCAL app.is_worker_context = 'true') ---
      await client.query(`SET LOCAL app.current_workspace_id = '';`);
      await client.query(`SET LOCAL app.is_worker_context = 'true';`);

      const queryWorker = await client.query("SELECT id FROM image_jobs WHERE id IN ($1, $2) ORDER BY id", [jobAId, jobBId]);
      expect(queryWorker.rows.length).toBe(2); // Both jobs visible for cross-tenant processing!

      const workerSelfQuery = await client.query("SELECT id FROM gpu_workers WHERE id = $1", [workerId]);
      expect(workerSelfQuery.rows.length).toBe(1); // Worker is visible in worker context!

      await client.query("RESET ROLE;");
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("3. Trigger updated_at: tự động cập nhật timestamp khi có thay đổi trên image_jobs và gpu_workers", async () => {
    const client: PoolClient = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query(`SET LOCAL app.is_worker_context = 'true';`);

      const jobId = randomUUID();
      const workerId = randomUUID();
      const tokenHash = createHash("sha256").update("trg_" + Date.now()).digest("hex");

      await client.query(`
        INSERT INTO image_jobs (id, root_job_id, attempt, delivery_count, workspace_id, owner, request, updated_at)
        VALUES ($1, $1, 1, 0, $2, 'owner', '{"prompt": "test"}'::jsonb, NOW() - INTERVAL '1 hour');
      `, [jobId, WORKSPACE_A]);

      await client.query(`
        INSERT INTO gpu_workers (id, name, token_hash, status, updated_at)
        VALUES ($1, 'Worker Trigger', $2, 'offline', NOW() - INTERVAL '1 hour');
      `, [workerId, tokenHash]);

      const beforeJob = await client.query("SELECT updated_at FROM image_jobs WHERE id = $1", [jobId]);
      const beforeWorker = await client.query("SELECT updated_at FROM gpu_workers WHERE id = $1", [workerId]);

      // Perform updates
      await client.query("UPDATE image_jobs SET status = 'claimed' WHERE id = $1", [jobId]);
      await client.query("UPDATE gpu_workers SET status = 'online' WHERE id = $1", [workerId]);

      const afterJob = await client.query("SELECT updated_at FROM image_jobs WHERE id = $1", [jobId]);
      const afterWorker = await client.query("SELECT updated_at FROM gpu_workers WHERE id = $1", [workerId]);

      expect(new Date(afterJob.rows[0].updated_at).getTime()).toBeGreaterThan(
        new Date(beforeJob.rows[0].updated_at).getTime()
      );
      expect(new Date(afterWorker.rows[0].updated_at).getTime()).toBeGreaterThan(
        new Date(beforeWorker.rows[0].updated_at).getTime()
      );

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
