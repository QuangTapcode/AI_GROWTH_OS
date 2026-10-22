import pool from "../src/lib/db";

/** Print synthetic local/staging accounts; never expose this through HTTP. */
async function main() {
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
    throw new Error("Refusing to print demo credentials in production");
  }
  const result = await pool.query<{
    email: string;
    role: string;
    workspace: string;
    password: string;
  }>(
    `SELECT d.email, d.role, w.name AS workspace, d.password_value AS password
     FROM demo_login_accounts d
     INNER JOIN workspaces w ON w.id = d.workspace_id
     WHERE d.is_active = TRUE
     ORDER BY w.name, d.role, d.email`
  );
  if (result.rowCount === 0) {
    console.log("No demo accounts found. Run npm run db:seed first.");
    return;
  }
  console.table(result.rows);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
