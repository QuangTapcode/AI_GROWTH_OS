import fs from "fs";
import path from "path";
import pool from "../src/lib/db";

async function runMigrations() {
  console.log("🚀 Starting database migrations...");

  const migrationsDir = path.resolve(__dirname, "../../../database/migrations");

  if (!fs.existsSync(migrationsDir)) {
    console.error(`❌ Migrations directory not found at: ${migrationsDir}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("ℹ️ No migration files found.");
    await pool.end();
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const file of files) {
      console.log(`⏳ Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8");

      await client.query(sql);
      console.log(`✅ Applied: ${file}`);
    }

    await client.query("COMMIT");
    console.log("🎉 All migrations applied successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Migration failed! Rolled back transaction.", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
