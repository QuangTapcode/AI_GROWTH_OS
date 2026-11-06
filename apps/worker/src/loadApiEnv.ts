import fs from 'node:fs';
import path from 'node:path';

/**
 * Automatically loads environment variables from `apps/api/.env.local` (and fallback `.env` files)
 * as the single source of truth so starting the worker via `npm run dev`, `npm start`, or `npx tsx`
 * works out-of-the-box without discrepancies across env files.
 *
 * Skipped during automated unit tests (`VITEST` or `NODE_ENV=test`) so unit tests remain isolated.
 */
function loadApiEnvIfNeeded(): void {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') {
    return;
  }

  const candidates = [
    path.resolve(__dirname, '../../api/.env.local'),
    path.resolve(__dirname, '../../api/.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '../.env'),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = line.slice(0, eqIdx).trim();
        let val = line.slice(eqIdx + 1).trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        if (!val) continue;
        const existing = process.env[key]?.trim();
        if (!existing) {
          process.env[key] = val;
        }
      }
    } catch {
      // Ignore unreadable env file
    }
  }

  // Sync local Docker Postgres password (:15432) from infra/local/.env if present so copying
  // apps/api/.env.local to another machine with a different generated Docker password still connects.
  const infraEnvPath = path.resolve(__dirname, '../../../infra/local/.env');
  if (
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL.includes(':15432/') &&
    fs.existsSync(infraEnvPath)
  ) {
    try {
      const infraContent = fs.readFileSync(infraEnvPath, 'utf8');
      const match = infraContent.match(/^POSTGRES_PASSWORD=(.+)$/m);
      const localPgPassword = match?.[1]?.trim();
      if (localPgPassword) {
        const parsed = new URL(process.env.DATABASE_URL);
        parsed.password = localPgPassword;
        process.env.DATABASE_URL = parsed.toString();
        if (!process.env.QUEUE_PASSWORD) {
          process.env.QUEUE_PASSWORD = localPgPassword;
        }
      }
    } catch {
      // Ignore URL parse error
    }
  }

  // Default to AUTOPILOT=1 and local service URLs when running the worker outside of tests
  if (!process.env.AUTOPILOT) {
    process.env.AUTOPILOT = '1';
  }
  if (!process.env.API_BASE_URL) {
    process.env.API_BASE_URL = `http://127.0.0.1:${process.env.PORT || '4000'}`;
  }
  if (!process.env.AI_SERVICE_BASE_URL) {
    process.env.AI_SERVICE_BASE_URL = process.env.INTERNAL_AI_URL || 'http://127.0.0.1:5000';
  }
  if (!process.env.AI_PROVIDER_MODE) {
    process.env.AI_PROVIDER_MODE = 'live';
  }
}

loadApiEnvIfNeeded();
