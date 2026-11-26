import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool from "../../lib/db";
import { AppError, createErrorResponse } from "../../lib/errors";
import { GpuWorkerRow } from "./models";

export const GPU_WORKER_TOKEN_PREFIX = "gwk_live_";
export const GPU_WORKER_TOKEN_REGEX = /^gwk_live_[0-9a-fA-F]{64}$/;

/**
 * Sanitizes any raw GPU worker tokens from log messages or error strings.
 */
export function sanitizeLogString(str: string): string {
  if (!str) return str;
  return str.replace(/gwk_live_[0-9a-fA-F]+/g, "gwk_live_***[REDACTED]***");
}

/**
 * Generates a cryptographically secure GPU Worker token.
 * Token format: gwk_live_<32 random bytes as hex> (total 73 chars).
 * Returns both rawToken (shown once to administrator) and tokenHash (stored in DB).
 */
export function generateWorkerToken(): { rawToken: string; tokenHash: string } {
  const hexPart = randomBytes(32).toString("hex");
  const rawToken = `${GPU_WORKER_TOKEN_PREFIX}${hexPart}`;
  const tokenHash = hashWorkerToken(rawToken);
  return { rawToken, tokenHash };
}

/**
 * Computes SHA-256 hash in hex format for a worker token.
 */
export function hashWorkerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Compares two token hashes in constant time to prevent timing attacks.
 */
export function verifyTokenHashConstantTime(incomingHash: string, storedHash: string): boolean {
  try {
    const incBuf = Buffer.from(incomingHash, "hex");
    const stoBuf = Buffer.from(storedHash, "hex");
    if (incBuf.length !== stoBuf.length || incBuf.length !== 32) {
      return false;
    }
    return timingSafeEqual(incBuf, stoBuf);
  } catch {
    return false;
  }
}

/**
 * Sliding-window in-memory rate limiter per GPU worker.
 */
export class GpuWorkerRateLimiter {
  private tracker = new Map<string, number[]>();

  constructor(
    public readonly maxRequestsPerWindow: number = 120,
    public readonly windowMs: number = 60000
  ) {}

  check(workerId: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const history = (this.tracker.get(workerId) || []).filter((t) => t > cutoff);

    if (history.length >= this.maxRequestsPerWindow) {
      const oldest = history[0] || now;
      const resetMs = Math.max(0, oldest + this.windowMs - now);
      this.tracker.set(workerId, history);
      return { allowed: false, remaining: 0, resetMs };
    }

    history.push(now);
    this.tracker.set(workerId, history);
    return {
      allowed: true,
      remaining: this.maxRequestsPerWindow - history.length,
      resetMs: this.windowMs,
    };
  }

  reset(workerId?: string): void {
    if (workerId) {
      this.tracker.delete(workerId);
    } else {
      this.tracker.clear();
    }
  }
}

export const defaultGpuWorkerRateLimiter = new GpuWorkerRateLimiter(
  parseInt(process.env.GPU_WORKER_RATE_LIMIT_PER_MINUTE || "120", 10),
  60000
);

/**
 * Validates HTTPS in production environment.
 */
export function validateHttpsRequirement(req: NextRequest): void {
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) return;

  const proto =
    req.headers.get("x-forwarded-proto") ||
    (req.nextUrl && req.nextUrl.protocol ? req.nextUrl.protocol.replace(":", "") : "http");

  if (proto !== "https") {
    throw new AppError(
      403,
      "HTTPS_REQUIRED",
      "HTTPS is strictly required in production for GPU worker endpoints."
    );
  }
}

/**
 * Look up worker by token hash with worker context enabled in RLS.
 */
export async function findWorkerByTokenHashWithContext(
  tokenHash: string,
  client?: PoolClient
): Promise<GpuWorkerRow | null> {
  const sql = `
    SELECT id, name, token_hash, status, last_seen_at, worker_version,
           engine_version, model_key, vram_free_mb, active_job_id,
           revoked_at, created_at, updated_at
    FROM gpu_workers
    WHERE token_hash = $1
    LIMIT 1;
  `;

  if (client) {
    await client.query("SET LOCAL app.is_worker_context = 'true'");
    const res = await client.query<GpuWorkerRow>(sql, [tokenHash]);
    return res.rows[0] || null;
  }

  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    await conn.query("SET LOCAL app.is_worker_context = 'true'");
    const res = await conn.query<GpuWorkerRow>(sql, [tokenHash]);
    await conn.query("COMMIT");
    return res.rows[0] || null;
  } catch (err) {
    await conn.query("ROLLBACK");
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Authenticates a GPU Worker request.
 * - Extracts `Authorization: Bearer gwk_live_<hex>`
 * - Computes SHA-256 hash
 * - Queries worker record from DB
 * - Verifies timingSafeEqual
 * - Checks status !== 'disabled' and revoked_at IS NULL
 * - Returns authenticated GpuWorkerRow
 */
export async function authenticateGpuWorker(
  req: NextRequest,
  client?: PoolClient
): Promise<GpuWorkerRow> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "Missing or invalid Authorization header. Expected Bearer token."
    );
  }

  const rawToken = authHeader.substring(7).trim();
  if (!rawToken) {
    throw new AppError(401, "UNAUTHORIZED", "Empty authentication token.");
  }

  if (!GPU_WORKER_TOKEN_REGEX.test(rawToken)) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid GPU worker token format.");
  }

  const computedHash = hashWorkerToken(rawToken);
  const worker = await findWorkerByTokenHashWithContext(computedHash, client);

  if (!worker) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid GPU worker credentials.");
  }

  if (!verifyTokenHashConstantTime(computedHash, worker.token_hash)) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid GPU worker credentials.");
  }

  if (worker.status === "disabled" || worker.revoked_at !== null) {
    throw new AppError(
      401,
      "UNAUTHORIZED",
      "GPU worker has been disabled or revoked."
    );
  }

  return worker;
}

/**
 * Validates that body.worker_id (if present) matches the authenticated worker.
 */
export function validatePayloadWorkerId(body: any, worker: GpuWorkerRow): void {
  if (!body || typeof body !== "object") return;
  const payloadWorkerId = body.worker_id;
  if (!payloadWorkerId) return;

  const matchesId = String(payloadWorkerId).toLowerCase() === String(worker.id).toLowerCase();
  const matchesName = String(payloadWorkerId).trim() === String(worker.name).trim();

  if (!matchesId && !matchesName) {
    throw new AppError(
      403,
      "WORKER_ID_MISMATCH",
      `Payload worker_id '${payloadWorkerId}' does not match authenticated worker credentials.`
    );
  }
}

export interface GpuWorkerAuthResult {
  worker: GpuWorkerRow;
  validatePayloadWorkerId: (body: any) => void;
}

/**
 * Middleware function for /api/v1/gpu-worker/* routes:
 * 1. Checks HTTPS requirement in production
 * 2. Authenticates worker credentials via Bearer token
 * 3. Enforces worker-specific rate limit
 * 4. Verifies worker_id in body if body provided
 */
export async function requireGpuWorker(
  req: NextRequest,
  options?: {
    body?: any;
    client?: PoolClient;
    rateLimiter?: GpuWorkerRateLimiter;
  }
): Promise<GpuWorkerAuthResult> {
  // 1. Enforce HTTPS in production
  validateHttpsRequirement(req);

  // 2. Authenticate worker
  const worker = await authenticateGpuWorker(req, options?.client);

  // 3. Enforce rate limit
  const rateLimiter = options?.rateLimiter || defaultGpuWorkerRateLimiter;
  const rateResult = rateLimiter.check(worker.id);
  if (!rateResult.allowed) {
    throw new AppError(
      429,
      "RATE_LIMIT_EXCEEDED",
      `Rate limit exceeded for GPU worker ${worker.name}. Please retry after ${Math.ceil(
        rateResult.resetMs / 1000
      )}s.`
    );
  }

  // 4. Validate body worker_id if provided
  if (options?.body) {
    validatePayloadWorkerId(options.body, worker);
  }

  return {
    worker,
    validatePayloadWorkerId: (body: any) => validatePayloadWorkerId(body, worker),
  };
}

/**
 * Executes a callback within a dedicated PostgreSQL transaction with
 * `SET LOCAL app.is_worker_context = 'true'` strictly scoped to that transaction.
 */
export async function withWorkerTransaction<T>(
  worker: GpuWorkerRow,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.is_worker_context = 'true'");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Safe error handler for GPU worker routes:
 * Guarantees tokens are never leaked into response error messages or logging.
 */
export function handleWorkerError(err: unknown): NextResponse {
  if (err instanceof AppError) {
    const safeMessage = sanitizeLogString(err.message);
    return createErrorResponse(
      err.statusCode,
      err.code,
      safeMessage,
      err.fieldErrors,
      err.detail
    );
  }

  const message = err instanceof Error ? sanitizeLogString(err.message) : "Internal Server Error";
  return createErrorResponse(500, "INTERNAL_SERVER_ERROR", message);
}

