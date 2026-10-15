import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, createWriteStream } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const suite = fileURLToPath(new URL("../", import.meta.url));
const repo = path.resolve(suite, "../..");
const mode = process.argv[2] ?? "--all";
if (!["--all", "--unit", "--db", "--checks", "--ai", "--ai-live"].includes(mode) || process.argv.length > 3) {
  console.error("Usage: node scripts/run.mjs [--all|--unit|--db|--checks|--ai|--ai-live]");
  process.exit(2);
}
if (existsSync(path.join(suite, ".env"))) process.loadEnvFile(path.join(suite, ".env"));
const runId = new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomBytes(3).toString("hex");
const evidence = path.join(suite, "results", runId);
await mkdir(evidence, { recursive: true });
function git(...args) {
  const result = spawnSync("git", ["-c", `safe.directory=${repo}`, ...args], { cwd: repo, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}
const report = {
  run_id: runId, started_at: new Date().toISOString(), mode,
  commit: git("rev-parse", "HEAD"), branch: git("branch", "--show-current"),
  working_tree_dirty: git("status", "--porcelain") !== "", node: process.version,
  boundaries: {
    database: ["--all", "--db"].includes(mode) ? "disposable PostgreSQL" : "not_used",
    api_routes: ["--all", "--db"].includes(mode) ? "in-process handlers" : "not_used",
    unit: ["--all", "--unit"].includes(mode) ? "existing mocks/fakes" : "not_used",
    ai: mode === "--ai" ? "fake provider" : mode === "--ai-live" ? "local Ollama" : "not_used",
  },
  stages: [], cleanup: "not_needed",
};
async function runStage(id, cwd, args, env = {}, executable = process.execPath) {
  console.log(`\n[${id}] ${path.basename(executable)} ${args.map(a => path.basename(a)).join(" ")}`);
  const log = createWriteStream(path.join(evidence, id + ".log"));
  const result = await new Promise(resolve => {
    const child = spawn(executable, args, { cwd, env: { ...process.env, ...env }, windowsHide: true });
    child.stdout.on("data", chunk => { process.stdout.write(chunk); log.write(chunk); });
    child.stderr.on("data", chunk => { process.stderr.write(chunk); log.write(chunk); });
    child.on("error", error => { log.write(error.message); resolve({ exit_code: 1, error: error.message }); });
    child.on("close", (code, signal) => resolve({ exit_code: code ?? 1, signal }));
  });
  await new Promise(resolve => log.end(resolve));
  const jsonPath = path.join(evidence, id + ".json");
  const testReport = existsSync(jsonPath) ? JSON.parse(await readFile(jsonPath, "utf8")) : null;
  report.stages.push({ id, ...result, log: id + ".log", ...(testReport?.numTotalTests === undefined ? {} : {
    tests: { total: testReport.numTotalTests, passed: testReport.numPassedTests, failed: testReport.numFailedTests, pending: testReport.numPendingTests },
  }) });
  return result.exit_code === 0;
}
function vitestArgs(root, tests, name) {
  return [path.join(root, "node_modules/vitest/vitest.mjs"), "run", ...tests,
    "--reporter=default", "--reporter=json", `--outputFile=${path.join(evidence, name + ".json")}`];
}
let ok = true;
let admin;
let database;
try {
  if (mode === "--all" || mode === "--unit") {
    const api = path.join(repo, "apps/api");
    const worker = path.join(repo, "apps/worker");
    ok = await runStage("api-unit", api, vitestArgs(api, ["tests/leads", "tests/publicContent", "tests/integrations"], "api-unit")) && ok;
    ok = await runStage("worker-unit", worker, vitestArgs(worker, [], "worker-unit")) && ok;
  }
  if (mode === "--all" || mode === "--db") {
    if (!process.env.QQ_PG_ADMIN_URL) throw new Error("Set QQ_PG_ADMIN_URL or copy .env.example to .env and configure the local PostgreSQL account.");
    const url = new URL(process.env.QQ_PG_ADMIN_URL);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
      throw new Error("QQ_PG_ADMIN_URL must point to local PostgreSQL; this runner only manages disposable local databases.");
    }
    admin = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
    await admin.connect();
    const name = "qq_test_" + Date.now() + "_" + randomBytes(3).toString("hex");
    await admin.query(`CREATE DATABASE "${name}"`);
    database = name;
    report.database = { name, host: url.hostname, port: url.port || "5432" };
    report.cleanup = "pending";
    url.pathname = "/" + name;
    const connection = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
    try {
      await connection.connect();
      await connection.query("BEGIN");
      const migrationDir = path.join(repo, "database/migrations");
      const files = (await readdir(migrationDir)).filter(f => f.endsWith(".sql")).sort();
      if (files.length === 0) throw new Error("No committed SQL migrations found.");
      for (const file of files) await connection.query(await readFile(path.join(migrationDir, file), "utf8"));
      await connection.query("COMMIT");
      report.stages.push({ id: "QQ-DB-001", exit_code: 0, migrations: files });
    } catch (error) {
      await connection.query("ROLLBACK").catch(() => {});
      report.stages.push({ id: "QQ-DB-001", exit_code: 1, error: error.message });
      throw error;
    } finally { await connection.end(); }
    ok = await runStage("be-integration", suite, vitestArgs(suite, [], "be-integration"), {
      DATABASE_URL: url.href, QQ_TEST_DATABASE: name, NODE_ENV: "test",
    }) && ok;
  }
  if (mode === "--checks") {
    const api = path.join(repo, "apps/api");
    const worker = path.join(repo, "apps/worker");
    for (const [id, root, args] of [
      ["QQ-CHECK-001", api, ["node_modules/eslint/bin/eslint.js", "."]],
      ["QQ-CHECK-002", api, ["node_modules/typescript/bin/tsc", "--noEmit"]],
      ["QQ-CHECK-003", api, ["node_modules/next/dist/bin/next", "build"]],
      ["QQ-CHECK-004", worker, ["node_modules/typescript/bin/tsc", "--noEmit", "-p", "tsconfig.test.json"]],
      ["QQ-CHECK-005", worker, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json"]],
    ]) ok = await runStage(id, root, args, { NEXT_TELEMETRY_DISABLED: "1" }) && ok;
  }
  if (mode === "--ai" || mode === "--ai-live") {
    const python = process.env.QQ_PYTHON || "python";
    report.python_executable = python;
    if (mode === "--ai") {
      ok = await runStage("ai-unit", repo, ["-m", "pytest", "services/ai/tests", "-q", `--junitxml=${path.join(evidence, "ai-unit.xml")}`],
        { PYTHONIOENCODING: "utf-8" }, python) && ok;
    } else {
      ok = await runStage("ai-live", path.join(repo, "services/ai"), ["-m", "evals.run_eval", "--mode", "live", "--out", path.join(evidence, "ai-live.json")],
        { PYTHONIOENCODING: "utf-8" }, python) && ok;
    }
  }
} catch (error) {
  ok = false;
  console.error(error.message);
  report.stages.push({ id: "runner", exit_code: 1, error: error.message });
} finally {
  if (database) {
    try {
      // This name is generated only after successful CREATE DATABASE, never supplied by a caller.
      if (!/^qq_test_\d+_[0-9a-f]{6}$/.test(database)) throw new Error("Unexpected disposable database name");
      await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
      report.cleanup = "passed";
    } catch (error) { ok = false; report.cleanup = "failed"; report.cleanup_error = error.message; }
  }
  if (admin) await admin.end().catch(() => {});
  report.finished_at = new Date().toISOString();
  report.passed = ok;
  await writeFile(path.join(evidence, "summary.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`\nQQ_test: ${ok ? "PASSED" : "FAILED"}. Evidence: ${evidence}`);
  process.exitCode = ok ? 0 : 1;
}
