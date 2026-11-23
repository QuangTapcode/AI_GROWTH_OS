import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TikTokPublisher } from '../TikTokPublisher';

// What TikTok answered on 2026-11-12 for a public post from an app it has not audited yet.
const UNAUDITED = {
  error: {
    code: 'unaudited_client_can_only_post_to_private_accounts',
    message: 'Please review our integration guidelines at https://developers.tiktok.com/doc/content-sharing-guidelines/',
    log_id: 'x',
  },
};

describe('a public TikTok post from an app TikTok has not audited', () => {
  let server: http.Server;
  let base = '';
  const file = path.join(os.tmpdir(), `tt-unaudited-${process.pid}.mp4`);

  beforeAll(async () => {
    fs.writeFileSync(file, Buffer.alloc(1024, 1));
    server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(403, { 'content-type': 'application/json' });
        res.end(JSON.stringify(UNAUDITED));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    fs.rmSync(file, { force: true });
    await new Promise<void>((r) => server.close(() => r()));
  });

  it('fails with a plain reason telling the owner to post as "only me", instead of a manual pack', async () => {
    const res = await new TikTokPublisher('', undefined, 'PUBLIC_TO_EVERYONE', base).publish({
      contentId: 'c1',
      workspaceId: 'ws_1',
      channel: 'TikTok',
      bodyMarkdown: 'Clip',
      mediaPath: file,
      mediaType: 'video',
      isAiGenerated: true,
      authOverride: { accessToken: 't', openId: 'o', privacyLevel: 'PUBLIC_TO_EVERYONE' },
      idempotencyKey: 'pub:unaudited',
    });

    expect(res.success).toBe(false);
    expect(res.isManualFallback).toBeFalsy();
    expect(res.errorCode).toBe('TIKTOK_UNAUDITED_PRIVATE_ONLY');
    expect(res.errorMessage).toContain('SELF_ONLY');
  });
});
