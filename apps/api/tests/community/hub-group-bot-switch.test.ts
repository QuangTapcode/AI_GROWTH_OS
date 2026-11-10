import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Pool } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SpawnBehavior = 'ignore-signal-update' | 'commit-new-session';

const mockChildControl: {
  behavior: SpawnBehavior;
  sessionFilePath: string;
  newCookieJson: string;
  spawnCount: number;
  execFileCalls: string[];
  activeTimers: ReturnType<typeof setInterval>[];
} = {
  behavior: 'ignore-signal-update',
  sessionFilePath: '',
  newCookieJson: '',
  spawnCount: 0,
  execFileCalls: [],
  activeTimers: [],
};

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    execFile: vi.fn((_cmd: string, args: string[], _opts: unknown, cb?: (err: null, stdout: string) => void) => {
      const encodedIdx = Array.isArray(args) ? args.indexOf('-EncodedCommand') : -1;
      const decoded =
        encodedIdx !== -1 && args[encodedIdx + 1]
          ? Buffer.from(args[encodedIdx + 1], 'base64').toString('utf16le')
          : (args || []).join(' ');
      mockChildControl.execFileCalls.push(decoded);
      if (typeof cb === 'function') cb(null, 'NONE');
      return new EventEmitter() as unknown as ReturnType<typeof actual.execFile>;
    }),
    spawn: vi.fn((_cmd: string, args: string[]) => {
      mockChildControl.spawnCount += 1;
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter & { resume: () => void };
        stderr: EventEmitter & { resume: () => void };
        exitCode: number | null;
        killed: boolean;
        kill: () => boolean;
      };
      child.stdout = Object.assign(new EventEmitter(), { resume: vi.fn() });
      child.stderr = Object.assign(new EventEmitter(), { resume: vi.fn() });
      child.exitCode = null;
      child.killed = false;
      child.kill = () => {
        child.killed = true;
        child.exitCode = 1;
        return true;
      };

      const encodedIdx = Array.isArray(args) ? args.indexOf('-EncodedCommand') : -1;
      const decoded =
        encodedIdx !== -1 && args[encodedIdx + 1]
          ? Buffer.from(args[encodedIdx + 1], 'base64').toString('utf16le')
          : (args || []).join(' ');
      const sigMatch = decoded.match(/([^"'\s]+fb-login-done-[^"'\s]+\.sig)/);
      const signalPath = sigMatch?.[1]?.replace(/\\"/g, '"') ?? '';

      if (signalPath) {
        const timer = setInterval(() => {
          if (child.exitCode !== null || child.killed) {
            clearInterval(timer);
            return;
          }
          if (fs.existsSync(signalPath)) {
            clearInterval(timer);
            if (mockChildControl.behavior === 'commit-new-session' && mockChildControl.sessionFilePath) {
              const futureDate = new Date(Date.now() + 2000);
              fs.writeFileSync(mockChildControl.sessionFilePath, mockChildControl.newCookieJson, 'utf8');
              fs.utimesSync(mockChildControl.sessionFilePath, futureDate, futureDate);
              child.stdout.emit(
                'data',
                `${JSON.stringify({ success: true, adminName: 'Minh Tuấn' })}\n`
                  .replace(/^/, 'GROUP_BOT_RESULT:'),
              );
              child.exitCode = 0;
              child.emit('close', 0);
            } else {
              child.stdout.emit(
                'data',
                'GROUP_BOT_RESULT:{"success":false,"message":"Chưa phát hiện phiên mới."}\n',
              );
              child.exitCode = 1;
              child.emit('close', 1);
            }
          }
        }, 25);
        mockChildControl.activeTimers.push(timer);
      }

      return child as unknown as ReturnType<typeof actual.spawn>;
    }),
  };
});

import { CommunityHubService } from '../../src/modules/community/hub';

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';

describe('CommunityHubService switchGroupBotAccount (non-destructive switch & verification)', () => {
  const originalSessionFile = process.env.FB_SESSION_FILE;
  let tmpDir: string;
  let sessionFile: string;
  let pendingFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vitest-switch-bot-'));
    sessionFile = path.join(tmpDir, '.fb-session.json');
    pendingFile = `${sessionFile}.pending.tmp`;
    process.env.FB_SESSION_FILE = sessionFile;

    mockChildControl.spawnCount = 0;
    mockChildControl.execFileCalls = [];
    mockChildControl.behavior = 'ignore-signal-update';
    mockChildControl.sessionFilePath = sessionFile;

    const futureExp = Math.floor(Date.now() / 1000) + 7200;
    fs.writeFileSync(
      sessionFile,
      JSON.stringify({
        cookies: [
          { name: 'c_user', value: '1000111122223333', domain: '.facebook.com', expires: futureExp },
          { name: 'xs', value: 'old-secret-xs', domain: '.facebook.com', expires: futureExp },
        ],
      }),
      'utf8',
    );
    fs.writeFileSync(pendingFile, '{"cookies":[]}', 'utf8');

    mockChildControl.newCookieJson = JSON.stringify({
      cookies: [
        { name: 'c_user', value: '1000444455556666', domain: '.facebook.com', expires: futureExp },
        { name: 'xs', value: 'new-secret-xs-value', domain: '.facebook.com', expires: futureExp },
        { name: 'i_user', value: '61596152219999', domain: '.facebook.com', expires: futureExp },
      ],
    });
  });

  afterEach(() => {
    for (const t of mockChildControl.activeTimers) {
      clearInterval(t);
    }
    mockChildControl.activeTimers = [];
    vi.clearAllMocks();
    if (originalSessionFile === undefined) delete process.env.FB_SESSION_FILE;
    else process.env.FB_SESSION_FILE = originalSessionFile;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('preserves existing .fb-session.json on switch start, clears .pending.tmp, and only completes after verified session change', async () => {
    const dbCalls: { sql: string; params?: unknown[] }[] = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      dbCalls.push({ sql, params });
      if (sql.includes('SELECT group_url FROM community_hub_settings')) {
        return { rows: [{ group_url: 'https://www.facebook.com/groups/1134282109069209' }] };
      }
      return { rows: [], rowCount: 1 };
    });

    const service = new CommunityHubService({ query, connect: vi.fn() } as unknown as Pool);

    const startRes = await service.switchGroupBotAccount(WORKSPACE_ID);
    expect(startRes.started).toBe(true);
    expect(startRes.loginInProgress).toBe(true);
    expect(startRes.cliFallbackCommand).toBe('npm.cmd --prefix apps/worker run group-bot:switch');
    expect(fs.existsSync(sessionFile)).toBe(true);
    expect(fs.readFileSync(sessionFile, 'utf8')).toContain('1000111122223333');
    expect(fs.existsSync(pendingFile)).toBe(false);

    // If Edge closes/completes without saving a newer session, switch stays incomplete & keeps old session
    mockChildControl.behavior = 'ignore-signal-update';
    const staleComplete = await service.completeGroupBotLogin(WORKSPACE_ID);
    expect(staleComplete.completed).toBe(false);
    expect(staleComplete.cliFallbackCommand).toBe('npm.cmd --prefix apps/worker run group-bot:switch');
    expect(fs.existsSync(sessionFile)).toBe(true);
    expect(fs.readFileSync(sessionFile, 'utf8')).toContain('1000111122223333');

    // Now simulate user logging in & switching to new admin Page profile
    await service.switchGroupBotAccount(WORKSPACE_ID);
    mockChildControl.behavior = 'commit-new-session';
    const okComplete = await service.completeGroupBotLogin(WORKSPACE_ID);
    expect(okComplete.completed).toBe(true);
    expect(okComplete.session).toEqual({
      isLoggedIn: true,
      sessionSource: 'file',
      usingPageProfile: true,
      accountIdMask: '***9999',
    });
    expect(JSON.stringify(okComplete)).not.toContain('new-secret-xs-value');
    expect(JSON.stringify(okComplete)).not.toContain('61596152219999');

    const adminUpdate = dbCalls.find(
      (c) =>
        c.sql.includes('UPDATE community_hub_settings SET fb_admin_name = $2') &&
        c.params?.[1] === 'Minh Tuấn',
    );
    expect(adminUpdate).toBeTruthy();
  });
});

