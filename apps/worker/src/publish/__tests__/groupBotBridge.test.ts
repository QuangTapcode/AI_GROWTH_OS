import { EventEmitter } from 'node:events';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startGroupBotBridge, type BridgeSpawn } from '../GroupBotBridge';

/** A bot process that prints `stdout` and exits with `code` once started. */
function fakeBot(stdout: string, code = 0) {
  const calls: { command: string; args: string[]; cwd?: string; env?: NodeJS.ProcessEnv }[] = [];
  const spawn: BridgeSpawn = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd, env: options.env });
    const child = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(() => true),
    });
    setTimeout(() => { child.stdout.emit('data', Buffer.from(stdout)); child.emit('close', code); }, 5);
    return child as unknown as ReturnType<BridgeSpawn>;
  };
  return { spawn, calls };
}

const servers: { close(): void }[] = [];
afterEach(() => { servers.splice(0).forEach((s) => s.close()); });

async function bridge(spawn: BridgeSpawn) {
  const server = await startGroupBotBridge({ port: 0, token: 'secret', workerDir: 'D:\\repo\\apps\\worker', spawn });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const run = (base: string, body: unknown, token = 'secret') => fetch(`${base}/group-bot/run`, {
  method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body),
});

describe('Group Bot bridge (host side of the API container)', () => {
  it('runs an allowed bot command on the host and returns its output and exit code', async () => {
    const bot = fakeBot('GROUP_BOT_RESULT:{"success":true}\n');
    const base = await bridge(bot.spawn);

    const res = await run(base, { args: ['check'] });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: 0, stdout: 'GROUP_BOT_RESULT:{"success":true}\n', stderr: '' });
    expect(bot.calls).toHaveLength(1);
    expect(bot.calls[0].args.slice(-1)).toEqual(['check']);
    expect(bot.calls[0].cwd).toBe('D:\\repo\\apps\\worker');
  });

  it('refuses a caller without the internal token and runs nothing', async () => {
    const bot = fakeBot('');
    const base = await bridge(bot.spawn);

    expect((await run(base, { args: ['check'] }, 'wrong')).status).toBe(401);
    expect((await fetch(`${base}/group-bot/run`, { method: 'POST', body: '{"args":["check"]}' })).status).toBe(401);
    expect(bot.calls).toHaveLength(0);
  });

  it('only runs the bot commands the API uses', async () => {
    const bot = fakeBot('');
    const base = await bridge(bot.spawn);

    for (const args of [['clear-session'], ['--import', 'evil.js'], [], 'check']) {
      expect((await run(base, { args })).status).toBe(400);
    }
    expect(bot.calls).toHaveLength(0);
  });

  it("reads the API's payload and session files through the shared worker folder", async () => {
    const bot = fakeBot('');
    const base = await bridge(bot.spawn);

    await run(base, {
      args: ['post', '--group-url', 'https://www.facebook.com/groups/1', '--payload-file', '/host-worker/.group-bot-io/post-1.json'],
      containerWorkerDir: '/host-worker',
      sessionFile: '/host-worker/.fb-session.json',
    });

    expect(bot.calls[0].args.slice(-5)).toEqual(['post', '--group-url', 'https://www.facebook.com/groups/1',
      '--payload-file', path.join('D:\\repo\\apps\\worker', '.group-bot-io', 'post-1.json')]);
    expect(bot.calls[0].env?.FB_SESSION_FILE).toBe(path.join('D:\\repo\\apps\\worker', '.fb-session.json'));
  });

  it('stops the bot when the API gives up on the request', async () => {
    const kill = vi.fn(() => true);
    const spawn: BridgeSpawn = () => Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill }) as unknown as ReturnType<BridgeSpawn>;
    const base = await bridge(spawn);
    const controller = new AbortController();

    const pending = fetch(`${base}/group-bot/run`, { method: 'POST', signal: controller.signal,
      headers: { authorization: 'Bearer secret' }, body: JSON.stringify({ args: ['login'] }) }).catch(() => undefined);
    await vi.waitFor(() => expect(kill).not.toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 30));
    controller.abort();
    await pending;

    await vi.waitFor(() => expect(kill).toHaveBeenCalled());
  });

  it('refuses a container path it cannot map, instead of letting the bot read a wrong host path', async () => {
    const bot = fakeBot('');
    const base = await bridge(bot.spawn);

    const res = await run(base, { args: ['post', '--payload-file', '/host-worker/.group-bot-io/p.json'] });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'PATH_NOT_SHARED', path: '/host-worker/.group-bot-io/p.json' });
    expect(bot.calls).toHaveLength(0);
  });

  it('never maps a path outside the shared worker folder', async () => {
    const bot = fakeBot('');
    const base = await bridge(bot.spawn);
    const res = await run(base, { args: ['post', '--payload-file', '/host-worker/../../secrets.json'], containerWorkerDir: '/host-worker' });
    expect(res.status).toBe(400);
    expect(bot.calls).toHaveLength(0);
  });
});
