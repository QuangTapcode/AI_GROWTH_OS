/**
 * Group Bot bridge: the API runs in a Linux container, but the Facebook Group Bot drives Microsoft
 * Edge with the owner's saved session, which exist only on this Windows host. The API sends each
 * bot command here and gets the bot's output back, exactly as if it had spawned the bot itself.
 */
import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';

export type BridgeSpawn = (command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; windowsHide: boolean }) => Pick<ChildProcess, 'stdout' | 'stderr' | 'kill' | 'on'>;

export type GroupBotBridgeOptions = {
  port: number;
  token: string;
  /** apps/worker on this host. */
  workerDir: string;
  spawn?: BridgeSpawn;
};

/** The runFacebookGroupBot commands the API issues; anything else is refused. */
const BOT_COMMANDS = new Set(['check', 'login', 'post', 'delete', 'invite', 'scan-comments', 'scan-stats']);

function botCommand(workerDir: string): { command: string; prefix: string[] } {
  return { command: process.execPath, prefix: [path.join(workerDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
    path.join(workerDir, 'src', 'publish', 'runFacebookGroupBot.ts')] };
}

export function startGroupBotBridge(options: GroupBotBridgeOptions): Promise<http.Server> {
  const spawn = options.spawn ?? (nodeSpawn as unknown as BridgeSpawn);
  const bot = botCommand(options.workerDir);
  const server = http.createServer((req, res) => {
    const reply = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (!options.token || req.headers.authorization !== `Bearer ${options.token}`) return reply(401, { error: 'UNAUTHORIZED' });
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      let body: { args?: unknown; containerWorkerDir?: unknown; sessionFile?: unknown };
      try { body = JSON.parse(raw || '{}'); } catch { return reply(400, { error: 'INVALID_JSON' }); }
      const { args } = body;
      if (!Array.isArray(args) || !args.every((a) => typeof a === 'string') || !BOT_COMMANDS.has(args[0])) {
        return reply(400, { error: 'COMMAND_NOT_ALLOWED' });
      }
      // The API sees apps/worker mounted at containerWorkerDir; its file paths are the same files here.
      const prefix = typeof body.containerWorkerDir === 'string' ? body.containerWorkerDir.replace(/\/+$/, '') : '';
      const shared = (value: string) => Boolean(prefix) && (value === prefix || value.startsWith(`${prefix}/`));
      const toHost = (value: string) => shared(value)
        ? path.join(options.workerDir, ...value.slice(prefix.length).split('/').filter(Boolean)) : value;
      const paths = [...args, ...(typeof body.sessionFile === 'string' ? [body.sessionFile] : [])];
      if (paths.some((value) => (shared(value) || value.startsWith('/')) && value.split('/').includes('..'))) {
        return reply(400, { error: 'PATH_OUTSIDE_WORKER' });
      }
      // A container path (/...) is never a valid Windows path; if it is not under the shared folder the
      // bot would open e.g. D:\host-worker\..., so say so instead.
      const unmapped = paths.find((value) => value.startsWith('/') && !shared(value));
      if (unmapped) return reply(400, { error: 'PATH_NOT_SHARED', path: unmapped });
      const env = { ...process.env };
      if (typeof body.sessionFile === 'string') env.FB_SESSION_FILE = toHost(body.sessionFile);
      const child = spawn(bot.command, [...bot.prefix, ...args.map(toHost)], { cwd: options.workerDir, env, windowsHide: true });
      let stdout = '', stderr = '', done = false;
      child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('error', (error: Error) => { if (!done) { done = true; reply(200, { code: 1, stdout, stderr, spawnErr: error.message }); } });
      child.on('close', (code: number | null) => { if (!done) { done = true; reply(200, { code, stdout, stderr }); } });
      // The API timed out or cancelled (e.g. a login it no longer waits for): stop the bot and its Edge.
      res.on('close', () => { if (!done) { done = true; child.kill(); } });
    });
  });
  return new Promise((resolve) => server.listen(options.port, '127.0.0.1', () => resolve(server)));
}
