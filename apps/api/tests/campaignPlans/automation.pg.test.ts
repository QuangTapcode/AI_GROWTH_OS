import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tickAutomation } from "../../src/modules/campaignPlans/automation";

describe.skipIf(process.env.RUN_AUTOMATION_DB !== "1")(
  "automation on disposable PostgreSQL",
  () => {
    const name = `automation_test_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const workspace = randomUUID(),
      owner = randomUUID(),
      snapshot = randomUUID();
    let admin: Pool, db: Pool;
    beforeAll(async () => {
      if (!process.env.DATABASE_URL)
        throw new Error("DATABASE_URL is required");
      const url = new URL(process.env.DATABASE_URL);
      if (!["localhost", "127.0.0.1"].includes(url.hostname))
        throw new Error("Local DB only");
      admin = new Pool({ connectionString: url.href });
      await admin.query(`CREATE DATABASE "${name}"`);
      url.pathname = "/" + name;
      db = new Pool({ connectionString: url.href });
      const directory = resolve("../../database/migrations");
      for (const file of readdirSync(directory)
        .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql"))
        .sort())
        await db.query(readFileSync(resolve(directory, file), "utf8"));
      await db.query("INSERT INTO users(id,email,full_name) VALUES($1,$2,$3)", [
        owner,
        `${owner}@example.test`,
        "Synthetic automation owner",
      ]);
      await db.query("INSERT INTO workspaces(id,name,slug) VALUES($1,$2,$3)", [
        workspace,
        "Synthetic automation test",
        workspace,
      ]);
      await db.query(
        "INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",
        [workspace, owner],
      );
      await db.query(
        "INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot) VALUES($1,$2,1,'{}',$3)",
        [
          snapshot,
          workspace,
          JSON.stringify({
            sources: [{ source_id: randomUUID(), version: 1 }],
          }),
        ],
      );
      await db.query(
        "INSERT INTO agent_automation(workspace_id,actor_id,enabled) VALUES($1,$2,true)",
        [workspace, owner],
      );
    }, 30000);
    afterAll(async () => {
      if (db) await db.end();
      if (admin) {
        if (/^automation_test_\d+_[a-f0-9]{8}$/.test(name))
          await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        await admin.end();
      }
    });
    it("concurrent ticks create exactly one durable Research task and outbox row", async () => {
      await Promise.all([
        tickAutomation(db, workspace),
        tickAutomation(db, workspace),
      ]);
      await tickAutomation(db, workspace, true);
      expect(
        (await db.query("SELECT count(*)::int AS n FROM workflow_tasks"))
          .rows[0].n,
      ).toBe(1);
      expect(
        (await db.query("SELECT count(*)::int AS n FROM plan_task_outbox"))
          .rows[0].n,
      ).toBe(1);
    });
    it("a completed research artifact automatically queues strategy exactly once", async () => {
      const task = (await db.query("SELECT id FROM workflow_tasks")).rows[0];
      const artifact = randomUUID();
      await db.query(
        `INSERT INTO content_artifacts(id,workspace_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
      VALUES($1,$2,1,$3,$4,'research','research.run','ai_result','Synthetic test','ai_run_store',$5,'[]')`,
        [
          artifact,
          workspace,
          "0".repeat(64),
          snapshot,
          JSON.stringify({ result: { status: "ready_for_handoff" } }),
        ],
      );
      await db.query(
        "UPDATE workflow_tasks SET status='awaiting_approval',result_ref=$2 WHERE id=$1",
        [task.id, artifact],
      );
      await tickAutomation(db, workspace);
      await tickAutomation(db, workspace);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM workflow_tasks WHERE operation='strategy.generate'",
          )
        ).rows[0].n,
      ).toBe(1);
      expect(
        (
          await db.query("SELECT status FROM workflow_tasks WHERE id=$1", [
            task.id,
          ])
        ).rows[0].status,
      ).toBe("completed");
    });
    it("disabled automation and suspended owner cannot dispatch more work", async () => {
      await db.query(
        "UPDATE agent_automation SET enabled=false WHERE workspace_id=$1",
        [workspace],
      );
      expect(await tickAutomation(db, workspace)).toEqual({
        skipped: "disabled",
      });
      await db.query(
        "UPDATE memberships SET status='suspended' WHERE workspace_id=$1",
        [workspace],
      );
      await expect(tickAutomation(db, workspace, true)).rejects.toThrow(
        "owner is no longer active",
      );
      expect(
        (
          await db.query(
            "SELECT last_error FROM agent_automation WHERE workspace_id=$1",
            [workspace],
          )
        ).rows[0].last_error,
      ).toContain("owner");
    });
  },
);
