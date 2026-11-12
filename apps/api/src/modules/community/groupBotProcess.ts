/**
 * Runs the Facebook Group Bot (apps/worker runFacebookGroupBot) for the community hub.
 *
 * On the Windows host the API spawns it directly. In the API container (GROUP_BOT_BRIDGE_URL set)
 * it cannot: Edge and the saved session live on the host, so the command goes to the worker's Group
 * Bot bridge, and the result comes back through the same ChildProcess-like events.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';

export const groupBotBridgeUrl = () => process.env.GROUP_BOT_BRIDGE_URL?.trim() || null;


class BridgedBot extends EventEmitter {
  stdout = new EventEmitter() as ChildProcess['stdout'];
  stderr = new EventEmitter() as ChildProcess['stderr'];
  exitCode: number | null = null;
  killed = false;
  private readonly controller = new AbortController();

  constructor(url: string, args: string[], sessionFile: string | undefined) {
    super();
    void fetch(`${url.replace(/\/+$/, '')}/group-bot/run`, {
      method: 'POST',
      signal: this.controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.AUTOMATION_INTERNAL_TOKEN ?? ''}` },
      // Where apps/worker is mounted in this container (compose sets WORKER_DIR); the bridge maps it to the host.
      body: JSON.stringify({ args, containerWorkerDir: process.env.GROUP_BOT_WORKER_DIR?.trim() || process.env.WORKER_DIR?.trim(), sessionFile }),
    }).then(async (response) => {
      const result = (await response.json()) as { code?: number | null; stdout?: string; stderr?: string; spawnErr?: string; error?: string };
      if (!response.ok) throw new Error(`Group Bot bridge HTTP ${response.status}: ${result.error ?? ''}`);
      if (result.stdout) this.stdout!.emit('data', Buffer.from(result.stdout));
      if (result.stderr) this.stderr!.emit('data', Buffer.from(result.stderr));
      if (result.spawnErr) throw new Error(result.spawnErr);
      this.exitCode = result.code ?? null;
      this.emit('exit', this.exitCode, null);
      this.emit('close', this.exitCode, null);
    }).catch((error: Error) => {
      if (this.killed) return;
      this.emit('error', new Error(`Group Bot bridge unavailable: ${error.message}`));
    });
  }

  kill() {
    if (this.killed || this.exitCode !== null) return false;
    this.killed = true;
    this.controller.abort();
    this.emit('exit', null, 'SIGTERM');
    this.emit('close', null, 'SIGTERM');
    return true;
  }
}

/** Same call shape as child_process.spawn for runFacebookGroupBot. */
export function spawnGroupBot(command: string, args: string[], options: SpawnOptions): ChildProcess {
  const url = groupBotBridgeUrl();
  if (!url) return spawn(command, args, options);
  return new BridgedBot(url, args, options.env?.FB_SESSION_FILE) as unknown as ChildProcess;
}

/** Folder for files the bot reads (payloads, the login "done" signal); shared with the host in the container. */
export function groupBotTmpDir(): string {
  const shared = process.env.GROUP_BOT_SHARED_DIR?.trim();
  if (!shared) return os.tmpdir();
  fs.mkdirSync(shared, { recursive: true });
  return shared;
}
