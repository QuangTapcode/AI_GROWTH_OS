import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError } from "../../lib/errors";
import { ImageJobRow } from "./models";

/**
 * Upload target descriptor returned to workers.
 */
export interface UploadTarget {
  storage_key: string;
  upload_url: string;
  http_method: "PUT" | "POST";
  required_headers: Record<string, string>;
  expires_in_seconds: number;
}

/**
 * Storage provider interface for uploading generated AI images.
 * Decouples upload URL generation from local proxy or Cloudflare R2 / AWS S3 presigned PUT.
 */
export interface UploadTargetProvider {
  readonly name: string;
  createUploadTarget(job: ImageJobRow, workerId?: string): Promise<UploadTarget>;
  getObject(storageKey: string): Promise<Buffer | null>;
  deleteObject(storageKey: string): Promise<void>;
  getImageUrl(storageKey: string): Promise<string>;
}

export interface UploadTokenPayload {
  job_id: string;
  worker_id: string;
  storage_key: string;
  exp: number; // Unix timestamp in seconds
}

export const MIN_UPLOAD_BYTES = 1024; // 1 KB
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
export const UPLOAD_TOKEN_EXPIRY_SECONDS = 300; // 5 minutes
export const VALID_STORAGE_KEY_REGEX =
  /^generated\/\d{4}\/\d{2}\/\d{2}\/asset_[a-zA-Z0-9_-]+\.webp$/;

/**
 * Resolves the root directory for uploads.
 * Prioritizes STORAGE_LOCAL_DIR or UPLOAD_DIR environment variables,
 * falling back to `<cwd>/public/uploads` or `<cwd>/apps/api/public/uploads`.
 */
export function getUploadRootDir(): string {
  if (process.env.STORAGE_LOCAL_DIR) {
    return path.resolve(process.env.STORAGE_LOCAL_DIR);
  }
  if (process.env.UPLOAD_DIR) {
    return path.resolve(process.env.UPLOAD_DIR);
  }

  const inCwd = path.resolve(process.cwd(), "public/uploads");
  const inAppsApi = path.resolve(process.cwd(), "apps/api/public/uploads");

  if (fs.existsSync(inAppsApi)) {
    return inAppsApi;
  }
  return inCwd;
}

/**
 * Generates an immutable, server-controlled storage key.
 * Format: generated/YYYY/MM/DD/asset_<job_id>.webp
 * Strictly never relies on client input to prevent path traversal.
 */
export function generateStorageKey(jobId: string, extension: string = "webp"): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const ext = extension.replace(/^\./, "");
  return `generated/${yyyy}/${mm}/${dd}/asset_${jobId}.${ext}`;
}

/**
 * Retrieves the secret key used for signing upload proxy HMAC tokens.
 */
export function getUploadHmacSecret(): string {
  const secret =
    process.env.UPLOAD_HMAC_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new AppError(
        500,
        "MISSING_SECRET",
        "UPLOAD_HMAC_SECRET or AUTH_SECRET is required in production"
      );
    }
    return "dev_upload_hmac_secret_key_32_bytes_min_length!";
  }
  return secret;
}

/**
 * Generates a short-term HMAC token (300s) binding job_id, worker_id, and storage_key.
 */
export function generateUploadToken(
  payload: { job_id: string; worker_id: string; storage_key: string },
  expiresInSeconds: number = UPLOAD_TOKEN_EXPIRY_SECONDS
): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const rawPayload: UploadTokenPayload = {
    job_id: payload.job_id,
    worker_id: payload.worker_id,
    storage_key: payload.storage_key,
    exp,
  };
  const jsonStr = JSON.stringify(rawPayload);
  const dataB64 = Buffer.from(jsonStr, "utf8").toString("base64url");
  const secret = getUploadHmacSecret();
  const signature = crypto
    .createHmac("sha256", secret)
    .update(dataB64)
    .digest("base64url");
  return `${dataB64}.${signature}`;
}

/**
 * Cryptographically verifies an upload token.
 * Uses timingSafeEqual to prevent timing attacks.
 */
export function verifyUploadToken(token: string): UploadTokenPayload {
  if (!token || typeof token !== "string") {
    throw new AppError(401, "UNAUTHORIZED", "Missing upload token");
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new AppError(401, "UNAUTHORIZED", "Malformed upload token format");
  }

  const [dataB64, providedSig] = parts;
  const secret = getUploadHmacSecret();
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(dataB64)
    .digest("base64url");

  const providedBuf = Buffer.from(providedSig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");

  if (
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(providedBuf, expectedBuf)
  ) {
    throw new AppError(401, "UNAUTHORIZED", "Invalid upload token signature");
  }

  let payload: UploadTokenPayload;
  try {
    const jsonStr = Buffer.from(dataB64, "base64url").toString("utf8");
    payload = JSON.parse(jsonStr);
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Invalid upload token payload");
  }

  if (!payload.job_id || !payload.worker_id || !payload.storage_key || !payload.exp) {
    throw new AppError(401, "UNAUTHORIZED", "Incomplete upload token payload");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec > payload.exp) {
    throw new AppError(401, "TOKEN_EXPIRED", "Upload token has expired");
  }

  return payload;
}

/**
 * Validates WebP magic bytes: RIFF....WEBP
 * Bytes 0-3: 'RIFF', Bytes 8-11: 'WEBP'
 */
export function isValidWebpBuffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 12) return false;
  const riff = buffer.subarray(0, 4).toString("ascii");
  const webp = buffer.subarray(8, 12).toString("ascii");
  return riff === "RIFF" && webp === "WEBP";
}

/**
 * Parses image width and height from a WebP buffer without external native dependencies.
 * Supports VP8 (lossy), VP8L (lossless), and VP8X (extended) containers.
 */
export function parseWebpDimensions(
  buffer: Buffer
): { width: number; height: number } | null {
  if (!buffer || buffer.length < 16) return null;
  if (!isValidWebpBuffer(buffer)) return null;

  const chunkType = buffer.subarray(12, 16).toString("ascii");

  if (chunkType === "VP8X") {
    if (buffer.length < 30) return null;
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }

  if (chunkType === "VP8 ") {
    if (buffer.length < 30) return null;
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }

  if (chunkType === "VP8L") {
    if (buffer.length < 25) return null;
    const val = buffer.readUInt32LE(21);
    const width = 1 + (val & 0x3fff);
    const height = 1 + ((val >> 14) & 0x3fff);
    return width > 0 && height > 0 ? { width, height } : null;
  }

  return null;
}

/**
 * Checks whether an actual dimension is within the specified tolerance percentage (default ±1.5%).
 */
export function isDimensionWithinTolerance(
  actual: number,
  expected: number,
  tolerancePercent: number = 1.5
): boolean {
  if (!actual || !expected) return false;
  const allowedDelta = expected * (tolerancePercent / 100);
  const min = Math.floor(expected - allowedDelta);
  const max = Math.ceil(expected + allowedDelta);
  return actual >= min && actual <= max;
}

/**
 * Validates storage key against strict server format and prevents directory traversal.
 * Returns the absolute, sanitized destination file path.
 */
export function validateStorageKeySafety(storageKey: string, rootDir?: string): string {
  if (!storageKey || typeof storageKey !== "string") {
    throw new AppError(400, "INVALID_STORAGE_KEY", "Storage key must be a non-empty string");
  }

  // Reject null bytes
  if (storageKey.includes("\0")) {
    throw new AppError(400, "PATH_TRAVERSAL_DETECTED", "Null bytes are forbidden in storage key");
  }

  // Reject path traversal sequences
  if (
    storageKey.includes("..") ||
    storageKey.startsWith("/") ||
    storageKey.startsWith("\\")
  ) {
    throw new AppError(400, "PATH_TRAVERSAL_DETECTED", "Path traversal sequences are forbidden");
  }

  // Strictly enforce server-generated pattern: generated/YYYY/MM/DD/asset_<id>.webp
  if (!VALID_STORAGE_KEY_REGEX.test(storageKey)) {
    throw new AppError(
      400,
      "INVALID_STORAGE_KEY_FORMAT",
      `Storage key '${storageKey}' does not match expected server format 'generated/YYYY/MM/DD/asset_<job_id>.webp'`
    );
  }

  const baseDir = path.resolve(rootDir || getUploadRootDir());
  const resolvedPath = path.resolve(baseDir, storageKey);

  // Ensure resolved path is strictly inside baseDir
  if (!resolvedPath.startsWith(baseDir + path.sep) && resolvedPath !== baseDir) {
    throw new AppError(
      400,
      "PATH_TRAVERSAL_DETECTED",
      "Resolved path escapes base upload directory"
    );
  }

  return resolvedPath;
}

/**
 * Atomically writes an uploaded binary buffer to disk:
 * 1. Creates target directory if needed
 * 2. Writes to temporary file (.tmp)
 * 3. Atomically renames tmp file to final destination
 * 4. Computes SHA-256 checksum
 */
export async function writeUploadFileAtomic(
  storageKey: string,
  buffer: Buffer,
  rootDir?: string
): Promise<{ targetPath: string; sha256: string; byteSize: number }> {
  const targetPath = validateStorageKeySafety(storageKey, rootDir);
  const targetDir = path.dirname(targetPath);

  await fs.promises.mkdir(targetDir, { recursive: true });

  const tmpPath = `${targetPath}.${Date.now()}.${crypto.randomBytes(6).toString("hex")}.tmp`;

  try {
    await fs.promises.writeFile(tmpPath, buffer);
    try {
      await fs.promises.rename(tmpPath, targetPath);
    } catch (renameErr: any) {
      // Windows workaround if destination file already exists
      if (renameErr.code === "EEXIST" || renameErr.code === "EPERM") {
        try {
          await fs.promises.unlink(targetPath);
          await fs.promises.rename(tmpPath, targetPath);
        } catch {
          throw renameErr;
        }
      } else {
        throw renameErr;
      }
    }
  } catch (err) {
    if (fs.existsSync(tmpPath)) {
      try {
        await fs.promises.unlink(tmpPath);
      } catch {
        // Ignore unlink failure during error cleanup
      }
    }
    throw err;
  }

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  return {
    targetPath,
    sha256,
    byteSize: buffer.length,
  };
}

/**
 * Local Proxy Upload Target Provider (Dev / Staging)
 * Generates an upload URL pointing to the local proxy endpoint with short-term HMAC token.
 */
export class LocalProxyUploadProvider implements UploadTargetProvider {
  readonly name = "local";

  async createUploadTarget(job: ImageJobRow, workerId?: string): Promise<UploadTarget> {
    const actualWorkerId = workerId || job.claimed_by;
    if (!actualWorkerId) {
      throw new AppError(400, "MISSING_WORKER", "Job is not claimed by any worker");
    }

    const storageKey = generateStorageKey(job.id);
    const token = generateUploadToken({
      job_id: job.id,
      worker_id: actualWorkerId,
      storage_key: storageKey,
    });

    const baseUrl = (process.env.API_BASE_URL || "").replace(/\/+$/, "");
    const uploadUrl = `${baseUrl}/api/v1/gpu-worker/upload-proxy?token=${encodeURIComponent(
      token
    )}`;

    return {
      storage_key: storageKey,
      upload_url: uploadUrl,
      http_method: "PUT",
      required_headers: {
        "Content-Type": "image/webp",
      },
      expires_in_seconds: UPLOAD_TOKEN_EXPIRY_SECONDS,
    };
  }

  async getObject(storageKey: string): Promise<Buffer | null> {
    let targetPath: string;
    try {
      targetPath = validateStorageKeySafety(storageKey);
    } catch {
      targetPath = path.resolve(getUploadRootDir(), storageKey);
    }

    if (!fs.existsSync(targetPath)) {
      return null;
    }
    return await fs.promises.readFile(targetPath);
  }

  async deleteObject(storageKey: string): Promise<void> {
    let targetPath: string;
    try {
      targetPath = validateStorageKeySafety(storageKey);
    } catch {
      targetPath = path.resolve(getUploadRootDir(), storageKey);
    }

    if (fs.existsSync(targetPath)) {
      try {
        await fs.promises.unlink(targetPath);
      } catch {
        // Ignore unlink error
      }
    }
  }

  async getImageUrl(storageKey: string): Promise<string> {
    const cleanKey = storageKey.replace(/^\/?(uploads\/)?/, "");
    return `/uploads/${cleanKey}`;
  }
}

export interface R2StorageConfig {
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  bucketName?: string;
  endpoint?: string;
  region?: string;
  publicBaseUrl?: string;
  urlStyle?: "public" | "signed";
  signedUrlExpirySeconds?: number;
  s3Client?: S3Client;
}

/**
 * Cloudflare R2 / AWS S3 Presigned Upload Target Provider (Production / S3-compatible).
 * - Presigned PUT URL expires in 300s
 * - Locks Content-Type to 'image/webp'
 * - Sets Cache-Control: 'public, max-age=31536000, immutable'
 * - Server derives storage_key: generated/YYYY/MM/DD/asset_<id>.webp
 * - Object get / delete operations for verification at /complete
 * - Public or signed image URL resolution based on configuration
 * - Zero R2 credentials leaked in any response payload
 */
export class R2PresignedUploadProvider implements UploadTargetProvider {
  readonly name = "r2";
  readonly config: R2StorageConfig;
  readonly s3Client: S3Client;
  readonly bucketName: string;

  constructor(options?: R2StorageConfig) {
    const accountId = options?.accountId || process.env.R2_ACCOUNT_ID || "";
    const accessKeyId =
      options?.accessKeyId ||
      process.env.R2_ACCESS_KEY_ID ||
      process.env.AWS_ACCESS_KEY_ID ||
      "";
    const secretAccessKey =
      options?.secretAccessKey ||
      process.env.R2_SECRET_ACCESS_KEY ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      "";
    const bucketName =
      options?.bucketName ||
      process.env.R2_BUCKET_NAME ||
      process.env.AWS_S3_BUCKET_NAME ||
      "tripc-media";
    const region = options?.region || process.env.R2_REGION || "auto";
    const endpoint =
      options?.endpoint ||
      process.env.R2_ENDPOINT ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
    const publicBaseUrl =
      options?.publicBaseUrl ||
      process.env.R2_PUBLIC_BASE_URL ||
      process.env.R2_PUBLIC_DOMAIN ||
      "";
    const urlStyle =
      options?.urlStyle ||
      (process.env.R2_URL_STYLE === "signed" ? "signed" : "public");
    const signedUrlExpirySeconds =
      options?.signedUrlExpirySeconds ||
      parseInt(process.env.R2_SIGNED_URL_EXPIRY_SECONDS || "86400", 10);

    this.bucketName = bucketName;
    this.config = {
      accountId,
      accessKeyId,
      secretAccessKey,
      bucketName,
      endpoint,
      region,
      publicBaseUrl,
      urlStyle,
      signedUrlExpirySeconds,
    };

    if (options?.s3Client) {
      this.s3Client = options.s3Client;
    } else {
      if (!accessKeyId || !secretAccessKey) {
        if (process.env.NODE_ENV === "production") {
          throw new AppError(
            500,
            "R2_CONFIG_MISSING",
            "R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (or AWS credentials) are required for R2PresignedUploadProvider in production."
          );
        }
      }

      this.s3Client = new S3Client({
        region,
        endpoint,
        credentials: {
          accessKeyId: accessKeyId || "mock_r2_access_key",
          secretAccessKey: secretAccessKey || "mock_r2_secret_key",
        },
        forcePathStyle: Boolean(endpoint && !endpoint.includes("r2.cloudflarestorage.com")),
      });
    }
  }

  async createUploadTarget(job: ImageJobRow, workerId?: string): Promise<UploadTarget> {
    const actualWorkerId = workerId || job.claimed_by;
    if (!actualWorkerId) {
      throw new AppError(400, "MISSING_WORKER", "Job is not claimed by any worker");
    }

    const storageKey = generateStorageKey(job.id, "webp");

    // Command locks Content-Type: image/webp and Cache-Control: public, max-age=31536000, immutable
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: storageKey,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 300,
      signableHeaders: new Set(["content-type", "host"]),
    });

    // Zero R2 credentials returned to client/worker!
    return {
      storage_key: storageKey,
      upload_url: uploadUrl,
      http_method: "PUT",
      required_headers: {
        "Content-Type": "image/webp",
      },
      expires_in_seconds: 300,
    };
  }

  async getObject(storageKey: string): Promise<Buffer | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      });
      const response = await this.s3Client.send(command);
      if (!response.Body) {
        return null;
      }
      const byteArray = await response.Body.transformToByteArray();
      return Buffer.from(byteArray);
    } catch (err: any) {
      if (
        err.name === "NoSuchKey" ||
        err.name === "NotFound" ||
        err.$metadata?.httpStatusCode === 404 ||
        err.code === "NoSuchKey"
      ) {
        return null;
      }
      throw err;
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      });
      await this.s3Client.send(command);
    } catch (err: any) {
      if (
        err.name === "NoSuchKey" ||
        err.name === "NotFound" ||
        err.$metadata?.httpStatusCode === 404 ||
        err.code === "NoSuchKey"
      ) {
        return;
      }
      throw err;
    }
  }

  async getImageUrl(storageKey: string): Promise<string> {
    if (this.config.urlStyle === "signed" || !this.config.publicBaseUrl) {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      });
      return await getSignedUrl(this.s3Client, command, {
        expiresIn: this.config.signedUrlExpirySeconds || 86400,
      });
    }

    const base = this.config.publicBaseUrl.replace(/\/+$/, "");
    const cleanKey = storageKey.replace(/^\/+/, "");
    return `${base}/${cleanKey}`;
  }
}

let customUploadTargetProvider: UploadTargetProvider | null = null;

export function setCustomUploadTargetProvider(provider: UploadTargetProvider | null): void {
  customUploadTargetProvider = provider;
}

/**
 * Factory for UploadTargetProvider.
 * Guardrail: in NODE_ENV=production, 'local' provider is strictly rejected at startup / call.
 */
export function getUploadTargetProvider(): UploadTargetProvider {
  if (customUploadTargetProvider) {
    return customUploadTargetProvider;
  }

  const providerType = (process.env.IMAGE_STORAGE_PROVIDER || "local").toLowerCase();

  if (process.env.NODE_ENV === "production" && providerType === "local") {
    throw new AppError(
      500,
      "INVALID_STORAGE_CONFIG",
      "LocalProxyUploadProvider is strictly forbidden in production (NODE_ENV=production). Set IMAGE_STORAGE_PROVIDER=r2 (or s3) and configure Cloudflare R2 / AWS S3 storage."
    );
  }

  if (providerType === "r2" || providerType === "s3") {
    return new R2PresignedUploadProvider();
  }

  if (providerType === "local") {
    return new LocalProxyUploadProvider();
  }

  throw new AppError(
    500,
    "INVALID_STORAGE_PROVIDER",
    `Unsupported IMAGE_STORAGE_PROVIDER: '${providerType}'. Supported providers: 'local', 'r2'.`
  );
}

