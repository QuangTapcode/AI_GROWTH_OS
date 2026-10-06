import { Pool, QueryResult, QueryResultRow } from "pg";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:15432/ai_growth_os";

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
