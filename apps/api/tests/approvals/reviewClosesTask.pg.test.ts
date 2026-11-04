import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe.skipIf(process.env.RUN_AUTOMATION_DB !== "1")("a review decision moves the task chain on (disposable PostgreSQL)", () => {
  const name = `review_test_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const workspace = randomUUID(), owner = randomUUID();
  let admin: Pool, db: Pool, snapshot: string;
  let review: typeof import("../../src/modules/approvals/repository").executeApprovalReviewTransaction;
  let tickAutomation: typeof import("../../src/modules/campaignPlans/automation").tickAutomation;

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
    // lib/db captures its URL on import, so the review code is imported only after pointing it at this database.
    process.env.DATABASE_URL = url.href;
    review = (await import("../../src/modules/approvals/repository")).executeApprovalReviewTransaction;
    tickAutomation = (await import("../../src/modules/campaignPlans/automation")).tickAutomation;
    snapshot = randomUUID();
    await db.query("INSERT INTO users(id,email,full_name) VALUES($1,$2,'Synthetic owner')", [owner, `${owner}@example.test`]);
    await db.query("INSERT INTO workspaces(id,name,slug) VALUES($1,'Synthetic review test',$2)", [workspace, workspace]);
    await db.query("INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [workspace, owner]);
    await db.query("INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot) VALUES($1,$2,1,'{}',$3)",
      [snapshot, workspace, JSON.stringify({ sources: [{ source_id: randomUUID(), version: 1 }] })]);
    await db.query("INSERT INTO agent_automation(workspace_id,actor_id,enabled) VALUES($1,$2,true)", [workspace, owner]);
  }, 60000);

  afterAll(async () => {
    if (db) await db.end();
    if (admin) {
      if (/^review_test_\d+_[a-f0-9]{8}$/.test(name)) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });

  /** An accepted plan whose SEO draft waits for a person and whose Content task waits for that draft. */
  async function planWaitingOnReview() {
    const plan = randomUUID(), seo = randomUUID(), content = randomUUID(), artifact = randomUUID();
    const hash = "a".repeat(64);
    await db.query("INSERT INTO campaigns(id,workspace_id,name,utm_campaign) VALUES($1,$2,'Synthetic plan','synthetic')", [plan, workspace]);
    await db.query(`INSERT INTO content_artifacts(id,workspace_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
      VALUES($1,$2,1,$3,$4,'seo','seo.local_draft','ai_result','Synthetic draft','ai_run_store','{"result":{"status":"insufficient_data"}}','[]')`,
      [artifact, workspace, hash, snapshot]);
    await db.query(`INSERT INTO workflow_tasks(id,workspace_id,role,operation,status,input_version,context_snapshot_id,campaign_id,payload,result_ref)
      VALUES($1,$2,'seo','seo.local_draft','awaiting_approval',1,$3,$4,'{}',$5),($6,$2,'content','content.repurpose','pending',1,$3,$4,'{}',NULL)`,
      [seo, workspace, snapshot, plan, artifact, content]);
    await db.query("INSERT INTO task_dependencies(task_id,depends_on_task_id,workspace_id) VALUES($1,$2,$3)", [content, seo, workspace]);
    await db.query("INSERT INTO campaign_plan_acceptances(plan_id,workspace_id,input_version,plan,record) VALUES($1,$2,1,'{}','{}')", [plan, workspace]);
    const approval = (await db.query(`INSERT INTO approvals(workspace_id,target_type,target_id,target_version,target_hash)
      VALUES($1,'artifact',$2,1,$3) RETURNING id`, [workspace, artifact, hash])).rows[0].id as string;
    await db.query("UPDATE agent_automation SET next_run_at=now()-interval '1 minute' WHERE workspace_id=$1", [workspace]);
    return { seo, content, approval, hash };
  }
  const alerts = async () => (await import("../../src/modules/campaignPlans/alerts")).workspaceAlerts(db, workspace);
  const statusOf = async (id: string) => (await db.query("SELECT status FROM workflow_tasks WHERE id=$1", [id])).rows[0].status;
  const researchRuns = async () =>
    (await db.query("SELECT count(*)::int AS n FROM workflow_tasks WHERE workspace_id=$1 AND operation='research.run'", [workspace])).rows[0].n as number;

  it("rejecting a draft closes its task and the task behind it, so the next cycle starts", async () => {
    const { seo, content, approval, hash } = await planWaitingOnReview();
    await tickAutomation(db, workspace);
    expect(await researchRuns()).toBe(0); // the waiting draft holds the schedule

    await review(workspace, approval, { decision: "reject", expected_version: 1, expected_hash: hash }, owner, "owner");
    expect(await statusOf(seo)).toBe("cancelled");

    await tickAutomation(db, workspace);
    expect(await statusOf(content)).toBe("cancelled");
    expect(await researchRuns()).toBe(1);
  });

  const closeOpenWork = () => db.query("UPDATE workflow_tasks SET status='completed' WHERE workspace_id=$1 AND status IN ('queued','running','pending','awaiting_approval')", [workspace]);

  it("a draft nobody reviewed for a whole extra cycle expires, stays unpublished, and the schedule moves on", async () => {
    await closeOpenWork();
    const { seo, content, approval } = await planWaitingOnReview();
    await db.query("UPDATE agent_automation SET next_run_at=now()-make_interval(hours=>interval_hours+1) WHERE workspace_id=$1", [workspace]);
    const before = await researchRuns();

    await tickAutomation(db, workspace);
    const task = (await db.query("SELECT status,error_details FROM workflow_tasks WHERE id=$1", [seo])).rows[0];
    expect(task).toMatchObject({ status: "cancelled", error_details: { code: "REVIEW_TIMEOUT" } });
    expect((await db.query("SELECT status,invalidated_reason FROM approvals WHERE id=$1", [approval])).rows[0])
      .toEqual({ status: "revoked", invalidated_reason: "REVIEW_TIMEOUT" });

    await tickAutomation(db, workspace);
    expect(await statusOf(content)).toBe("cancelled");
    expect(await researchRuns()).toBe(before + 1);
    expect((await alerts()).map((alert) => alert.code)).toContain("DRAFTS_EXPIRED");
  });

  it("tells the owner while an overdue cycle waits on a review", async () => {
    await closeOpenWork();
    await db.query("UPDATE workflow_tasks SET error_details=NULL WHERE workspace_id=$1", [workspace]);
    expect((await alerts()).map((alert) => alert.code)).not.toContain("CYCLE_WAITING_ON_REVIEW");
    await planWaitingOnReview();
    const waiting = (await alerts()).find((alert) => alert.code === "CYCLE_WAITING_ON_REVIEW");
    expect(waiting?.message).toContain("1 bản nháp");
  });

  it("reviews that can no longer change anything leave the queue; live ones stay", async () => {
    // Real data: 35 approvals pending, almost all on old contexts or on tasks already finished.
    await closeOpenWork();
    await db.query("UPDATE agent_automation SET next_run_at=now()+interval '1 hour' WHERE workspace_id=$1", [workspace]);
    const oldContext = randomUUID();
    await db.query("UPDATE knowledge_contexts SET current=false WHERE snapshot_id=$1", [snapshot]);
    await db.query("INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot,current) VALUES($1,$2,1,'{}',$3,false)",
      [oldContext, workspace, JSON.stringify({ sources: [] })]);
    await db.query("UPDATE knowledge_contexts SET current=true WHERE snapshot_id=$1", [snapshot]);
    const review = async (context: string, status: string) => {
      const task = randomUUID(), artifact = randomUUID(), hash = "c".repeat(64);
      await db.query(`INSERT INTO content_artifacts(id,workspace_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
        VALUES($1,$2,1,$3,$4,'research','research.run','ai_result','Research','ai_run_store','{"result":{"status":"insufficient_data"}}','[]')`,
        [artifact, workspace, hash, context]);
      await db.query(`INSERT INTO workflow_tasks(id,workspace_id,role,operation,status,input_version,context_snapshot_id,payload,result_ref)
        VALUES($1,$2,'research','research.run',$3,1,$4,'{}',$5)`, [task, workspace, status, context, artifact]);
      const approval = (await db.query(`INSERT INTO approvals(workspace_id,target_type,target_id,target_version,target_hash)
        VALUES($1,'artifact',$2,1,$3) RETURNING id`, [workspace, artifact, hash])).rows[0].id as string;
      return { task, approval };
    };
    const onOldContext = await review(oldContext, "awaiting_approval");
    const finished = await review(snapshot, "completed");
    const live = await review(snapshot, "awaiting_approval");
    const approvalStatus = async (id: string) => (await db.query("SELECT status,invalidated_reason FROM approvals WHERE id=$1", [id])).rows[0];

    await tickAutomation(db, workspace);

    expect(await statusOf(onOldContext.task)).toBe("cancelled");
    expect(await approvalStatus(onOldContext.approval)).toEqual({ status: "revoked", invalidated_reason: "SUPERSEDED_CONTEXT" });
    expect(await approvalStatus(finished.approval)).toEqual({ status: "revoked", invalidated_reason: "TASK_ALREADY_CLOSED" });
    expect(await statusOf(live.task)).toBe("awaiting_approval");
    expect(await approvalStatus(live.approval)).toEqual({ status: "pending", invalidated_reason: null });
  });

  it("an article the site refuses is still approved, and the chain and scheduler carry on", async () => {
    // A refusal used to abort the whole tick, again on every tick.
    await closeOpenWork();
    const { seo, content } = await planWaitingOnReview();
    const result = { status: "draft", missing_facts: [], synthetic: false, title: "Short", body_markdown: "## A", meta_description: "M" };
    await db.query("UPDATE content_artifacts SET payload=$1,evidence=$2,role='seo' WHERE id=(SELECT result_ref FROM workflow_tasks WHERE id=$3)",
      [JSON.stringify({ result }), JSON.stringify([{ chunk_id: "c" }]), seo]);
    await db.query("UPDATE agent_automation SET auto_approve_outputs=true,auto_publish_website=true,next_run_at=now()+interval '1 hour' WHERE workspace_id=$1", [workspace]);

    await expect(tickAutomation(db, workspace)).resolves.toMatchObject({ status: "ok", warning: expect.stringContaining("WEBSITE_NOT_PUBLISHED") });

    expect(await statusOf(seo)).toBe("completed");
    expect(await statusOf(content)).toBe("queued");
    await db.query("UPDATE agent_automation SET auto_publish_website=false,auto_approve_outputs=false WHERE workspace_id=$1", [workspace]);
  });

  it("a learning report with nothing measured closes by itself instead of waiting for a person", async () => {
    await closeOpenWork();
    await db.query("UPDATE agent_automation SET auto_approve_outputs=true, next_run_at=now()+interval '1 hour' WHERE workspace_id=$1", [workspace]);
    const task = randomUUID(), artifact = randomUUID(), hash = "b".repeat(64);
    const result = { status: "draft", missing_facts: [], next_tasks: [], stopped_reason: "no_measured_signal" };
    await db.query(`INSERT INTO content_artifacts(id,workspace_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
      VALUES($1,$2,1,$3,$4,'growth_lead','learning.analyze','ai_result','Learning','ai_run_store',$5,'[]')`,
      [artifact, workspace, hash, snapshot, JSON.stringify({ result })]);
    await db.query(`INSERT INTO workflow_tasks(id,workspace_id,role,operation,status,input_version,context_snapshot_id,payload,result_ref)
      VALUES($1,$2,'growth_lead','learning.analyze','awaiting_approval',1,$3,'{}',$4)`, [task, workspace, snapshot, artifact]);
    const approval = (await db.query(`INSERT INTO approvals(workspace_id,target_type,target_id,target_version,target_hash)
      VALUES($1,'artifact',$2,1,$3) RETURNING id`, [workspace, artifact, hash])).rows[0].id;

    await tickAutomation(db, workspace);

    expect(await statusOf(task)).toBe("completed");
    expect((await db.query("SELECT status FROM approvals WHERE id=$1", [approval])).rows[0].status).not.toBe("pending");
  });
});
