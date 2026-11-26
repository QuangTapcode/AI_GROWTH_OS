import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import crypto from "crypto";
import { S3Client, CreateBucketCommand } from "@aws-sdk/client-s3";
import { R2PresignedUploadProvider } from "../../src/modules/gpuWorkers/storage";
import type { ImageJobRow } from "../../src/modules/gpuWorkers/models";

describe("R2 Storage Staging Smoke Test", () => {
  const hasRealR2Config = Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );

  let mockServer: http.Server | null = null;
  let mockPort: number = 0;
  const mockStorage = new Map<string, { body: Buffer; headers: Record<string, string> }>();

  beforeAll(async () => {
    if (!hasRealR2Config) {
      console.log(
        "[SMOKE] R2_ACCOUNT_ID / R2_ACCESS_KEY_ID not set in env; running staging smoke against local S3-compatible endpoint."
      );
      mockServer = http.createServer((req, res) => {
        const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
        const key = url.pathname.replace(/^\/+/, "");

        if (req.method === "PUT") {
          const chunks: Buffer[] = [];
          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", () => {
            const body = Buffer.concat(chunks);
            const headers: Record<string, string> = {};
            for (const [k, v] of Object.entries(req.headers)) {
              if (v) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
            }
            mockStorage.set(key, { body, headers });
            res.writeHead(200, { "Content-Type": "application/xml" });
            res.end("<PutObjectOutput/>");
          });
          return;
        }

        if (req.method === "GET") {
          const item = mockStorage.get(key);
          if (!item) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
            return;
          }
          res.writeHead(200, {
            "Content-Type": item.headers["content-type"] || "image/webp",
            "Content-Length": item.body.length,
          });
          res.end(item.body);
          return;
        }

        if (req.method === "DELETE") {
          mockStorage.delete(key);
          res.writeHead(204);
          res.end();
          return;
        }

        res.writeHead(405);
        res.end();
      });

      await new Promise<void>((resolve) => {
        mockServer!.listen(0, "127.0.0.1", () => {
          mockPort = (mockServer!.address() as any).port;
          resolve();
        });
      });
    } else {
      console.log(`[SMOKE] Running live smoke test against Cloudflare R2 bucket: ${process.env.R2_BUCKET_NAME}`);
    }
  });

  afterAll(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer!.close(() => resolve()));
    }
  });

  it("Smoke Test: Presigned PUT → Binary Upload → Server Read & Verify → Cleanup Delete", async () => {
    const provider = hasRealR2Config
      ? new R2PresignedUploadProvider({
          accountId: process.env.R2_ACCOUNT_ID,
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
          bucketName: process.env.R2_BUCKET_NAME,
          endpoint: process.env.R2_ENDPOINT,
          region: process.env.R2_REGION || "auto",
          publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
        })
      : new R2PresignedUploadProvider({
          endpoint: `http://127.0.0.1:${mockPort}`,
          bucketName: "staging-tripc-media",
          accessKeyId: "mock_smoke_key_id",
          secretAccessKey: "mock_smoke_secret_key",
          region: "auto",
          publicBaseUrl: "https://media.staging.tripc.vn",
        });

    const mockJob = {
      id: "77777777-8888-9999-aaaa-bbbbbbbbbbbb",
      workspace_id: "10000000-0000-4000-8000-000000000001",
      status: "running",
      request: {
        prompt: "Staging smoke test banner",
        aspect_ratio: "1:1",
      },
      claimed_by: "77777777-1111-2222-3333-444444444444",
      attempt: 1,
      delivery_count: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as unknown as ImageJobRow;

    // 1. Create upload target
    const target = await provider.createUploadTarget(mockJob);
    expect(target.upload_url).toBeTruthy();
    expect(target.storage_key).toContain("asset_77777777-8888-9999-aaaa-bbbbbbbbbbbb.webp");
    expect(target.expires_in_seconds).toBe(300);
    expect(target.required_headers["Content-Type"]).toBe("image/webp");

    // 2. Prepare mock WebP binary payload (4KB)
    const payloadSize = 4096;
    const testBytes = Buffer.alloc(payloadSize);
    testBytes.write("RIFF", 0);
    testBytes.writeUInt32LE(payloadSize - 8, 4);
    testBytes.write("WEBPVP8 ", 8);
    for (let i = 16; i < payloadSize; i++) {
      testBytes[i] = (i * 13) % 256;
    }
    const expectedHash = crypto.createHash("sha256").update(testBytes).digest("hex");

    // 3. Worker executes PUT request to target.upload_url
    const uploadRes = await fetch(target.upload_url, {
      method: "PUT",
      headers: target.required_headers,
      body: testBytes,
    });
    expect(uploadRes.status).toBe(200);

    // 4. Server executes getObject at /complete to verify size & sha256 hash
    const downloadedBuf = await provider.getObject(target.storage_key);
    expect(downloadedBuf).not.toBeNull();
    expect(downloadedBuf!.length).toBe(payloadSize);
    const downloadedHash = crypto.createHash("sha256").update(downloadedBuf!).digest("hex");
    expect(downloadedHash).toBe(expectedHash);

    // 5. Check image URL formatting
    const imageUrl = await provider.getImageUrl(target.storage_key);
    expect(imageUrl).toBeTruthy();
    expect(imageUrl).toContain(target.storage_key);

    // 6. Delete object on server cleanup
    await provider.deleteObject(target.storage_key);
    const afterDeleteBuf = await provider.getObject(target.storage_key);
    expect(afterDeleteBuf).toBeNull();
  });
});

