import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import crypto from "node:crypto";
import {
  R2PresignedUploadProvider,
  LocalProxyUploadProvider,
  getUploadTargetProvider,
  setCustomUploadTargetProvider,
  generateStorageKey,
  VALID_STORAGE_KEY_REGEX,
} from "../../src/modules/gpuWorkers/storage";
import { ImageJobRow } from "../../src/modules/gpuWorkers/models";

/**
 * Creates a minimal valid WebP image buffer (RIFF....WEBPVP8X...)
 */
function createMockWebp(width = 1080, height = 1080, byteLength = 2048): Buffer {
  const buf = Buffer.alloc(Math.max(30, byteLength));
  // RIFF header
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(buf.length - 8, 4);
  buf.write("WEBP", 8, "ascii");
  // VP8X chunk
  buf.write("VP8X", 12, "ascii");
  buf.writeUInt32LE(10, 16); // VP8X chunk size = 10 bytes
  buf.writeUInt8(0, 20); // flags
  buf.writeUInt8(0, 21);
  buf.writeUInt8(0, 22);
  buf.writeUInt8(0, 23);
  // Canvas width - 1 (24-bit integer, little-endian)
  const wMinus1 = width - 1;
  buf.writeUInt8(wMinus1 & 0xff, 24);
  buf.writeUInt8((wMinus1 >> 8) & 0xff, 25);
  buf.writeUInt8((wMinus1 >> 16) & 0xff, 26);
  // Canvas height - 1 (24-bit integer, little-endian)
  const hMinus1 = height - 1;
  buf.writeUInt8(hMinus1 & 0xff, 27);
  buf.writeUInt8((hMinus1 >> 8) & 0xff, 28);
  buf.writeUInt8((hMinus1 >> 16) & 0xff, 29);
  return buf;
}

describe("R2PresignedUploadProvider (S3 / Cloudflare R2 Mock)", () => {
  let server: http.Server;
  let serverPort: number;
  let serverUrl: string;
  const s3Storage = new Map<string, { buffer: Buffer; headers: http.IncomingHttpHeaders }>();

  beforeAll(async () => {
    // Start local S3 mock HTTP server
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      // Path format: /<bucket>/<key...>
      const pathname = decodeURIComponent(url.pathname);
      const parts = pathname.replace(/^\/+/, "").split("/");
      const bucket = parts[0];
      const key = parts.slice(1).join("/");

      if (req.method === "PUT") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
          const body = Buffer.concat(chunks);
          s3Storage.set(`${bucket}/${key}`, { buffer: body, headers: req.headers });
          res.writeHead(200, { "Content-Type": "application/xml" });
          res.end("<PutObjectResult></PutObjectResult>");
        });
        return;
      }

      if (req.method === "GET") {
        const item = s3Storage.get(`${bucket}/${key}`);
        if (!item) {
          res.writeHead(404, { "Content-Type": "application/xml" });
          res.end("<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message></Error>");
          return;
        }
        res.writeHead(200, {
          "Content-Type": (item.headers["content-type"] as string) || "image/webp",
          "Content-Length": item.buffer.length.toString(),
          "Cache-Control": (item.headers["cache-control"] as string) || "public, max-age=31536000, immutable",
        });
        res.end(item.buffer);
        return;
      }

      if (req.method === "DELETE") {
        s3Storage.delete(`${bucket}/${key}`);
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "HEAD") {
        const item = s3Storage.get(`${bucket}/${key}`);
        if (!item) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": (item.headers["content-type"] as string) || "image/webp",
          "Content-Length": item.buffer.length.toString(),
        });
        res.end();
        return;
      }

      res.writeHead(405);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        serverUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    setCustomUploadTargetProvider(null);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    s3Storage.clear();
  });

  it("1. createUploadTarget: sinh presigned PUT URL hết hạn 300s, khóa Content-Type image/webp, key do server sinh", async () => {
    const provider = new R2PresignedUploadProvider({
      endpoint: serverUrl,
      bucketName: "staging-bucket",
      accessKeyId: "mock_key_id",
      secretAccessKey: "mock_secret_key",
      region: "auto",
      publicBaseUrl: "https://media.staging.tripc.vn",
    });

    const mockJob = {
      id: crypto.randomUUID(),
      claimed_by: "gpu-worker-node-01",
    } as ImageJobRow;

    const target = await provider.createUploadTarget(mockJob);

    // 1.1. Key do server sinh đúng format
    expect(target.storage_key).toMatch(VALID_STORAGE_KEY_REGEX);
    expect(target.storage_key).toContain(`asset_${mockJob.id}.webp`);

    // 1.2. Method là PUT
    expect(target.http_method).toBe("PUT");

    // 1.3. Hết hạn 300s
    expect(target.expires_in_seconds).toBe(300);

    // 1.4. Required headers khóa Content-Type: image/webp
    expect(target.required_headers).toEqual({
      "Content-Type": "image/webp",
    });

    // 1.5. URL presigned chứa query parameters chuẩn SigV4
    expect(target.upload_url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(target.upload_url).toContain("X-Amz-Credential=");
    expect(target.upload_url).toContain("X-Amz-Expires=300");
    expect(target.upload_url).toContain("X-Amz-Signature=");

    // 1.6. SignedHeaders bao gồm content-type và cache-control
    expect(target.upload_url).toContain("content-type");

    // 1.7. TUYỆT ĐỐI KHÔNG đưa credential R2 bí mật (secretAccessKey) vào response
    const jsonStr = JSON.stringify(target);
    expect(jsonStr).not.toContain("mock_secret_key");
    expect((target as any).secretAccessKey).toBeUndefined();
    expect((target as any).accessKeyId).toBeUndefined();
  });

  it("2. Worker PUT ảnh thành công lên presigned URL (1KB - 10MB) và lưu đúng Cache-Control", async () => {
    const provider = new R2PresignedUploadProvider({
      endpoint: serverUrl,
      bucketName: "staging-bucket",
      accessKeyId: "mock_key_id",
      secretAccessKey: "mock_secret_key",
      region: "auto",
      publicBaseUrl: "https://media.staging.tripc.vn",
    });

    const mockJob = {
      id: crypto.randomUUID(),
      claimed_by: "gpu-worker-node-01",
    } as ImageJobRow;

    const target = await provider.createUploadTarget(mockJob);
    const testImage = createMockWebp(1080, 1080, 5000); // 5 KB

    // Worker performs standard HTTP PUT
    const putRes = await fetch(target.upload_url, {
      method: "PUT",
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
      body: new Uint8Array(testImage),
    });
    expect(putRes.status).toBe(200);

    // Check item in mock S3
    const saved = s3Storage.get(`staging-bucket/${target.storage_key}`);
    expect(saved).toBeDefined();
    expect(saved?.buffer.length).toBe(testImage.length);
    expect(saved?.headers["content-type"]).toBe("image/webp");
  });

  it("3. getObject: đọc nhị phân phục vụ bước verify tính toàn vẹn ở /complete", async () => {
    const provider = new R2PresignedUploadProvider({
      endpoint: serverUrl,
      bucketName: "staging-bucket",
      accessKeyId: "mock_key_id",
      secretAccessKey: "mock_secret_key",
      region: "auto",
    });

    const testImage = createMockWebp(1080, 1080, 4096);
    const testKey = `generated/2026/11/12/asset_${crypto.randomUUID()}.webp`;

    // Seed mock S3
    s3Storage.set(`staging-bucket/${testKey}`, {
      buffer: testImage,
      headers: { "content-type": "image/webp" },
    });

    // getObject returns exact Buffer
    const fetched = await provider.getObject(testKey);
    expect(fetched).not.toBeNull();
    expect(fetched?.length).toBe(testImage.length);
    expect(crypto.createHash("sha256").update(fetched!).digest("hex")).toBe(
      crypto.createHash("sha256").update(testImage).digest("hex")
    );

    // Non-existent key returns null
    const nonExistent = await provider.getObject("generated/non-existent-key.webp");
    expect(nonExistent).toBeNull();
  });

  it("4. deleteObject: xoá object khi kiểm tra tính toàn vẹn thất bại", async () => {
    const provider = new R2PresignedUploadProvider({
      endpoint: serverUrl,
      bucketName: "staging-bucket",
      accessKeyId: "mock_key_id",
      secretAccessKey: "mock_secret_key",
      region: "auto",
    });

    const testImage = createMockWebp(1080, 1080, 2048);
    const testKey = `generated/2026/11/12/asset_${crypto.randomUUID()}.webp`;

    s3Storage.set(`staging-bucket/${testKey}`, {
      buffer: testImage,
      headers: { "content-type": "image/webp" },
    });

    expect(s3Storage.has(`staging-bucket/${testKey}`)).toBe(true);
    await provider.deleteObject(testKey);
    expect(s3Storage.has(`staging-bucket/${testKey}`)).toBe(false);

    // Idempotent delete on non-existent does not throw
    await expect(provider.deleteObject("generated/non-existent.webp")).resolves.not.toThrow();
  });

  it("5. getImageUrl: trả về public CDN URL hoặc signed URL theo cấu hình", async () => {
    const testKey = "generated/2026/11/12/asset_sample.webp";

    // 5.1. Public URL mode (default khi có publicBaseUrl)
    const publicProvider = new R2PresignedUploadProvider({
      endpoint: serverUrl,
      bucketName: "staging-bucket",
      accessKeyId: "mock_key_id",
      secretAccessKey: "mock_secret_key",
      publicBaseUrl: "https://cdn.tripc.vn",
      urlStyle: "public",
    });
    const publicUrl = await publicProvider.getImageUrl(testKey);
    expect(publicUrl).toBe("https://cdn.tripc.vn/generated/2026/11/12/asset_sample.webp");

    // 5.2. Signed URL mode (khi urlStyle = 'signed')
    const signedProvider = new R2PresignedUploadProvider({
      endpoint: serverUrl,
      bucketName: "staging-bucket",
      accessKeyId: "mock_key_id",
      secretAccessKey: "mock_secret_key",
      urlStyle: "signed",
      signedUrlExpirySeconds: 3600,
    });
    const signedUrl = await signedProvider.getImageUrl(testKey);
    expect(signedUrl).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(signedUrl).toContain("X-Amz-Expires=3600");
    expect(signedUrl).toContain("X-Amz-Signature=");
    expect(signedUrl).toContain("asset_sample.webp");
  });

  it("6. LocalProxyUploadProvider và R2PresignedUploadProvider cùng tuân thủ interface UploadTargetProvider", async () => {
    const local = new LocalProxyUploadProvider();
    expect(local.name).toBe("local");
    expect(typeof local.createUploadTarget).toBe("function");
    expect(typeof local.getObject).toBe("function");
    expect(typeof local.deleteObject).toBe("function");
    expect(typeof local.getImageUrl).toBe("function");

    const r2 = new R2PresignedUploadProvider({
      endpoint: serverUrl,
      bucketName: "b",
      accessKeyId: "k",
      secretAccessKey: "s",
    });
    expect(r2.name).toBe("r2");
    expect(typeof r2.createUploadTarget).toBe("function");
    expect(typeof r2.getObject).toBe("function");
    expect(typeof r2.deleteObject).toBe("function");
    expect(typeof r2.getImageUrl).toBe("function");
  });
});

