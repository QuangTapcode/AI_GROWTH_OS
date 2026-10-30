import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',

  /* Trỏ thư mục chứa kết quả test/bằng chứng ra ngoài dùng chung */
  outputDir: '../evidence/test-results',

  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  // @ts-ignore
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  // @ts-ignore
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  // @ts-ignore
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. 'open: never' để không giữ terminal sau khi chạy xong */
  reporter: [['html', { open: 'never' }]],

  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL của Next.js CMS */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Tự động lưu bằng chứng khi test tạch */
    screenshot: 'only-on-failure',
    video: 'off',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },

    /* Tạm thời tắt Firefox và WebKit để chạy nhanh hơn trong Tuần 1 */
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    //
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Tự khởi động CMS Next.js trước khi chạy test (tắt mặc định để chạy e2e linh hoạt) */
  // webServer: {
  //   command: 'npm run dev',
  //   cwd: path.resolve(__dirname, '../../apps/web'),
  //   url: 'http://localhost:3000/login',
  //   reuseExistingServer: true,
  //   timeout: 120_000,
  //   stdout: 'pipe',
  //   stderr: 'pipe',
  // },
});