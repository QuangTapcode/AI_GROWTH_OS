import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { tickAutomation } from "../../src/modules/campaignPlans/automation";
import { ensureBaselineArtifact, ensureMeasurementArtifacts } from "../../src/modules/site/measurement";

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
    it("unusable research and a rejected plan are closed instead of holding the schedule", async () => {
      const artifact = async (role: string, operation: string, payload: unknown) => {
        const id = randomUUID();
        await db.query(
          `INSERT INTO content_artifacts(id,workspace_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
        VALUES($1,$2,1,$3,$4,$5,$6,'ai_result','Synthetic test','ai_run_store',$7,'[]')`,
          [id, workspace, id.replace(/-/g, "").padEnd(64, "0"), snapshot, role, operation, JSON.stringify(payload)],
        );
        return id;
      };
      const research = randomUUID();
      await db.query(
        `INSERT INTO workflow_tasks(id,workspace_id,role,operation,status,input_version,context_snapshot_id,payload,result_ref)
         VALUES($1,$2,'research','research.run','awaiting_approval',1,$3,'{}',$4)`,
        [research, workspace, snapshot, await artifact("research", "research.run", { result: { status: "insufficient_data" } })],
      );
      await db.query("INSERT INTO agent_automation_handoffs(workspace_id,task_id) VALUES($1,$2)", [workspace, research]);
      // The strategy queued by the previous test returns a plan the backend rejects.
      const strategy = (await db.query("SELECT id FROM workflow_tasks WHERE operation='strategy.generate'")).rows[0];
      await db.query("UPDATE workflow_tasks SET status='awaiting_approval',result_ref=$2 WHERE id=$1",
        [strategy.id, await artifact("growth_lead", "strategy.generate", { artifact: { artifact_id: "forged" }, result: { status: "blocked" } })]);
      await tickAutomation(db, workspace);
      const status = async (id: string) =>
        (await db.query("SELECT status,error_details FROM workflow_tasks WHERE id=$1", [id])).rows[0];
      expect((await status(research)).status).toBe("completed");
      expect((await db.query("SELECT count(*)::int AS n FROM workflow_tasks WHERE operation='strategy.generate'")).rows[0].n).toBe(1);
      expect(await status(strategy.id)).toMatchObject({ status: "failed", error_details: { code: "INVALID_ARTIFACT_REF" } });
    });
    it("measures the preceding equal-length window once as the KPI baseline", async () => {
      const { metrics_artifact_id: current } = await ensureMeasurementArtifacts(db, workspace, snapshot);
      const baseline = await ensureBaselineArtifact(db, workspace, snapshot, current);
      expect(baseline).toBeTruthy();
      expect(await ensureBaselineArtifact(db, workspace, snapshot, current)).toBe(baseline);
      const results = new Map((await db.query("SELECT id, payload->'result' AS r FROM content_artifacts WHERE id = ANY($1)",
        [[current, baseline]])).rows.map((row) => [row.id, row.r]));
      const now = results.get(current), before = results.get(baseline);
      expect(before.window_end).toBe(now.window_start);
      expect(Date.parse(before.window_end) - Date.parse(before.window_start))
        .toBe(Date.parse(now.window_end) - Date.parse(now.window_start));
      expect(before.metric_definitions).toEqual(now.metric_definitions);
    });
    it("does not open another learning round on a measurement an earlier round already used", async () => {
      const artifact = async (role: string, operation: string, taskId: string | null, payload: unknown) => {
        const id = randomUUID();
        await db.query(
          `INSERT INTO content_artifacts(id,workspace_id,task_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
        VALUES($1,$2,$3,1,$4,$5,$6,$7,'ai_result','Synthetic test','ai_run_store',$8,'[]')`,
          [id, workspace, taskId, id.replace(/-/g, "").padEnd(64, "0"), snapshot, role, operation, JSON.stringify(payload)],
        );
        return id;
      };
      const task = async (role: string, operation: string, status: string, payload: unknown) => {
        const id = randomUUID();
        await db.query(`INSERT INTO workflow_tasks(id,workspace_id,role,operation,status,input_version,context_snapshot_id,payload)
          VALUES($1,$2,$3,$4,$5,1,$6,$7)`, [id, workspace, role, operation, status, snapshot, JSON.stringify(payload)]);
        return id;
      };
      const { metrics_artifact_id: metrics } = await ensureMeasurementArtifacts(db, workspace, snapshot);
      // An earlier round: report on this measurement, then learning on that report.
      const earlierReportTask = await task("performance", "analytics.report", "completed", { input: { operation: "analytics.report", metrics_artifact_id: metrics } });
      const earlierReport = await artifact("performance", "analytics.report", earlierReportTask, { result: { status: "draft" } });
      await task("growth_lead", "learning.analyze", "completed", { input: { operation: "learning.analyze", performance_artifact_id: earlierReport } });
      // A new report on the same measurement arrives through the scheduler.
      const reportTask = await task("performance", "analytics.report", "awaiting_approval", { input: { operation: "analytics.report", metrics_artifact_id: metrics } });
      await db.query("UPDATE workflow_tasks SET result_ref=$2 WHERE id=$1",
        [reportTask, await artifact("performance", "analytics.report", reportTask, { result: { status: "draft" } })]);
      await db.query("INSERT INTO agent_automation_handoffs(workspace_id,task_id) VALUES($1,$2)", [workspace, reportTask]);
      await tickAutomation(db, workspace);
      const learning = await db.query("SELECT count(*)::int AS n FROM workflow_tasks WHERE operation='learning.analyze'");
      expect(learning.rows[0].n).toBe(1);
      expect((await db.query("SELECT status FROM workflow_tasks WHERE id=$1", [reportTask])).rows[0].status).toBe("completed");
    });
    it("a new cycle runs on a fresh context when sources were approved after the current one", async () => {
      const ws = randomUUID(), first = randomUUID(), added = randomUUID(), ctx = randomUUID();
      await db.query("INSERT INTO workspaces(id,name,slug) VALUES($1,'Synthetic source refresh',$2)", [ws, ws]);
      await db.query("INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [ws, owner]);
      await db.query("INSERT INTO business_profiles(workspace_id,company_name,version) VALUES($1,'Synthetic',1)", [ws]);
      for (const id of [first, added])
        await db.query(`INSERT INTO sources(id,workspace_id,title,kind,url_or_blob,category,status,version)
          VALUES($1,$2,'Synthetic article','url','https://tripc.ai/blog/synthetic','content','approved',1)`, [id, ws]);
      // The current context predates the second approved source.
      await db.query("INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot) VALUES($1,$2,1,'{}',$3)",
        [ctx, ws, JSON.stringify({ sources: [{ source_id: first, version: 1 }] })]);
      await db.query("INSERT INTO agent_automation(workspace_id,actor_id,enabled) VALUES($1,$2,true)", [ws, owner]);
      await tickAutomation(db, ws, true);
      const current = (await db.query("SELECT snapshot_id, snapshot FROM knowledge_contexts WHERE workspace_id=$1 AND current", [ws])).rows[0];
      expect(current.snapshot_id).not.toBe(ctx);
      expect(current.snapshot.sources.map((s: { source_id: string }) => s.source_id).sort()).toEqual([first, added].sort());
      const research = (await db.query("SELECT context_snapshot_id FROM workflow_tasks WHERE workspace_id=$1 AND operation='research.run'", [ws])).rows;
      expect(research).toEqual([{ context_snapshot_id: current.snapshot_id }]);
    });
    it("an approved Messenger reply is queued for sending to that person; an escalation is never sent", async () => {
      const ws = randomUUID(), ctx = randomUUID();
      await db.query("INSERT INTO workspaces(id,name,slug) VALUES($1,'Synthetic messenger',$2)", [ws, ws]);
      await db.query("INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [ws, owner]);
      await db.query("INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot) VALUES($1,$2,1,'{}',$3)",
        [ctx, ws, JSON.stringify({ sources: [{ source_id: randomUUID(), version: 1 }] })]);
      await db.query("INSERT INTO agent_automation(workspace_id,actor_id,enabled,auto_approve_outputs,next_run_at) VALUES($1,$2,true,true,now()+interval '1 day')", [ws, owner]);
      const inbound = async (mid: string, result: Record<string, unknown>) => {
        const task = randomUUID(), artifact = randomUUID(), message = randomUUID();
        await db.query(`INSERT INTO workflow_tasks(id,workspace_id,role,operation,status,input_version,context_snapshot_id,payload)
          VALUES($1,$2,'community','community.response','queued',1,$3,'{}')`, [task, ws, ctx]);
        await db.query(`INSERT INTO content_artifacts(id,workspace_id,task_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
          VALUES($1,$2,$3,1,$4,$5,'community','community.response','ai_result','community','ai_run_store',$6,$7)`,
          [artifact, ws, task, artifact.replace(/-/g, "").padEnd(64, "0"), ctx, JSON.stringify({ result: { synthetic: false, missing_facts: [], ...result } }),
           JSON.stringify([{ quote: "Street food stalls open every evening near the river." }])]);
        await db.query("UPDATE workflow_tasks SET status='awaiting_approval',result_ref=$2 WHERE id=$1", [task, artifact]);
        await db.query(`INSERT INTO community_messages(id,workspace_id,platform,external_id,author_name,author_contact,content,status,task_id)
          VALUES($1,$2,'facebook_message',$3,'Facebook user',$4,'Where is good street food?','queued',$5)`, [message, ws, mid, `psid-${mid}`, task]);
        return message;
      };
      const answered = await inbound("m1", { status: "draft", reply: "Street food stalls open every evening near the river.", escalation_required: false });
      const escalated = await inbound("m2", { status: "draft", reply: "Prices need confirmation.", escalation_required: true });
      await tickAutomation(db, ws);
      const events = (await db.query("SELECT payload FROM outbox_events WHERE workspace_id=$1 AND event_type='community.reply'", [ws])).rows;
      expect(events.map((e) => e.payload)).toEqual([expect.objectContaining({ message_id: answered, recipient: "psid-m1",
        text: "Street food stalls open every evening near the river." })]);
      const status = async (id: string) => (await db.query("SELECT status FROM community_messages WHERE id=$1", [id])).rows[0].status;
      expect(await status(answered)).toBe("queued");
      expect(await status(escalated)).toBe("escalated");
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
