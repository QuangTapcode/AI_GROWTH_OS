import pool, { withTransaction } from "../src/lib/db";
import { generateWorkerToken } from "../src/modules/gpuWorkers/auth";

/**
 * CLI script to create a new GPU Worker entry in `gpu_workers` table
 * and output its secret token EXACTLY ONCE.
 *
 * Usage:
 *   npx tsx scripts/create-gpu-worker.ts --name "RTX 4090 Station 1" [--vram 24576] [--model "a327ebf7..."]
 *   npx tsx scripts/create-gpu-worker.ts "RTX 4090 Station 1"
 */
function parseArgs(args: string[]) {
  let name = "";
  let vramMb: number | null = null;
  let modelKey: string | null = null;
  let workerVersion: string | null = "1.0.0";
  let engineVersion: string | null = "1.0.0";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--name" && args[i + 1]) {
      name = args[++i];
    } else if (arg === "--vram" && args[i + 1]) {
      vramMb = parseInt(args[++i], 10);
    } else if (arg === "--model" && args[i + 1]) {
      modelKey = args[++i];
    } else if (arg === "--worker-version" && args[i + 1]) {
      workerVersion = args[++i];
    } else if (arg === "--engine-version" && args[i + 1]) {
      engineVersion = args[++i];
    } else if (!arg.startsWith("--") && !name) {
      name = arg;
    }
  }

  return { name: name.trim(), vramMb, modelKey, workerVersion, engineVersion };
}

export async function createGpuWorker(params: {
  name: string;
  vramMb?: number | null;
  modelKey?: string | null;
  workerVersion?: string | null;
  engineVersion?: string | null;
}) {
  if (!params.name) {
    throw new Error("Worker name is required. Specify via --name <name> or as first argument.");
  }

  const { rawToken, tokenHash } = generateWorkerToken();

  const workerRow = await withTransaction(async (client) => {
    await client.query("SET LOCAL app.is_worker_context = 'true'");
    const res = await client.query<{
      id: string;
      name: string;
      status: string;
      created_at: string;
    }>(
      `INSERT INTO gpu_workers (
         name, token_hash, status, model_key, vram_free_mb,
         worker_version, engine_version, created_at, updated_at
       ) VALUES (
         $1, $2, 'offline', $3, $4, $5, $6, NOW(), NOW()
       )
       RETURNING id, name, status, created_at;`,
      [
        params.name,
        tokenHash,
        params.modelKey || null,
        params.vramMb ?? null,
        params.workerVersion || null,
        params.engineVersion || null,
      ]
    );
    return res.rows[0];
  });

  return { worker: workerRow, rawToken };
}

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (!parsed.name) {
    console.error(`
Error: Worker name is missing.

Usage:
  npx tsx scripts/create-gpu-worker.ts --name "<Worker Name>" [--vram <MB>] [--model "<Model Key>"]
  npx tsx scripts/create-gpu-worker.ts "RTX 4090 Station 1"
`);
    process.exit(1);
  }

  const { worker, rawToken } = await createGpuWorker(parsed);

  console.log(`
================================================================================
GPU WORKER CREATED SUCCESSFULLY
================================================================================
Worker ID  : ${worker.id}
Worker Name: ${worker.name}
Status     : ${worker.status}
Created At : ${worker.created_at}
--------------------------------------------------------------------------------
[CRITICAL SECRET] GPU Worker Token (PRINTED ONCE - STORE SECURELY):
${rawToken}
--------------------------------------------------------------------------------
Worker machine configuration (.env):
GPU_WORKER_ID=${worker.id}
GPU_WORKER_SECRET_TOKEN=${rawToken}
================================================================================
`);
}

if (process.argv[1]?.endsWith("create-gpu-worker.ts")) {
  main()
    .catch((err) => {
      console.error("[create-gpu-worker] Error:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

