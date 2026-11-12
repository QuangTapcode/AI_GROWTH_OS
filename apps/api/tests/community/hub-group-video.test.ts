import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommunityHubService } from '../../src/modules/community/hub';

const WS = '10000000-0000-4000-8000-000000000001';
const SRC = '0df32f92-0871-4ed0-a063-f498e4bdcc90';

describe('posting a topic to the Facebook Group with its video', () => {
  let tmp: string;
  const servers: http.Server[] = [];
  const payloads: Record<string, unknown>[] = [];

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-group-video-'));
    const videos = path.join(tmp, 'videos');
    fs.mkdirSync(videos);
    fs.writeFileSync(path.join(videos, 'apartment-checklist.mp4'), 'x');
    fs.writeFileSync(path.join(videos, 'manifest.json'), JSON.stringify({ videos: [
      { workspace_id: WS, source_id: SRC, file: 'apartment-checklist.mp4', title: 'Apartment', duration_s: 50, created_at: '', status: 'draft' },
    ] }));
    // A logged-in admin session: the hub refuses to post without c_user + xs.
    fs.writeFileSync(path.join(tmp, '.fb-session.json'), JSON.stringify({ cookies: [
      { name: 'c_user', value: '10001122334455', domain: '.facebook.com' },
      { name: 'xs', value: 'test-xs', domain: '.facebook.com' },
    ] }));
    vi.stubEnv('FB_ADMIN_COOKIE', '');
    // The Group Bot on the "host": reads the payload file the hub wrote and posts successfully.
    const server = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        const { args } = JSON.parse(raw) as { args: string[] };
        payloads.push(JSON.parse(fs.readFileSync(args[args.indexOf('--payload-file') + 1], 'utf8')));
        res.end(JSON.stringify({ code: 0, stdout: 'GROUP_BOT_RESULT:{"success":true}\n', stderr: '' }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    servers.push(server);
    vi.stubEnv('GROUP_BOT_BRIDGE_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    vi.stubEnv('GROUP_BOT_SHARED_DIR', path.join(tmp, 'io'));
    vi.stubEnv('FB_SESSION_FILE', path.join(tmp, '.fb-session.json'));
    vi.stubEnv('COMMUNITY_VIDEO_DIR', videos);
  });

  afterEach(() => {
    servers.splice(0).forEach((s) => s.close());
    payloads.splice(0);
    vi.unstubAllEnvs();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const service = () => new CommunityHubService({
    query: vi.fn(async () => ({ rows: [], rowCount: 0 })), connect: vi.fn(),
  } as unknown as Pool);

  it("hands the bot the topic's video, by file name, so the Group gets the video too", async () => {
    const result = await service().postToGroupViaBot(WS, { title: 'Apartment Viewing Checklist', body: 'Body', source_id: SRC });

    expect(result.success).toBe(true);
    expect(payloads[0]).toMatchObject({ title: 'Apartment Viewing Checklist', videoFile: 'apartment-checklist.mp4' });
  });

  it('posts without a video when the topic has none yet', async () => {
    await service().postToGroupViaBot(WS, { title: 'No video topic', body: 'Body', source_id: 'other-topic' });

    expect(payloads[0]).not.toHaveProperty('videoFile');
  });
});
