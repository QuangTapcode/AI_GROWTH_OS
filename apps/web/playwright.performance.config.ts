import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
const database = process.env.PERFORMANCE_TEST_DATABASE_URL;
if (!database || new URL(database).pathname !== '/performance_test' || !['localhost','127.0.0.1'].includes(new URL(database).hostname)) {
  throw new Error('Set PERFORMANCE_TEST_DATABASE_URL to the dedicated local performance_test database');
}
const shared = { DATABASE_URL: database, APP_ENV: 'test', INTEGRATION_MODE: 'fake', AUTOPILOT: '0',
  AUTH_SECRET: 'performance_browser_synthetic_secret_2026', NEXT_TELEMETRY_DISABLED: '1', NEXT_BUILD_DIR: '.next/performance',
  PUBLIC_SITES_JSON: JSON.stringify([{ site_id: 'performance-browser', workspace_id: 'f1000000-0000-4000-8000-000000000001', timezone: 'UTC', status: 'active' }]),
  CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:3018,http://127.0.0.1:3019' };
export default defineConfig({
  testDir: './tests/performance', workers: 1, timeout: 120000, retries: 0,
  expect: { timeout: 30000 },
  globalSetup: '../../qa/performance/seed-browser.mjs',
  use: { browserName: 'chromium', headless: true, trace: 'retain-on-failure' },
  webServer: [
    { command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 4019', cwd: resolve(__dirname,'../api'), url: 'http://127.0.0.1:4019/health', env: shared, timeout: 120000, reuseExistingServer: false },
    { command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3018', url: 'http://127.0.0.1:3018/login', env: { ...shared, NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4019/v1' }, timeout: 120000, reuseExistingServer: false },
    { command: 'node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3019', cwd: resolve(__dirname,'../pilot'), url: 'http://127.0.0.1:3019/', env: { ...shared, NEXT_PUBLIC_API_BASE_URL: 'http://127.0.0.1:4019/v1', NEXT_PUBLIC_SITE_ID: 'performance-browser' }, timeout: 120000, reuseExistingServer: false },
  ],
});
