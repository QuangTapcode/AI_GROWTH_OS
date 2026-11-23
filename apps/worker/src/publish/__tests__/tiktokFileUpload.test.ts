import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  calculateTikTokChunkPlan,
  TikTokPublisher,
  toPlainTextKeepHashtags,
} from '../TikTokPublisher';
import { SocialTokenManager } from '../SocialTokenManager';

const MB = 1024 * 1024;

describe('TikTok Option B: FILE_UPLOAD, Chunking, AuthOverride & Token Refresh', () => {
  let server: http.Server;
  let mockBaseUrl = '';
  let initRequests: Array<{ url: string; headers: http.IncomingHttpHeaders; body: any }> = [];
  let statusRequests: Array<{ url: string; headers: http.IncomingHttpHeaders; body: any }> = [];
  let uploadCalls: Array<{
    url: string;
    headers: http.IncomingHttpHeaders;
    byteLength: number;
    firstByte: number;
    lastByte: number;
  }> = [];
  let oauthMode: 'flat' | 'nested' = 'flat';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url || '';

      if (req.method === 'PUT' && url.startsWith('/upload/')) {
        let byteLength = 0;
        let firstByte = -1;
        let lastByte = -1;
        req.on('data', (chunk: Buffer) => {
          if (chunk.length > 0) {
            if (firstByte === -1) firstByte = chunk[0];
            lastByte = chunk[chunk.length - 1];
            byteLength += chunk.length;
          }
        });
        req.on('end', () => {
          uploadCalls.push({
            url,
            headers: req.headers,
            byteLength,
            firstByte,
            lastByte,
          });
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        });
        return;
      }

      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');

        if (url.includes('/v2/post/publish/video/init/')) {
          const parsed = rawBody ? JSON.parse(rawBody) : {};
          initRequests.push({ url, headers: req.headers, body: parsed });
          const isSingle = parsed?.source_info?.total_chunk_count === 1;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              data: {
                publish_id: isSingle ? 'v_pub_single_01' : 'v_pub_multi_02',
                upload_url: `${mockBaseUrl}/upload/${isSingle ? 'single' : 'multi'}`,
              },
              error: { code: 'ok' },
            })
          );
          return;
        }

        if (url.includes('/v2/post/publish/status/fetch/')) {
          const parsed = rawBody ? JSON.parse(rawBody) : {};
          statusRequests.push({ url, headers: req.headers, body: parsed });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              data: { status: 'PUBLISH_COMPLETE' },
              error: { code: 'ok' },
            })
          );
          return;
        }

        if (url.includes('/v2/oauth/token/')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          if (oauthMode === 'flat') {
            res.end(
              JSON.stringify({
                access_token: 'tt_flat_access_123',
                refresh_token: 'tt_flat_refresh_456',
                expires_in: 86400,
                refresh_expires_in: 31536000,
                open_id: 'open_flat_1',
              })
            );
          } else {
            res.end(
              JSON.stringify({
                data: {
                  access_token: 'tt_nested_access_789',
                  refresh_token: 'tt_nested_refresh_012',
                  expires_in: 7200,
                  refresh_expires_in: 2592000,
                  open_id: 'open_nested_2',
                },
                error: { code: 'ok' },
              })
            );
          }
          return;
        }

        res.writeHead(404);
        res.end();
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        mockBaseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('calculateTikTokChunkPlan handles <=64MB single-chunk and >64MB 10MB multi-chunk boundaries', () => {
    expect(() => calculateTikTokChunkPlan(0)).toThrow(/empty/i);
    expect(() => calculateTikTokChunkPlan(-5)).toThrow(/empty/i);

    expect(calculateTikTokChunkPlan(10 * MB)).toEqual({
      videoSize: 10 * MB,
      chunkSize: 10 * MB,
      totalChunkCount: 1,
    });

    expect(calculateTikTokChunkPlan(64 * MB)).toEqual({
      videoSize: 64 * MB,
      chunkSize: 64 * MB,
      totalChunkCount: 1,
    });

    expect(calculateTikTokChunkPlan(75 * MB)).toEqual({
      videoSize: 75 * MB,
      chunkSize: 10 * MB,
      totalChunkCount: 7,
    });

    expect(calculateTikTokChunkPlan(100 * MB)).toEqual({
      videoSize: 100 * MB,
      chunkSize: 10 * MB,
      totalChunkCount: 10,
    });
  });

  it('publishes <=64MB local file via single-chunk FILE_UPLOAD without Authorization on upload_url', async () => {
    initRequests = [];
    uploadCalls = [];

    const tmpFile = path.join(os.tmpdir(), `tt-single-${Date.now()}.mp4`);
    const sampleSize = 256 * 1024;
    const sampleBuf = Buffer.alloc(sampleSize, 0x22);
    sampleBuf[0] = 0x11;
    sampleBuf[sampleSize - 1] = 0x33;
    fs.writeFileSync(tmpFile, sampleBuf);

    try {
      const publisher = new TikTokPublisher('', undefined, 'SELF_ONLY', mockBaseUrl);
      const res = await publisher.publish({
        contentId: 'content_single_1',
        workspaceId: 'ws_1',
        channel: 'TikTok',
        bodyMarkdown: '# Ignore Heading\n\nCheck **Da Nang**! #TripC #Da_Nang',
        mediaPath: tmpFile,
        mediaType: 'video',
        isAiGenerated: true,
        authOverride: {
          accessToken: 'override_access_token_1',
          openId: 'open_user_1',
          privacyLevel: 'SELF_ONLY',
        },
        idempotencyKey: 'pub:1',
      });

      expect(res.success).toBe(true);
      expect(res.externalPostId).toBe('v_pub_single_01');

      expect(initRequests).toHaveLength(1);
      expect(initRequests[0].headers.authorization).toBe('Bearer override_access_token_1');
      expect(initRequests[0].headers['x-open-id']).toBe('open_user_1');
      expect(initRequests[0].body.source_info).toEqual({
        source: 'FILE_UPLOAD',
        video_size: sampleSize,
        chunk_size: sampleSize,
        total_chunk_count: 1,
      });
      expect(initRequests[0].body.post_info.privacy_level).toBe('SELF_ONLY');
      expect(initRequests[0].body.post_info.is_aigc).toBe(true);
      expect(initRequests[0].body.post_info.title).toContain('#TripC #Da_Nang');
      expect(initRequests[0].body.post_info.title).toContain('#AIGC');

      expect(uploadCalls).toHaveLength(1);
      expect(uploadCalls[0].headers.authorization).toBeUndefined();
      expect(uploadCalls[0].headers['content-type']).toBe('video/mp4');
      expect(uploadCalls[0].headers['content-length']).toBe(String(sampleSize));
      expect(uploadCalls[0].headers['content-range']).toBe(`bytes 0-${sampleSize - 1}/${sampleSize}`);
      expect(uploadCalls[0].byteLength).toBe(sampleSize);
      expect(uploadCalls[0].firstByte).toBe(0x11);
      expect(uploadCalls[0].lastByte).toBe(0x33);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it('publishes >64MB file via 10MB chunks with final chunk absorbing remainder', async () => {
    initRequests = [];
    uploadCalls = [];

    const tmpFile = path.join(os.tmpdir(), `tt-multi-${Date.now()}.mp4`);
    const totalSize = 65 * MB;
    const fd = fs.openSync(tmpFile, 'w');
    try {
      // Truncate creates a 65 MB sparse test file instantaneously on NTFS/tmpfs
      fs.ftruncateSync(fd, totalSize);
      fs.writeSync(fd, Buffer.from([0xaa]), 0, 1, 0);
      fs.writeSync(fd, Buffer.from([0xbb]), 0, 1, totalSize - 1);
    } finally {
      fs.closeSync(fd);
    }

    try {
      const publisher = new TikTokPublisher('ctor_token', 'ctor_open', 'SELF_ONLY', mockBaseUrl);
      const res = await publisher.publish({
        contentId: 'content_multi_2',
        workspaceId: 'ws_1',
        channel: 'TikTok',
        bodyMarkdown: 'Long clip #TripC',
        mediaPath: tmpFile,
        mediaType: 'video',
        idempotencyKey: 'pub:2',
      });

      expect(res.success).toBe(true);
      expect(res.externalPostId).toBe('v_pub_multi_02');
      expect(initRequests[0].body.source_info).toEqual({
        source: 'FILE_UPLOAD',
        video_size: 65 * MB,
        chunk_size: 10 * MB,
        total_chunk_count: 6,
      });

      // 5 chunks x 10 MB + final chunk x 15 MB = 6 chunks totaling 65 MB
      expect(uploadCalls).toHaveLength(6);
      expect(uploadCalls.map((c) => c.byteLength)).toEqual([
        10 * MB,
        10 * MB,
        10 * MB,
        10 * MB,
        10 * MB,
        15 * MB,
      ]);
      expect(uploadCalls[0].headers['content-range']).toBe(`bytes 0-${10 * MB - 1}/${totalSize}`);
      expect(uploadCalls[0].headers.authorization).toBeUndefined();
      expect(uploadCalls[0].firstByte).toBe(0xaa);
      expect(uploadCalls[5].headers['content-range']).toBe(`bytes ${50 * MB}-${totalSize - 1}/${totalSize}`);
      expect(uploadCalls[5].lastByte).toBe(0xbb);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  it('uses authOverride in reconcile() when provided', async () => {
    statusRequests = [];
    const publisher = new TikTokPublisher('old_ctor_token', 'old_open', 'SELF_ONLY', mockBaseUrl);
    const res = await publisher.reconcile('v_pub_single_01', {
      accessToken: 'fresh_reconcile_token',
      openId: 'fresh_open_id',
      privacyLevel: 'SELF_ONLY',
    });

    expect(res.success).toBe(true);
    expect(statusRequests).toHaveLength(1);
    expect(statusRequests[0].headers.authorization).toBe('Bearer fresh_reconcile_token');
    expect(statusRequests[0].headers['x-open-id']).toBe('fresh_open_id');
    expect(statusRequests[0].body).toEqual({ publish_id: 'v_pub_single_01' });
  });

  it('toPlainTextKeepHashtags preserves hashtags & paragraph breaks while stripping markdown syntax', () => {
    const input =
      '# Top 3 Cafe Da Nang\n\nCheck [TripC](https://tripc.ai) with **bold** views!\n![cover](https://cdn.example.com/a.jpg)\n\n#TripC #Da_Nang #VietnamTravel';
    const out = toPlainTextKeepHashtags(input);
    expect(out).toBe('Top 3 Cafe Da Nang\n\nCheck TripC with bold views!\n\n#TripC #Da_Nang #VietnamTravel');
  });

  it('SocialTokenManager refreshes TikTok tokens for both flat and nested { data } payloads', async () => {
    const prevBaseUrl = process.env.TIKTOK_API_BASE_URL;
    process.env.TIKTOK_API_BASE_URL = mockBaseUrl;
    try {
      const mgr = new SocialTokenManager('shared_test_secret_32_bytes_key');

      oauthMode = 'flat';
      const flat = await mgr.refreshToken({
        channel: 'TikTok',
        accessToken: 'old_acc',
        refreshToken: 'old_ref',
        clientId: 'ck',
        clientSecret: 'cs',
      });
      expect(flat).toMatchObject({
        success: true,
        accessToken: 'tt_flat_access_123',
        refreshToken: 'tt_flat_refresh_456',
        expiresIn: 86400,
        refreshExpiresIn: 31536000,
      });

      oauthMode = 'nested';
      const nested = await mgr.refreshToken({
        channel: 'TikTok',
        accessToken: 'old_acc',
        refreshToken: 'old_ref',
        clientId: 'ck',
        clientSecret: 'cs',
      });
      expect(nested).toMatchObject({
        success: true,
        accessToken: 'tt_nested_access_789',
        refreshToken: 'tt_nested_refresh_012',
        expiresIn: 7200,
        refreshExpiresIn: 2592000,
      });
    } finally {
      if (prevBaseUrl === undefined) delete process.env.TIKTOK_API_BASE_URL;
      else process.env.TIKTOK_API_BASE_URL = prevBaseUrl;
    }
  });
});

