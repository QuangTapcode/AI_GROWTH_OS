import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";

// Ensure DATABASE_URL is set from .env.local if not already defined in environment
if (!process.env.DATABASE_URL) {
  const envLocalPath = path.resolve(__dirname, ".env.local");
  if (fs.existsSync(envLocalPath)) {
    const lines = fs.readFileSync(envLocalPath, "utf-8").split("\n");
    for (const line of lines) {
      const match = line.match(/^DATABASE_URL=(.+)$/);
      if (match) {
        process.env.DATABASE_URL = match[1].trim().replace(/^['"]|['"]$/g, "");
        break;
      }
    }
  }
}

export default defineConfig({
  // Same "@/" alias as tsconfig, so route handlers can be imported in tests.
  resolve: { alias: [{ find: /^@\//, replacement: path.resolve(__dirname, "src") + "/" }] },
  test: {
    include: ["tests/**/*.test.ts"],
    pool: "threads",
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 1,
      },
    },
  },
});
