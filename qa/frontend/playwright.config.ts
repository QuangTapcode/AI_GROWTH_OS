import { defineConfig } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: "./test-results",
  use: {
    browserName: "chromium",
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node mock-public-api.mjs",
      cwd: __dirname,
      url: "http://127.0.0.1:4317/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "npm.cmd run dev",
      cwd: path.resolve(__dirname, "../../apps/web"),
      url: "http://127.0.0.1:3000/login",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3011",
      cwd: path.resolve(__dirname, "../../apps/pilot"),
      url: "http://127.0.0.1:3011",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:4317/v1",
        NEXT_PUBLIC_SITE_ID: "tripc-pilot",
        NEXT_DIST_DIR: ".next-qa",
      },
    },
  ],
});
