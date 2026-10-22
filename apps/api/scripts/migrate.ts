import fs from "fs";
import path from "path";
import pool from "../src/lib/db";

async function runMigrations() {
  const isRollback = process.argv.includes("--down") || process.argv.includes("--rollback");
  console.log(isRollback ? "🔄 Starting database migration rollback..." : "🚀 Starting database migrations...");

  const migrationsDir = path.resolve(__dirname, "../../../database/migrations");

  if (!fs.existsSync(migrationsDir)) {
    console.error(`❌ Migrations directory not found at: ${migrationsDir}`);
    process.exit(1);
  }

  let files: string[];

  if (isRollback) {
    // Với rollback, chỉ lấy file .down.sql và chạy theo thứ tự giảm dần
    files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".down.sql"))
      .sort()
      .reverse();
  } else {
    // Với forward migration, chỉ lấy file .sql chuẩn (bỏ qua .down.sql) và chạy theo thứ tự tăng dần
    files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
      .sort();
  }

  if (files.length === 0) {
    console.log(isRollback ? "ℹ️ No rollback migration files found." : "ℹ️ No forward migration files found.");
    await pool.end();
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const file of files) {
      console.log(`⏳ Executing ${isRollback ? "rollback" : "migration"}: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");

      await client.query(sql);
      console.log(`✅ Applied: ${file}`);
    }

    await client.query("COMMIT");
    console.log(isRollback ? "🎉 Rollback completed successfully!" : "🎉 All migrations applied successfully!");
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
