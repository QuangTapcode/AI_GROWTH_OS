import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { z } from "zod";
import crypto, { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import pool from "../../lib/db";
import { AppError } from "../../lib/errors";
import {
  requireGpuWorker,
  withWorkerTransaction,
  handleWorkerError,
} from "./auth";
import {
  claimNextJob,
  findImageJobById,
  findImageJobsByRootId,
  markRunning,
  markUploaded,
  failJob,
  retryJobAttempt,
} from "./repository";
import {
  GpuWorkerRow,
  ImageJobRow,
  ImageJobRequestPayload,
  JobNotFoundError,
  JobWorkerMismatchError,
  InvalidJobStateTransitionError,
} from "./models";
import {
  getUploadTargetProvider,
  verifyUploadToken,
  isValidWebpBuffer,
  writeUploadFileAtomic,
  generateStorageKey,
  validateStorageKeySafety,
  parseWebpDimensions,
  isDimensionWithinTolerance,
  getUploadRootDir,
  MIN_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES,
} from "./storage";
import { upsertMediaAsset } from "../mediaAssets/repository";

const GPU_WORKER_CLAIM_WAIT_SECONDS = parseInt(
  process.env.GPU_WORKER_CLAIM_WAIT_SECONDS || "20",
  10
);
const GPU_JOB_LEASE_SECONDS = parseInt(
  process.env.GPU_JOB_LEASE_SECONDS || "120",
  10
);
const GPU_JOB_MAX_ATTEMPTS = parseInt(
  process.env.GPU_JOB_MAX_ATTEMPTS || "3",
  10
);

export const ClaimJobSchema = z.object({
  worker_id: z.string().trim().optional(),
  supported_models: z.array(z.string()).optional(),
  vram_available_mb: z.number().int().positive().optional(),
  wait_seconds: z.coerce
    .number()
    .int()
    .min(0)
    .max(60)
    .optional()
    .default(20),
});

export const HeartbeatSchema = z.object({
  worker_id: z.string().trim().optional(),
  job_id: z.string().uuid("job_id must be a valid UUID"),
  step_current: z.number().int().min(0).optional(),
  step_total: z.number().int().min(1).optional(),
  gpu_temp_celsius: z.number().optional(),
  vram_used_mb: z.number().int().min(0).optional(),
});

/**
 * Service to handle POST /api/v1/gpu-worker/claim
 * Long-polling up to min(wait_seconds, GPU_WORKER_CLAIM_WAIT_SECONDS).
 * Retries claim every ~1.5s using short transactions, releasing DB connection between attempts.
 */
export async function claimGpuJobService(
  req: NextRequest,
  rawBody: any
): Promise<NextResponse> {
  const validated = ClaimJobSchema.parse(rawBody);

  // Authenticate GPU worker
  const { worker } = await requireGpuWorker(req, { body: validated });

  const maxWaitSeconds = Math.min(
    validated.wait_seconds,
    GPU_WORKER_CLAIM_WAIT_SECONDS
  );
  const timeoutMs = maxWaitSeconds * 1000;
  const pollIntervalMs = 1500;
  const startTime = Date.now();

  while (Date.now() - startTime <= timeoutMs) {
    // Early exit if client disconnected
    if (req.signal?.aborted) {
      break;
    }

    // Attempt claim in a short isolated transaction (releases client immediately)
    const claimedJob = await withWorkerTransaction(worker, async (client) => {
      return await claimNextJob(
        worker.id,
        validated.supported_models,
        GPU_JOB_LEASE_SECONDS,
        client
      );
    });

    if (claimedJob) {
      // Update worker telemetry to 'busy' with active_job_id
      await withWorkerTransaction(worker, async (client) => {
        await client.query(
          `UPDATE gpu_workers
           SET status = 'busy',
               active_job_id = $1,
               last_seen_at = NOW(),
               vram_free_mb = COALESCE($2, vram_free_mb),
               updated_at = NOW()
           WHERE id = $3;`,
          [claimedJob.id, validated.vram_available_mb ?? null, worker.id]
        );
      });

      return NextResponse.json(
        {
          job_id: claimedJob.id,
          root_job_id: claimedJob.root_job_id,
          attempt: claimedJob.attempt,
          model_key:
            claimedJob.request.model_key ||
            "a327ebf7-c854-4319-b160-00dbd6498427",
          prompt: claimedJob.request.prompt,
          negative_prompt: claimedJob.request.negative_prompt,
          aspect_ratio: claimedJob.request.aspect_ratio || "1:1",
          width: claimedJob.request.width,
          height: claimedJob.request.height,
          steps: claimedJob.request.steps ?? 30,
          cfg_scale: claimedJob.request.cfg_scale ?? 7.0,
          seed: claimedJob.request.seed,
          lease_seconds: GPU_JOB_LEASE_SECONDS,
          lease_expires_at: claimedJob.lease_expires_at,
        },
        { status: 200 }
      );
    }

    const elapsed = Date.now() - startTime;
    const remaining = timeoutMs - elapsed;
    if (remaining <= 0) {
      break;
    }

    // Sleep without holding any connection
    const sleepMs = Math.min(pollIntervalMs, remaining);
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }

  // No job available after polling window: update last_seen_at and return 204
  await withWorkerTransaction(worker, async (client) => {
    await client.query(
      `UPDATE gpu_workers
       SET status = 'online',
           last_seen_at = NOW(),
           vram_free_mb = COALESCE($1, vram_free_mb),
           updated_at = NOW()
       WHERE id = $2;`,
      [validated.vram_available_mb ?? null, worker.id]
    );
  });

  return new NextResponse(null, { status: 204 });
}

/**
 * Service to handle POST /api/v1/gpu-worker/heartbeat
 * Renews lease by GPU_JOB_LEASE_SECONDS.
 * Transitions claimed -> running on first heartbeat.
 * Updates hardware telemetry.
 * If job was cancelled or lost, returns HTTP 409 { status: "cancelled" | "lost" }.
 */
export async function heartbeatGpuJobService(
  req: NextRequest,
  rawBody: any
): Promise<NextResponse> {
  const validated = HeartbeatSchema.parse(rawBody);

  // Authenticate GPU worker
  const { worker } = await requireGpuWorker(req, { body: validated });

  return await withWorkerTransaction(worker, async (client) => {
    // 1. Lock and check job state
    const jobRes = await client.query<{
      id: string;
      status: string;
      claimed_by: string | null;
      lease_expires_at: string | null;
    }>(
      `SELECT id, status, claimed_by, lease_expires_at
       FROM image_jobs
       WHERE id = $1
       FOR UPDATE;`,
      [validated.job_id]
    );

    if (jobRes.rows.length === 0) {
      return NextResponse.json(
        {
          status: "lost",
          message: "Job not found or purged from database.",
        },
        { status: 409 }
      );
    }

    const job = jobRes.rows[0];

    // 2. Check if cancelled
    if (job.status === "cancelled") {
      return NextResponse.json(
        {
          status: "cancelled",
          message: "Job has been cancelled by user or system.",
        },
        { status: 409 }
      );
    }

    // 3. Verify worker ownership
    if (job.claimed_by !== worker.id) {
      return NextResponse.json(
        {
          status: "lost",
          message: `Job is claimed by another worker (${job.claimed_by || "none"}).`,
        },
        { status: 409 }
      );
    }

    // 4. Verify valid status for active execution
    if (job.status !== "claimed" && job.status !== "running") {
      return NextResponse.json(
        {
          status: "lost",
          message: `Job is in non-active status: '${job.status}'.`,
        },
        { status: 409 }
      );
    }

    // 5. Transition: first heartbeat on claimed switches to running; renew lease
    const updateRes = await client.query<{ lease_expires_at: string }>(
      `UPDATE image_jobs
       SET status = 'running',
           lease_expires_at = NOW() + ($1 || ' seconds')::interval,
           updated_at = NOW()
       WHERE id = $2
       RETURNING lease_expires_at;`,
      [GPU_JOB_LEASE_SECONDS, validated.job_id]
    );

    const newLeaseExpiresAt = updateRes.rows[0].lease_expires_at;

    // 6. Update worker telemetry
    await client.query(
      `UPDATE gpu_workers
       SET status = 'busy',
           active_job_id = $1,
           last_seen_at = NOW(),
           updated_at = NOW()
       WHERE id = $2;`,
      [validated.job_id, worker.id]
    );

    return NextResponse.json(
      {
        status: "renewed",
        lease_expires_at: newLeaseExpiresAt,
      },
      { status: 200 }
    );
  });
}

export const RequestUploadUrlSchema = z.object({
  worker_id: z.string().trim().optional(),
  job_id: z.string().uuid("job_id must be a valid UUID"),
  content_type: z.literal("image/webp", {
    errorMap: () => ({ message: "Only 'image/webp' is supported" }),
  }),
  byte_size: z
    .number()
    .int()
    .min(MIN_UPLOAD_BYTES, `Byte size must be at least ${MIN_UPLOAD_BYTES} bytes (1KB)`)
    .max(MAX_UPLOAD_BYTES, `Byte size cannot exceed ${MAX_UPLOAD_BYTES} bytes (10MB)`),
});

/**
 * Service to handle POST /api/v1/gpu-worker/upload-url
 * Worker requests a presigned / local proxy upload target after local render and OCR pass.
 * Strictly allowed only for jobs in 'claimed' or 'running' status owned by this worker.
 */
export async function requestUploadUrlService(
  req: NextRequest,
  rawBody: any
): Promise<NextResponse> {
  const validated = RequestUploadUrlSchema.parse(rawBody);

  // Authenticate GPU worker
  const { worker } = await requireGpuWorker(req, { body: validated });

  return await withWorkerTransaction(worker, async (client) => {
    // 1. Look up job
    const job = await findImageJobById(validated.job_id, client);
    if (!job) {
      throw new JobNotFoundError(validated.job_id);
    }

    // 2. Verify worker ownership
    if (job.claimed_by !== worker.id) {
      throw new JobWorkerMismatchError(job.id, job.claimed_by, worker.id);
    }

    // 3. Verify valid status: only 'claimed' or 'running' can request upload target
    if (job.status !== "claimed" && job.status !== "running") {
      throw new InvalidJobStateTransitionError(
        job.id,
        job.status,
        "upload-url",
        `Cannot request upload URL for job ${job.id} with status '${job.status}'. Only 'claimed' or 'running' jobs are allowed.`
      );
    }

    // 4. Create upload target from configured provider
    const provider = getUploadTargetProvider();
    const target = await provider.createUploadTarget(job, worker.id);

    return NextResponse.json(target, { status: 200 });
  });
}

/**
 * Service to handle PUT /api/v1/gpu-worker/upload-proxy?token=...
 * Receives raw binary WebP body, verifies HMAC token, checks magic bytes and size (1KB-10MB),
 * atomically writes file to /uploads/generated, and transitions job to 'uploaded'.
 */
export async function handleUploadProxyService(req: NextRequest): Promise<NextResponse> {
  // 1. Validate query token
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "Missing upload token query parameter (?token=...)"
    );
  }

  // 2. Cryptographically verify upload token
  const payload = verifyUploadToken(token);

  // 3. Validate Content-Type
  const contentType = (req.headers.get("content-type") || "").toLowerCase().trim();
  if (!contentType.startsWith("image/webp")) {
    throw new AppError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      `Unsupported Content-Type '${contentType || "none"}'. Expected 'image/webp'.`
    );
  }

  // 4. Read raw binary body
  let buffer: Buffer;
  try {
    const arrayBuffer = await req.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch (err: any) {
    throw new AppError(400, "INVALID_BODY", `Failed to read request body: ${err.message}`);
  }

  // 5. Validate byte size
  if (buffer.length < MIN_UPLOAD_BYTES) {
    throw new AppError(
      400,
      "PAYLOAD_TOO_SMALL",
      `File size is too small (${buffer.length} bytes). Minimum size is ${MIN_UPLOAD_BYTES} bytes (1KB).`
    );
  }
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new AppError(
      413,
      "PAYLOAD_TOO_LARGE",
      `File size exceeds maximum allowed limit of 10MB (${buffer.length} bytes).`
    );
  }

  // 6. Validate WebP magic bytes: RIFF....WEBP
  if (!isValidWebpBuffer(buffer)) {
    throw new AppError(
      400,
      "INVALID_WEBP_FORMAT",
      "Invalid WebP image: Magic bytes do not match RIFF...WEBP container."
    );
  }

  // 7. Atomically write file to disk using server-generated storage key
  const { sha256, byteSize } = await writeUploadFileAtomic(payload.storage_key, buffer);

  // 8. Update database: transition job to 'uploaded'
  await withWorkerTransaction({ id: payload.worker_id } as GpuWorkerRow, async (client) => {
    const job = await findImageJobById(payload.job_id, client);
    if (!job) {
      throw new JobNotFoundError(payload.job_id);
    }
    if (job.claimed_by !== payload.worker_id) {
      throw new JobWorkerMismatchError(job.id, job.claimed_by, payload.worker_id);
    }

    if (job.status !== "claimed" && job.status !== "running" && job.status !== "uploaded") {
      throw new InvalidJobStateTransitionError(
        job.id,
        job.status,
        "uploaded",
        `Cannot upload for job ${job.id} with status '${job.status}'.`
      );
    }

    if (job.status === "claimed") {
      await markRunning(job.id, payload.worker_id, client);
    }

    if (job.status === "claimed" || job.status === "running") {
      await markUploaded(
        job.id,
        payload.worker_id,
        { storage_key: payload.storage_key, sha256 },
        client
      );
    }
  });

  return NextResponse.json(
    {
      status: "uploaded",
      storage_key: payload.storage_key,
      byte_size: byteSize,
      sha256,
    },
    {
      status: 200,
      headers: {
        ETag: `"${sha256}"`,
      },
    }
  );
}

export const CompleteJobSchema = z.object({
  worker_id: z.string().trim().optional(),
  job_id: z.string().uuid("job_id must be a valid UUID"),
  storage_key: z.string().trim().optional(),
  content_hash: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/, "content_hash must be a 64-character hexadecimal SHA-256 string"),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  byte_size: z.number().int().positive().optional(),
  seed: z.number().int().optional(),
  cost_usd: z.number().optional().default(0.0),
  generation_time_ms: z.number().int().min(0).optional(),
  pre_guardrail: z
    .object({
      ocr_engine: z.string().optional(),
      passed: z.boolean(),
      detected_text: z.string().optional().default(""),
      detected_prices: z.array(z.any()).optional().default([]),
    })
    .passthrough()
    .optional(),
});

/**
 * Service to handle POST /api/v1/gpu-worker/complete
 * Sections 2.2 and 4.4: Cloud does NOT run OCR, but independently re-verifies binary integrity:
 * 1. Verifies worker ownership and job status (claimed/running/uploaded). If reassigned -> 409.
 * 2. Idempotent: 2nd call on already completed job returns same result without creating extra media_assets.
 * 3. Server derives storage_key, reads file on disk, validates: <= 10MB, RIFF...WEBP magic bytes,
 *    SHA-256 matches worker content_hash, image dimensions match requested preset within +-1.5%.
 * 4. Pre-guardrail check: pre_guardrail.passed must be true; report stored in guardrail_report.
 * 5. On any integrity failure: deletes file from disk and marks job failed with INTEGRITY_*.
 * 6. In ONE single atomic transaction: uploaded -> reviewing -> completed, creates media_assets,
 *    links to article_id/post_id if present, and returns { job_id, status: 'completed', media_asset_id, image_url }.
 */
export async function completeGpuJobService(
  req: NextRequest,
  rawBody: any
): Promise<NextResponse> {
  const validated = CompleteJobSchema.parse(rawBody);

  // 1. Authenticate GPU Worker
  const { worker } = await requireGpuWorker(req, { body: validated });

  // 2. Fetch existing job (with worker RLS context)
  const job = await withWorkerTransaction(worker, async (client) => {
    return await findImageJobById(validated.job_id, client);
  });

  if (!job) {
    throw new JobNotFoundError(validated.job_id);
  }

  // 3. Worker ownership check
  if (job.claimed_by !== worker.id) {
    return NextResponse.json(
      {
        status: "lost",
        message: `Job is claimed by or assigned to another worker (${job.claimed_by || "none"}).`,
      },
      { status: 409 }
    );
  }

  // 4. Idempotency check: if already completed, return existing result without re-inserting media_assets
  if (job.status === "completed") {
    const storageProvider = getUploadTargetProvider();
    const imageUrl = await storageProvider.getImageUrl(
      job.result_storage_key || generateStorageKey(job.id)
    );
    return NextResponse.json(
      {
        job_id: job.id,
        status: "completed",
        media_asset_id: job.media_asset_id,
        image_url: imageUrl,
      },
      { status: 200 }
    );
  }

  // 5. Check if cancelled or failed
  if (job.status === "cancelled") {
    return NextResponse.json(
      {
        status: "cancelled",
        message: "Job has been cancelled.",
      },
      { status: 409 }
    );
  }
  if (job.status === "failed") {
    return NextResponse.json(
      {
        status: "failed",
        message: `Job has failed: ${job.error_message || job.error_code || "Unknown error"}.`,
      },
      { status: 409 }
    );
  }

  // Allowed active source statuses: claimed, running, uploaded, reviewing
  if (
    job.status !== "claimed" &&
    job.status !== "running" &&
    job.status !== "uploaded" &&
    job.status !== "reviewing"
  ) {
    return NextResponse.json(
      {
        status: "lost",
        message: `Job is in non-active status '${job.status}'.`,
      },
      { status: 409 }
    );
  }

  const activeJob = job;
  const activeJobId = job.id;

  // 6. Server derives storage key (strictly ignores client-supplied value if different)
  const serverStorageKey = activeJob.result_storage_key || generateStorageKey(activeJobId);
  const storageProvider = getUploadTargetProvider();

  // Helper to handle integrity failure: deletes file if exists, transitions job to failed, throws AppError
  async function handleIntegrityFailure(errorCode: string, errorMessage: string): Promise<never> {
    try {
      await storageProvider.deleteObject(serverStorageKey);
    } catch {
      // Ignore delete error
    }

    await withWorkerTransaction(worker, async (client) => {
      await failJob(activeJobId, worker.id, errorCode, errorMessage, client);
      await client.query(
        `UPDATE gpu_workers
         SET status = 'online',
             active_job_id = NULL,
             last_seen_at = NOW(),
             updated_at = NOW()
         WHERE id = $1;`,
        [worker.id]
      );
    });

    throw new AppError(400, errorCode, errorMessage);
  }

  // 7. Pre-Guardrail Check: pre_guardrail.passed must be strictly true
  if (!validated.pre_guardrail || validated.pre_guardrail.passed !== true) {
    await handleIntegrityFailure(
      "INTEGRITY_GUARDRAIL_REJECTED",
      "Pre-guardrail OCR check was not passed or is missing from request."
    );
  }

  // 8. Read binary file from storage provider and check existence & size
  const fileBuffer = await storageProvider.getObject(serverStorageKey);
  if (!fileBuffer) {
    return await handleIntegrityFailure(
      "INTEGRITY_FILE_NOT_FOUND",
      `Uploaded image file not found at storage key: '${serverStorageKey}'.`
    );
  }

  if (fileBuffer.length > MAX_UPLOAD_BYTES) {
    await handleIntegrityFailure(
      "INTEGRITY_FILE_TOO_LARGE",
      `Image file size (${fileBuffer.length} bytes) exceeds maximum limit of 10MB (${MAX_UPLOAD_BYTES} bytes).`
    );
  }
  if (fileBuffer.length < MIN_UPLOAD_BYTES) {
    await handleIntegrityFailure(
      "INTEGRITY_FILE_TOO_SMALL",
      `Image file size (${fileBuffer.length} bytes) is below minimum required 1KB.`
    );
  }

  // 9. Read binary file and verify WebP magic bytes: RIFF....WEBP
  if (!isValidWebpBuffer(fileBuffer)) {
    await handleIntegrityFailure(
      "INTEGRITY_INVALID_MAGIC_BYTES",
      "File does not match WebP RIFF...WEBP signature container."
    );
  }

  // 10. Self-calculate SHA-256 and verify against content_hash reported by worker
  const calculatedHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  if (calculatedHash.toLowerCase() !== validated.content_hash.toLowerCase()) {
    await handleIntegrityFailure(
      "INTEGRITY_CHECKSUM_MISMATCH",
      `SHA-256 checksum mismatch. Server calculated '${calculatedHash}', but worker reported '${validated.content_hash}'.`
    );
  }

  // 11. Parse image dimensions from WebP header and check against preset +-1.5%
  const dimensions = parseWebpDimensions(fileBuffer);
  if (!dimensions) {
    await handleIntegrityFailure(
      "INTEGRITY_DIMENSIONS_INVALID",
      "Failed to parse WebP dimensions from image header."
    );
  }

  const expectedWidth = job.request.width || 1080;
  const expectedHeight = job.request.height || 1080;
  const isWidthValid = isDimensionWithinTolerance(dimensions!.width, expectedWidth, 1.5);
  const isHeightValid = isDimensionWithinTolerance(dimensions!.height, expectedHeight, 1.5);

  if (!isWidthValid || !isHeightValid) {
    await handleIntegrityFailure(
      "INTEGRITY_DIMENSIONS_MISMATCH",
      `Image dimensions (${dimensions!.width}x${dimensions!.height}) deviate by more than +-1.5% from expected preset (${expectedWidth}x${expectedHeight}).`
    );
  }

  // 12. Derive final public or signed image URL
  const imageUrl = await storageProvider.getImageUrl(serverStorageKey);

  return await withWorkerTransaction(worker, async (client) => {
    // A. Transition to 'reviewing'
    if (job.status === "claimed") {
      await markRunning(job.id, worker.id, client);
    }
    if (job.status === "claimed" || job.status === "running") {
      await markUploaded(
        job.id,
        worker.id,
        { storage_key: serverStorageKey, sha256: calculatedHash },
        client
      );
    }

    await client.query(
      `UPDATE image_jobs
       SET status = 'reviewing',
           result_storage_key = $2,
           result_sha256 = $3,
           guardrail_report = $4,
           updated_at = NOW()
       WHERE id = $1 AND claimed_by = $5;`,
      [
        job.id,
        serverStorageKey,
        calculatedHash,
        JSON.stringify(validated.pre_guardrail),
        worker.id,
      ]
    );

    // B. Create media_assets record idempotently
    const mediaAsset = await upsertMediaAsset(
      {
        workspace_id: job.workspace_id,
        source_type: "ai_generated",
        is_ai_generated: true,
        url: imageUrl,
        storage_key: serverStorageKey,
        prompt: job.request.prompt,
        model_name: job.request.model_name || "Juggernaut XL v9",
        seed: validated.seed ?? job.request.seed,
        cost_usd: 0.0,
        width: dimensions!.width,
        height: dimensions!.height,
        license: "Internal AI Generated",
        attribution: "TripC AI Growth OS",
        status: "approved",
        content_hash: calculatedHash,
        ai_metadata: {
          prompt: job.request.prompt,
          model_name: job.request.model_name || "Juggernaut XL v9",
          seed: validated.seed ?? job.request.seed,
          cost_usd: 0.0,
          provider: "gpu_worker",
          generation_time_ms: validated.generation_time_ms,
          pre_guardrail: validated.pre_guardrail,
          job_id: job.id,
          root_job_id: job.root_job_id,
        },
      },
      client
    );

    // C. Attach to post_id or article_id if present
    const targetContentId = job.request.article_id || job.request.post_id;
    if (targetContentId) {
      try {
        const contentCheck = await client.query(
          `SELECT id FROM contents WHERE id = $1 LIMIT 1;`,
          [targetContentId]
        );
        if (contentCheck.rows.length > 0) {
          await client.query(
            `INSERT INTO content_assets (id, content_id, asset_type, asset_url, created_at)
             VALUES ($1, $2, 'image', $3, NOW())
             ON CONFLICT (id) DO NOTHING;`,
            [randomUUID(), targetContentId, imageUrl]
          );
        }
      } catch {
        // Non-blocking content linkage
      }
    }

    // D. Complete the job
    await client.query(
      `UPDATE image_jobs
       SET status = 'completed',
           completed_at = NOW(),
           media_asset_id = $2,
           result_storage_key = $3,
           result_sha256 = $4,
           guardrail_report = $5,
           updated_at = NOW()
       WHERE id = $1 AND claimed_by = $6;`,
      [
        job.id,
        mediaAsset.id,
        serverStorageKey,
        calculatedHash,
        JSON.stringify(validated.pre_guardrail),
        worker.id,
      ]
    );

    // E. Free the worker (back to online, active_job_id = null)
    await client.query(
      `UPDATE gpu_workers
       SET status = 'online',
           active_job_id = NULL,
           last_seen_at = NOW(),
           updated_at = NOW()
       WHERE id = $1;`,
      [worker.id]
    );

    return NextResponse.json(
      {
        job_id: job.id,
        status: "completed",
        media_asset_id: mediaAsset.id,
        image_url: imageUrl,
      },
      { status: 200 }
    );
  });
}

const NON_RETRYABLE_ERROR_CODES = new Set([
  "MODEL_NOT_SUPPORTED",
  "OCR_UNAVAILABLE",
  "INVALID_REQUEST",
  "UNSUPPORTED_ASPECT_RATIO",
]);

/**
 * Strips previous compel weighting tokens for anti-text/price guardrails.
 * Regex targets: ((text|price tag|words|letters|numbers|watermark):[0-9.]+)
 */
export function stripCompelGuardrailTokens(negativePrompt: string): string {
  if (!negativePrompt) return "";
  return negativePrompt
    .replace(/\s*,?\s*\((text|price\s*tag|words|letters|numbers|watermark):[0-9.]+\)/gi, "")
    .replace(/^,\s*|,\s*$/g, "")
    .trim();
}

/**
 * Reinforces negative prompt with Compel syntax for SDXL.
 * Attempt 2 -> weight 1.3
 * Attempt 3 -> weight 1.5
 * Strips any existing compel tokens first to avoid duplicate stacking.
 */
export function reinforceNegativePromptForAttempt(
  baseNegativePrompt: string,
  targetAttempt: number
): string {
  const weight = targetAttempt === 2 ? 1.3 : 1.5;
  const compelTokens = `(text:${weight}), (price tag:${weight}), (words:${weight}), (letters:${weight}), (numbers:${weight}), (watermark:${weight})`;

  const cleanedBase = stripCompelGuardrailTokens(baseNegativePrompt);
  if (!cleanedBase) {
    return compelTokens;
  }
  return `${cleanedBase}, ${compelTokens}`;
}

export const FailJobSchema = z.object({
  worker_id: z.string().trim().optional(),
  job_id: z.string().uuid("job_id must be a valid UUID"),
  error_code: z.string().trim().min(1, "error_code is required"),
  error_message: z.string().trim().optional(),
  retryable: z.boolean().optional().default(false),
  details: z.record(z.any()).optional(),
});

/**
 * Service to handle POST /api/v1/gpu-worker/fail
 * Handles error reporting, guardrail violation tracking, and intelligent retry / child job creation:
 * 1. Authenticates worker & validates ownership.
 * 2. Idempotent: Repeated fail calls return existing failed/needs_assets status without creating duplicate child attempts.
 * 3. Cleans up any uploaded files on disk for the failed attempt.
 * 4. Checks retryable & attempt < GPU_JOB_MAX_ATTEMPTS:
 *    - If retryable: marks current record failed, creates child attempt (same root_job_id, attempt+1, queued, new seed, delivery_count=0).
 *    - ONLY GUARDRAIL_* errors reinforce negative prompt weight (attempt 2: 1.3, attempt 3: 1.5 without duplicate stacking).
 *    - Technical errors (e.g. OOM, timeout) only rotate seed, preserving negative prompt.
 * 5. If attempts exhausted (attempt >= GPU_JOB_MAX_ATTEMPTS):
 *    - GUARDRAIL_* -> transitions to needs_assets.
 *    - Technical error -> transitions to failed.
 * 6. Non-retryable errors (MODEL_NOT_SUPPORTED, OCR_UNAVAILABLE...) -> transition to failed immediately.
 * 7. Frees worker to online and returns { job_id, status, action, next_attempt }.
 */
export async function failGpuJobService(
  req: NextRequest,
  rawBody: any
): Promise<NextResponse> {
  const validated = FailJobSchema.parse(rawBody);

  // 1. Authenticate worker
  const { worker } = await requireGpuWorker(req, { body: validated });

  // 2. Fetch existing job (within worker transaction for RLS)
  const job = await withWorkerTransaction(worker, async (client) => {
    return await findImageJobById(validated.job_id, client);
  });

  if (!job) {
    throw new JobNotFoundError(validated.job_id);
  }

  // 3. Worker ownership check
  if (job.claimed_by && job.claimed_by !== worker.id) {
    return NextResponse.json(
      {
        status: "lost",
        message: `Job is claimed by or assigned to another worker (${job.claimed_by}).`,
      },
      { status: 409 }
    );
  }

  // 4. Idempotency check: if job is already marked failed or needs_assets
  if (job.status === "failed" || job.status === "needs_assets") {
    const siblings = await withWorkerTransaction(worker, async (client) => {
      return await findImageJobsByRootId(job.root_job_id, client);
    });
    const nextChild = siblings.find((j) => j.attempt === job.attempt + 1);

    if (nextChild) {
      return NextResponse.json(
        {
          job_id: job.id,
          status: "failed",
          action: "attempt_rescheduled",
          next_attempt: nextChild.attempt,
        },
        { status: 200 }
      );
    }

    if (job.status === "needs_assets") {
      return NextResponse.json(
        {
          job_id: job.id,
          status: "needs_assets",
          action: "needs_assets",
          next_attempt: null,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        job_id: job.id,
        status: "failed",
        action: "failed",
        next_attempt: null,
      },
      { status: 200 }
    );
  }

  // 5. Clean up any uploaded file on storage for this failed attempt
  const serverStorageKey = job.result_storage_key || generateStorageKey(job.id);
  try {
    const storageProvider = getUploadTargetProvider();
    await storageProvider.deleteObject(serverStorageKey);
  } catch {
    // Ignore cleanup errors
  }

  // 6. Determine classification and retryability
  const isGuardrailError = validated.error_code.toUpperCase().startsWith("GUARDRAIL_");
  const isNonRetryableCode = NON_RETRYABLE_ERROR_CODES.has(validated.error_code.toUpperCase());
  const isRetryable = validated.retryable === true && !isNonRetryableCode;

  const guardrailReport = isGuardrailError
    ? validated.details || (validated.error_message ? { error_message: validated.error_message } : { error_code: validated.error_code })
    : null;

  const canRetry = isRetryable && job.attempt < GPU_JOB_MAX_ATTEMPTS;

  return await withWorkerTransaction(worker, async (client) => {
    // A. Retryable and within attempt limit: reschedule next attempt
    if (canRetry) {
      // 1. Mark current attempt as failed
      await failJob(
        job.id,
        worker.id,
        validated.error_code,
        validated.error_message,
        { guardrailReport, targetStatus: "failed" },
        client
      );

      // 2. Prepare child attempt
      const nextAttempt = job.attempt + 1;
      const newSeed = Math.floor(Math.random() * 2147483647);
      let updatedNegativePrompt = job.request.negative_prompt;

      // ONLY GUARDRAIL_* errors reinforce negative prompt weight! Technical errors (OOM) only rotate seed.
      if (isGuardrailError) {
        updatedNegativePrompt = reinforceNegativePromptForAttempt(
          job.request.negative_prompt,
          nextAttempt
        );
      }

      const modifiedRequest: ImageJobRequestPayload = {
        ...job.request,
        seed: newSeed,
        negative_prompt: updatedNegativePrompt,
      };

      // 3. Create child record under the same root_job_id (queued, delivery_count=0)
      await retryJobAttempt(
        job.id,
        {
          newSeed,
          modifiedRequest,
        },
        client
      );

      // 4. Release worker to online
      await client.query(
        `UPDATE gpu_workers
         SET status = 'online',
             active_job_id = NULL,
             last_seen_at = NOW(),
             updated_at = NOW()
         WHERE id = $1;`,
        [worker.id]
      );

      return NextResponse.json(
        {
          job_id: job.id,
          status: "failed",
          action: "attempt_rescheduled",
          next_attempt: nextAttempt,
        },
        { status: 200 }
      );
    }

    // B. Attempts exhausted or non-retryable:
    // "Hết lượt: GUARDRAIL_* → needs_assets; lỗi kỹ thuật → failed. Không retryable → failed ngay."
    const targetStatus: "needs_assets" | "failed" =
      isGuardrailError && job.attempt >= GPU_JOB_MAX_ATTEMPTS
        ? "needs_assets"
        : "failed";

    await failJob(
      job.id,
      worker.id,
      validated.error_code,
      validated.error_message,
      { guardrailReport, targetStatus },
      client
    );

    // Release worker
    await client.query(
      `UPDATE gpu_workers
       SET status = 'online',
           active_job_id = NULL,
           last_seen_at = NOW(),
           updated_at = NOW()
       WHERE id = $1;`,
      [worker.id]
    );

    return NextResponse.json(
      {
        job_id: job.id,
        status: targetStatus,
        action: targetStatus === "needs_assets" ? "needs_assets" : "failed",
        next_attempt: null,
      },
      { status: 200 }
    );
  });
}



