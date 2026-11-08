import fs from "node:fs";
import path from "node:path";
import { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

function resolveConnectionString(): string {
  const raw =
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:15432/ai_growth_os";
  // When running against the local Docker Postgres (:15432), automatically sync the password
  // from infra/local/.env if present so copying apps/api/.env.local across machines never fails auth.
  if (raw.includes(":15432/")) {
    const candidates = [
      path.resolve(process.cwd(), "infra/local/.env"),
      path.resolve(process.cwd(), "../../infra/local/.env"),
      path.resolve(__dirname, "../../../../infra/local/.env"),
    ];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      try {
        const content = fs.readFileSync(candidate, "utf8");
        const match = content.match(/^POSTGRES_PASSWORD=(.+)$/m);
        const password = match?.[1]?.trim();
        if (password) {
          const parsed = new URL(raw);
          parsed.password = password;
          return parsed.toString();
        }
      } catch {
        // Fall back to raw DATABASE_URL
      }
    }
  }
  return raw;
}

const connectionString = resolveConnectionString();

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client", err);
});

/**
 * Execute a parameterized SQL query
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const res = await pool.query<T>(text, params);
  const duration = Date.now() - start;

  if (process.env.NODE_ENV === "development") {
    console.log(`[SQL Query] (${duration}ms) ${text}`);
  }
  return res;
}

/**
 * Execute a callback within an isolated PostgreSQL transaction
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Test database connection readiness
 */
export async function testDbConnection(): Promise<boolean> {
  try {
    const res = await pool.query("SELECT 1 AS alive");
    return res.rowCount === 1;
  } catch (error) {
    console.error("Database connection check failed:", error);
    return false;
  }
}

export default pool;
