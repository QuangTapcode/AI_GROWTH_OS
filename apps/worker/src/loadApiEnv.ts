import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Automatically load shared local credentials from apps/api/.env.local and apps/api/.env
 * when the worker is started directly (e.g. `npm run dev` or `npx tsx src/draft-main.ts`)
 * without explicit `--env-file` flags. Skipped under Vitest so unit tests remain isolated.
 */
if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
  const candidates = [
    resolve(__dirname, '../../api/.env.local'),
    resolve(__dirname, '../../api/.env'),
    resolve(__dirname, '../../../.env'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
  if (process.env.AUTOPILOT === undefined) {
    process.env.AUTOPILOT = '1';
  }
  if (process.env.API_BASE_URL === undefined) {
    process.env.API_BASE_URL = 'http://127.0.0.1:4000';
  }
  if (process.env.AI_SERVICE_BASE_URL === undefined) {
    process.env.AI_SERVICE_BASE_URL = 'http://127.0.0.1:5000';
  }
  if (process.env.AI_PROVIDER_MODE === undefined && process.env.DATABASE_URL) {
    process.env.AI_PROVIDER_MODE = 'live';
  }
}
