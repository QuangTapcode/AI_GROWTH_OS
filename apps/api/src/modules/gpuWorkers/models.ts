import { AppError } from "../../lib/errors";

/**
 * Model definitions for Reverse-Connecting GPU Workers and Image Jobs.
 */

export type GpuWorkerStatus = "online" | "busy" | "offline" | "disabled";

export interface GpuWorkerRow {
  id: string;
  name: string;
  token_hash: string;
  status: GpuWorkerStatus;
  last_seen_at: string | null;
  worker_version: string | null;
  engine_version: string | null;
  model_key: string | null;
  vram_free_mb: number | null;
  active_job_id: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegisterWorkerInput {
  id?: string;
  name: string;
  token_hash: string;
  status?: GpuWorkerStatus;
  worker_version?: string;
  engine_version?: string;
  model_key?: string;
  vram_free_mb?: number;
}

export type ImageJobStatus =
  | "queued"
  | "claimed"
  | "running"
  | "uploaded"
  | "reviewing"
  | "completed"
  | "failed"
  | "needs_assets"
  | "cancelled";

/**
 * Central State Machine Transition Table for Image Jobs.
 * Defines strictly allowed (source -> target) transitions.
 */
export const VALID_JOB_TRANSITIONS: Record<ImageJobStatus, readonly ImageJobStatus[]> = {
  queued: ["claimed", "cancelled", "needs_assets"],
  claimed: ["running", "failed", "cancelled", "queued", "needs_assets"],
  running: ["uploaded", "failed", "queued", "needs_assets"],
  uploaded: ["reviewing", "completed", "failed", "needs_assets"],
  reviewing: ["completed", "failed", "needs_assets"],
  completed: [],
  failed: [],
  needs_assets: [],
  cancelled: [],
} as const;

export function canTransitionJob(current: ImageJobStatus, target: ImageJobStatus): boolean {
  const allowed = VALID_JOB_TRANSITIONS[current];
  return allowed ? allowed.includes(target) : false;
}

/**
 * Typed errors for state transitions and worker ownership violations.
 */
export class InvalidJobStateTransitionError extends AppError {
  constructor(
    public readonly jobId: string,
    public readonly currentStatus: string,
    public readonly targetStatus: string,
    customMessage?: string
  ) {
    super(
      400,
      "INVALID_JOB_STATE_TRANSITION",
      customMessage ||
        `Cannot transition job ${jobId} from status '${currentStatus}' to '${targetStatus}'. Allowed: [${(
          VALID_JOB_TRANSITIONS[currentStatus as ImageJobStatus] || []
        ).join(", ")}]`,
      undefined,
      { jobId, currentStatus, targetStatus }
    );
    this.name = "InvalidJobStateTransitionError";
  }
}

export class JobNotFoundError extends AppError {
  constructor(public readonly jobId: string) {
    super(404, "JOB_NOT_FOUND", `Image job ${jobId} not found.`);
    this.name = "JobNotFoundError";
  }
}

export class JobWorkerMismatchError extends AppError {
  constructor(
    public readonly jobId: string,
    public readonly claimedBy: string | null,
    public readonly attemptedBy: string
  ) {
    super(
      403,
      "JOB_WORKER_MISMATCH",
      `Job ${jobId} is claimed by worker ${claimedBy || "none"}, but worker ${attemptedBy} attempted to modify it.`,
      undefined,
      { jobId, claimedBy, attemptedBy }
    );
    this.name = "JobWorkerMismatchError";
  }
}

export interface ImageJobRequestPayload {
  prompt: string;
  negative_prompt: string;
  width: number;
  height: number;
  seed: number;
  steps?: number;
  cfg_scale?: number;
  scheduler?: string;
  model_key?: string;
  model_name?: string;
  [key: string]: any;
}

export interface ImageJobRow {
  id: string;
  root_job_id: string;
  attempt: number;
  delivery_count: number;
  workspace_id: string;
  owner: string;
  source_ref: string | null;
  status: ImageJobStatus;
  request: ImageJobRequestPayload;
  claimed_by: string | null;
  lease_expires_at: string | null;
  queued_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  result_storage_key: string | null;
  result_sha256: string | null;
  provider_used: string;
  guardrail_report?: Record<string, any> | null;
  error_code: string | null;
  error_message: string | null;
  media_asset_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateImageJobInput {
  id?: string;
  root_job_id?: string;
  attempt?: number;
  workspace_id: string;
  owner: string;
  source_ref?: string | null;
  request: ImageJobRequestPayload;
  provider_used?: string;
}

export type GpuOfflinePolicy = "queue_wait" | "reject" | "fallback_flux";

export interface GpuRecoveryOptions {
  maxDeliveries?: number;
  offlineAfterSeconds?: number;
  queueTtlSeconds?: number;
  offlinePolicy?: GpuOfflinePolicy;
  maxAgeSeconds?: number;
  referenceTime?: Date;
}

export interface GpuRecoveryScanResult {
  requeuedLeases: string[];
  failedPoisonJobs: string[];
  offlineWorkers: string[];
  cleanedCurrentJobs: string[];
  rejectedTtlJobs: string[];
  maxAgeExceededJobs: string[];
  overdueQueuedJobs: string[];
}

