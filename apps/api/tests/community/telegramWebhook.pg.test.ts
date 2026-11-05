import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const holder = vi.hoisted(() => ({ db: undefined as unknown as { query: (...args: unknown[]) => unknown } }));
vi.mock("@/lib/db", () => ({ default: { query: (...args: unknown[]) => holder.db.query(...args) } }));

describe.skipIf(process.env.RUN_AUTOMATION_DB !== "1")("Telegram webhook on disposable PostgreSQL", () => {
  const name = `telegram_test_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const workspace = randomUUID();
  let admin: Pool, db: Pool;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
    const url = new URL(process.env.DATABASE_URL);
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("Local DB only");
    admin = new Pool({ connectionString: url.href });
    await admin.query(`CREATE DATABASE "${name}"`);
    url.pathname = "/" + name;
    db = new Pool({ connectionString: url.href });
    const directory = resolve("../../database/migrations");
    for (const file of readdirSync(directory).filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql")).sort())
      await db.query(readFileSync(resolve(directory, file), "utf8"));
    await db.query("INSERT INTO workspaces(id,name,slug) VALUES($1,$2,$3)", [workspace, "Synthetic telegram test", workspace]);
    holder.db = db as unknown as typeof holder.db;
    Object.assign(process.env, { TELEGRAM_WEBHOOK_SECRET: "tg-secret", TELEGRAM_WEBHOOK_WORKSPACE_ID: workspace });
  }, 120_000);

  afterAll(async () => {
    await db?.end();
    await admin?.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin?.end();
  });

  it("stores a message once even when Telegram delivers it again", async () => {
    const { POST } = await import("../../src/app/v1/webhooks/telegram/route");
    const deliver = () => POST(new Request("http://x/v1/webhooks/telegram", { method: "POST",
      headers: { "x-telegram-bot-api-secret-token": "tg-secret" },
      body: JSON.stringify({ update_id: 1, business_message: { message_id: 7, text: "Where is good street food?", business_connection_id: "conn-1",
        from: { id: 555, first_name: "Linh" }, chat: { id: 555, type: "private" } } }) }) as never);
    expect((await deliver()).status).toBe(200);
    expect((await deliver()).status).toBe(200);
    const rows = (await db.query(
      "SELECT platform, external_id, author_name, author_contact, content, status, metadata FROM community_messages WHERE workspace_id=$1", [workspace])).rows;
    expect(rows).toEqual([{ platform: "telegram_message", external_id: "conn-1:555:7", author_name: "Linh", author_contact: "555",
      content: "Where is good street food?", status: "received", metadata: { business_connection_id: "conn-1" } }]);
  });
});
