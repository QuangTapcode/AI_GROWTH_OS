import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnGroupBot } from '../../src/modules/community/groupBotProcess';

const servers: http.Server[] = [];
afterEach(() => { servers.splice(0).forEach((s) => s.close()); vi.unstubAllEnvs(); });

/** A bridge on the "host" that records each request and answers with `answer`. */
async function hostBridge(answer: (body: any) => unknown, delayMs = 0) {
  const requests: { auth?: string; body: any }[] = [];
  const closed = vi.fn();
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      requests.push({ auth: req.headers.authorization, body });
      res.on('close', () => { if (!res.writableEnded) closed(); });
      setTimeout(() => { if (!res.destroyed) res.end(JSON.stringify(answer(body))); }, delayMs);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  servers.push(server);
  vi.stubEnv('GROUP_BOT_BRIDGE_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  vi.stubEnv('AUTOMATION_INTERNAL_TOKEN', 'secret');
  vi.stubEnv('GROUP_BOT_WORKER_DIR', '/host-worker');
  return { requests, closed };
}

function outcome(child: ReturnType<typeof spawnGroupBot>) {
  let stdout = '';
  child.stdout?.on('data', (d) => { stdout += d.toString(); });
  return new Promise<{ code?: number | null; error?: string; stdout: string }>((resolve) => {
    child.on('close', (code: number | null) => resolve({ code, stdout }));
    child.on('error', (e: Error) => resolve({ error: e.message, stdout }));
  });
}

describe('Group Bot from the API container', () => {
  it('runs the bot on the host and reports its output like a local process', async () => {
    const bridge = await hostBridge(() => ({ code: 0, stdout: 'GROUP_BOT_RESULT:{"success":true}\n', stderr: '' }));

    const child = spawnGroupBot('node', ['post', '--payload-file', '/host-worker/.group-bot-io/p.json'],
      { cwd: '/host-worker', env: { FB_SESSION_FILE: '/host-worker/.fb-session.json' } as unknown as NodeJS.ProcessEnv });

    expect(await outcome(child)).toEqual({ code: 0, stdout: 'GROUP_BOT_RESULT:{"success":true}\n' });
    expect(bridge.requests[0]).toEqual({ auth: 'Bearer secret', body: {
      args: ['post', '--payload-file', '/host-worker/.group-bot-io/p.json'],
      containerWorkerDir: '/host-worker', sessionFile: '/host-worker/.fb-session.json' } });
  });

  it('names the shared worker folder from WORKER_DIR, as the container is configured', async () => {
    const bridge = await hostBridge(() => ({ code: 0, stdout: '', stderr: '' }));
    vi.stubEnv('GROUP_BOT_WORKER_DIR', '');
    vi.stubEnv('WORKER_DIR', '/host-worker');

    await outcome(spawnGroupBot('node', ['post', '--payload-file', '/host-worker/.group-bot-io/p.json'], { env: {} as NodeJS.ProcessEnv }));

    expect(bridge.requests[0].body.containerWorkerDir).toBe('/host-worker');
  });

  it('reports an unreachable host as a start failure, which the hub shows as such', async () => {
    vi.stubEnv('GROUP_BOT_BRIDGE_URL', 'http://127.0.0.1:1');
    const result = await outcome(spawnGroupBot('node', ['check'], { env: {} as NodeJS.ProcessEnv }));
    expect(result.error).toMatch(/Group Bot bridge unavailable/);
  });

  it('a refused command is a failure, not a silent success', async () => {
    const server = http.createServer((_req, res) => { res.writeHead(400, { 'content-type': 'application/json' }); res.end('{"error":"COMMAND_NOT_ALLOWED"}'); });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    servers.push(server);
    vi.stubEnv('GROUP_BOT_BRIDGE_URL', `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    expect((await outcome(spawnGroupBot('node', ['check'], { env: {} as NodeJS.ProcessEnv }))).error).toMatch(/HTTP 400: COMMAND_NOT_ALLOWED/);
  });

  it('kill() stops the bot on the host (the hub kills on its timeouts)', async () => {
    const bridge = await hostBridge(() => ({ code: 0, stdout: '', stderr: '' }), 5_000);
    const child = spawnGroupBot('node', ['login'], { env: {} as NodeJS.ProcessEnv });
    await vi.waitFor(() => expect(bridge.requests).toHaveLength(1));

    expect(child.kill()).toBe(true);

    expect(child.killed).toBe(true);
    await vi.waitFor(() => expect(bridge.closed).toHaveBeenCalled());
  });
});
