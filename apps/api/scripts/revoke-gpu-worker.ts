import pool, { withTransaction } from "../src/lib/db";

/**
 * CLI script to revoke an existing GPU Worker in `gpu_workers` table.
 * Sets status to 'disabled' and records revoked_at timestamp.
 *
 * Usage:
 *   npx tsx scripts/revoke-gpu-worker.ts --id "<Worker UUID>"
 *   npx tsx scripts/revoke-gpu-worker.ts --name "<Worker Name>"
 *   npx tsx scripts/revoke-gpu-worker.ts "<Worker UUID or Name>"
 */
function parseArgs(args: string[]) {
  let identifier = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === "--id" || arg === "--name") && args[i + 1]) {
      identifier = args[++i];
    } else if (!arg.startsWith("--") && !identifier) {
      identifier = arg;
    }
  }

  return identifier.trim();
}

export async function revokeGpuWorker(identifier: string) {
  if (!identifier) {
    throw new Error("Worker ID or Name is required.");
  }

  const result = await withTransaction(async (client) => {
    await client.query("SET LOCAL app.is_worker_context = 'true'");
    const res = await client.query<{
      id: string;
      name: string;
      status: string;
      revoked_at: string;
    }>(
      `UPDATE gpu_workers
       SET status = 'disabled', revoked_at = NOW(), updated_at = NOW()
       WHERE (id::text = $1 OR name = $1) AND revoked_at IS NULL
       RETURNING id, name, status, revoked_at;`,
      [identifier]
    );
    return res.rows[0];
  });

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const identifier = parseArgs(args);

  if (!identifier) {
    console.error(`
Error: Worker ID or Name is required.

Usage:
  npx tsx scripts/revoke-gpu-worker.ts --id "<Worker UUID>"
  npx tsx scripts/revoke-gpu-worker.ts --name "<Worker Name>"
  npx tsx scripts/revoke-gpu-worker.ts "<Worker UUID or Name>"
`);
    process.exit(1);
  }

  const revoked = await revokeGpuWorker(identifier);

  if (!revoked) {
    // Check if worker exists but was already revoked
    const existing = await pool.query(
      `SELECT id, name, status, revoked_at FROM gpu_workers WHERE id::text = $1 OR name = $1`,
      [identifier]
    );
    if (existing.rows.length > 0) {
      console.warn(`[WARN] GPU Worker '${identifier}' was already revoked at ${existing.rows[0].revoked_at}`);
      return;
    }
    throw new Error(`GPU Worker '${identifier}' not found in database.`);
  }

  console.log(`
================================================================================
GPU WORKER REVOKED SUCCESSFULLY
================================================================================
Worker ID  : ${revoked.id}
Worker Name: ${revoked.name}
Status     : ${revoked.status}
Revoked At : ${revoked.revoked_at}
================================================================================
`);
}

if (process.argv[1]?.endsWith("revoke-gpu-worker.ts")) {
  main()
    .catch((err) => {
      console.error("[revoke-gpu-worker] Error:", err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

