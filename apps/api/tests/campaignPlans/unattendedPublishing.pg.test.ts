import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { tickAutomation } from "../../src/modules/campaignPlans/automation";
import { PgPlanRepository } from "../../src/modules/campaignPlans/pgRepository";
import { processReceivedCommunityMessages } from "../../src/modules/community/service";
import { ensureMeasurementArtifacts } from "../../src/modules/site/measurement";

// The connection status is read through the global pool; everything else here takes the disposable one.
vi.mock("../../src/modules/integrations/stubs", async (original) => ({
  ...(await original<object>()),
  getWorkspaceConnectionStatus: async () => ({ status: "connected" }),
}));

/** What the scheduler does with approved work when nobody is watching. Run: RUN_AUTOMATION_DB=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/campaignPlans/unattendedPublishing.pg.test.ts */
describe.skipIf(process.env.RUN_AUTOMATION_DB !== "1")("unattended publishing on disposable PostgreSQL", () => {
  const name = `automation_test_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const owner = randomUUID();
  const REPLY = "Street food stalls open every evening near the river.";
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
    await db.query("INSERT INTO users(id,email,full_name) VALUES($1,$2,$3)", [owner, `${owner}@example.test`, "Synthetic owner"]);
  }, 60000);

  afterEach(() => {
    delete process.env.PUBLIC_SITE_URL;
    delete process.env.PUBLIC_SITES_JSON;
  });

  afterAll(async () => {
    if (db) await db.end();
    if (admin) {
      if (/^automation_test_\d+_[a-f0-9]{8}$/.test(name)) await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    }
  });

  async function newWorkspace() {
    const ws = randomUUID(), ctx = randomUUID();
    await db.query("INSERT INTO workspaces(id,name,slug) VALUES($1,'Synthetic unattended',$2)", [ws, ws]);
    await db.query("INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [ws, owner]);
    await db.query("INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot) VALUES($1,$2,1,'{}',$3)",
      [ctx, ws, JSON.stringify({ sources: [{ source_id: randomUUID(), version: 1 }] })]);
    await db.query(`INSERT INTO agent_automation(workspace_id,actor_id,enabled,auto_approve_outputs,auto_publish_facebook,auto_publish_website,next_run_at)
      VALUES($1,$2,true,true,true,true,now()+interval '1 day')`, [ws, owner]);
    await db.query("INSERT INTO channels(workspace_id,platform_name,channel_identifier) VALUES($1,'facebook','page-1')", [ws]);
    process.env.PUBLIC_SITES_JSON = JSON.stringify([{ site_id: `site-${ws}`, workspace_id: ws, timezone: "UTC", status: "active" }]);
    return { ws, ctx };
  }
  type Workspace = Awaited<ReturnType<typeof newWorkspace>>;

  async function awaiting(w: Workspace, role: string, operation: string, result: Record<string, unknown>, payload: unknown = {}) {
    const task = randomUUID(), artifact = randomUUID();
    await db.query(`INSERT INTO workflow_tasks(id,workspace_id,role,operation,status,input_version,context_snapshot_id,payload)
      VALUES($1,$2,$3,$4,'queued',1,$5,$6)`, [task, w.ws, role, operation, w.ctx, JSON.stringify(payload)]);
    await db.query(`INSERT INTO content_artifacts(id,workspace_id,task_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
      VALUES($1,$2,$3,1,$4,$5,$6,$7,'ai_result','Synthetic','ai_run_store',$8,$9)`,
      [artifact, w.ws, task, artifact.replace(/-/g, "").padEnd(64, "0"), w.ctx, role, operation,
        JSON.stringify({ result: { synthetic: false, missing_facts: [], ...result } }), JSON.stringify([{ quote: REPLY }])]);
    await db.query("UPDATE workflow_tasks SET status='awaiting_approval',result_ref=$2 WHERE id=$1", [task, artifact]);
    return { task, artifact };
  }

  const article = (title: string, word = "riverside") => ({
    status: "draft", title, meta_description: "Synthetic", body_markdown: Array(200).fill(word).join(" "),
  });
  const post = (seoArtifact?: string) => ({
    status: "draft", facebook: { text: "The approved post." },
    ...(seoArtifact ? { input_artifact_refs: [{ artifact_id: seoArtifact }] } : {}),
  });
  const postedLink = async (artifact: string) =>
    (await db.query("SELECT utm_url FROM publishing_jobs WHERE artifact_id=$1", [artifact])).rows[0].utm_url as string | null;
  const postedText = async (artifact: string) =>
    (await db.query("SELECT body_markdown FROM contents WHERE artifact_id=$1", [artifact])).rows[0].body_markdown as string;

  it("a published article sends nothing, so leads stay as they were and no send is recorded", async () => {
    const w = await newWorkspace();
    const lead = randomUUID();
    await db.query(`INSERT INTO leads(lead_id,workspace_id,site_id,idempotency_key,payload_hash,contact_email,consent_policy_version)
      VALUES($1,$2,'site',$3,'hash','lead@example.test','v1')`, [lead, w.ws, lead]);
    const email = (await db.query("INSERT INTO channels(workspace_id,platform_name,channel_identifier) VALUES($1,'email','list') RETURNING id", [w.ws])).rows[0].id;
    await awaiting(w, "seo", "seo.local_draft", article("Street food by the river"));
    await tickAutomation(db, w.ws);
    expect((await db.query("SELECT count(*)::int AS n FROM contents WHERE workspace_id=$1 AND type='blog_post'", [w.ws])).rows[0].n).toBe(1);
    expect((await db.query("SELECT lead_status,context FROM leads WHERE lead_id=$1", [lead])).rows[0]).toEqual({ lead_status: "New", context: {} });
    expect((await db.query("SELECT count(*)::int AS n FROM publishing_jobs WHERE channel_id=$1", [email])).rows[0].n).toBe(0);
  });

  it("a post links to its own article on the public site, and the approved text goes out unchanged", async () => {
    const w = await newWorkspace();
    process.env.PUBLIC_SITE_URL = "https://guide.tripc.test/";
    const seo = await awaiting(w, "seo", "seo.local_draft", article("Street food by the river"));
    const social = await awaiting(w, "content", "content.repurpose", post(seo.artifact));
    await tickAutomation(db, w.ws);
    const link = new URL((await postedLink(social.artifact))!);
    expect(link.origin + link.pathname).toBe("https://guide.tripc.test/posts/street-food-by-the-river");
    expect(link.searchParams.get("utm_source")).toBe("facebook");
    expect(link.searchParams.get("utm_medium")).toBe("social");
    expect(await postedText(social.artifact)).toBe("The approved post.");
  });

  it.each([[undefined], ["http://localhost:3001"], ["http://127.0.0.1:3001"], ["not a url"]])(
    "no public site address (%s) means no link at all, never a local one", async (address) => {
      const w = await newWorkspace();
      if (address) process.env.PUBLIC_SITE_URL = address;
      const seo = await awaiting(w, "seo", "seo.local_draft", article("Street food by the river"));
      const social = await awaiting(w, "content", "content.repurpose", post(seo.artifact));
      await tickAutomation(db, w.ws);
      expect(await postedLink(social.artifact)).toBeNull();
      expect(await postedText(social.artifact)).toBe("The approved post.");
    });

  it("a post with no article of its own does not borrow the newest one", async () => {
    const w = await newWorkspace();
    process.env.PUBLIC_SITE_URL = "https://guide.tripc.test";
    await awaiting(w, "seo", "seo.local_draft", article("An unrelated article"));
    await tickAutomation(db, w.ws);
    const social = await awaiting(w, "content", "content.repurpose", post());
    await tickAutomation(db, w.ws);
    expect(await postedLink(social.artifact)).toBeNull();
  });

  it("a refresh of a published article updates it in place", async () => {
    const w = await newWorkspace();
    await awaiting(w, "seo", "seo.local_draft", article("Street food by the river", "first"));
    await tickAutomation(db, w.ws);
    await awaiting(w, "seo", "content.refresh", article("Street food by the river", "second"));
    await tickAutomation(db, w.ws);
    const rows = (await db.query("SELECT slug,body_markdown,current_version FROM contents WHERE workspace_id=$1 AND type='blog_post'", [w.ws])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].slug).toBe("street-food-by-the-river");
    expect(rows[0].body_markdown).toContain("second");
    expect(rows[0].current_version).toBe(2);
  });

  it("a Research with several topics goes on to the plan and the report, and queues no article outside the plan", async () => {
    const w = await newWorkspace();
    await db.query("UPDATE agent_automation SET cta='Request the guide' WHERE workspace_id=$1", [w.ws]);
    const research = await awaiting(w, "research", "research.run",
      { status: "ready_for_handoff", findings: [{ topic: "One" }, { topic: "Two" }, { topic: "Three" }] }, { input: { operation: "research.run" } });
    await db.query("INSERT INTO agent_automation_handoffs(workspace_id,task_id) VALUES($1,$2)", [w.ws, research.task]);
    await tickAutomation(db, w.ws);
    const queued = (await db.query("SELECT operation FROM workflow_tasks WHERE workspace_id=$1 AND id<>$2 ORDER BY operation", [w.ws, research.task])).rows;
    expect(queued.map((row) => row.operation)).toEqual(["analytics.report", "strategy.generate"]);
  });

  it("a long call to action does not stop the scheduler when it proposes an experiment", async () => {
    const w = await newWorkspace();
    await db.query("UPDATE agent_automation SET cta=$2 WHERE workspace_id=$1", [w.ws, "c".repeat(200)]);
    const end = new Date(Date.now() - 3_600_000), start = new Date(end.getTime() - 86_400_000);
    const report = await awaiting(w, "performance", "analytics.report",
      { status: "draft", window: { start: start.toISOString(), end: end.toISOString() } }, { input: { operation: "analytics.report" } });
    await db.query("INSERT INTO agent_automation_handoffs(workspace_id,task_id) VALUES($1,$2)", [w.ws, report.task]);
    await expect(tickAutomation(db, w.ws)).resolves.toMatchObject({ status: "ok" });
    expect((await db.query("SELECT status FROM workflow_tasks WHERE id=$1", [report.task])).rows[0].status).toBe("completed");
    const experiment = (await db.query("SELECT payload FROM workflow_tasks WHERE workspace_id=$1 AND operation='experiment.hypothesis'", [w.ws])).rows[0];
    expect(experiment.payload.input.experiment.treatment_variant.length).toBeLessThanOrEqual(200);
  });

  it("a new context keeps the current one's approved images unless it is given others", async () => {
    const w = await newWorkspace();
    const asset = { asset_id: randomUUID(), url: "https://cdn.tripc.test/approved.jpg" };
    await db.query("INSERT INTO business_profiles(workspace_id,company_name,version) VALUES($1,'Synthetic',1)", [w.ws]);
    await db.query("UPDATE knowledge_contexts SET assets=$2 WHERE workspace_id=$1 AND current", [w.ws, JSON.stringify([asset])]);
    const repo = new PgPlanRepository(db);
    const assets = async () => (await db.query("SELECT assets FROM knowledge_contexts WHERE workspace_id=$1 AND current", [w.ws])).rows[0].assets;
    await repo.issueContext(w.ws);
    expect(await assets()).toEqual([asset]);
    await repo.issueContext(w.ws, { assets: [] });
    expect(await assets()).toEqual([]);
  });

  it("a measurement says where leads came from and what was posted, without test data", async () => {
    const w = await newWorkspace();
    const lead = (source: string | null, context: object) => db.query(
      `INSERT INTO leads(workspace_id,site_id,idempotency_key,payload_hash,contact_email,consent_policy_version,utm_source,context,captured_at)
       VALUES($1,$2,$3,'hash','lead@example.test','v1',$4,$5,now()-interval '1 minute')`,
      [w.ws, `site-${w.ws}`, randomUUID(), source, JSON.stringify(context)]);
    await lead("facebook", {});
    await lead(null, {});
    await lead("facebook", { synthetic: "true" });
    const facebook = (await db.query("SELECT id FROM channels WHERE workspace_id=$1 AND platform_name='facebook'", [w.ws])).rows[0].id;
    const content = (await db.query("INSERT INTO contents(workspace_id,title,body_markdown,type,status) VALUES($1,'Post','Text','social_post','approved') RETURNING id", [w.ws])).rows[0].id;
    await db.query(`INSERT INTO publishing_jobs(content_id,channel_id,scheduled_for,published_at,status,workspace_id,mode)
      VALUES($1,$2,now(),now()-interval '1 minute','published',$3,'live')`, [content, facebook, w.ws]);
    const { metrics_artifact_id: metrics } = await ensureMeasurementArtifacts(db, w.ws, w.ctx);
    const { measurement } = (await db.query("SELECT payload FROM content_artifacts WHERE id=$1", [metrics])).rows[0].payload;
    expect(measurement.utm_sources).toEqual({ facebook: 1, direct: 1 });
    expect(measurement.published_social_posts).toEqual({ facebook: 1 });
  });

  async function inbound(w: Workspace, result: Record<string, unknown>, contact = "psid-lead") {
    const made = await awaiting(w, "community", "community.response", result);
    const message = randomUUID();
    await db.query(`INSERT INTO community_messages(id,workspace_id,platform,external_id,author_name,author_contact,content,status,task_id)
      VALUES($1,$2,'facebook_message',$3,'Facebook user',$4,'Tư vấn giúp mình, sđt 0905123456','queued',$5)`, [message, w.ws, message, contact, made.task]);
    return message;
  }
  const proposal = { intent: "request_information", status: "proposed", owner: null, requires_consent: true, persisted: false, contact: { phone: "0905123456" } };

  it("an unattended lead is answered but not recorded as having consented, because nobody verified that", async () => {
    const w = await newWorkspace();
    await inbound(w, { status: "insufficient_data", missing_facts: ["verified_lead_owner_and_consent"], reply: REPLY, escalation_required: true, lead_proposal: proposal });
    await tickAutomation(db, w.ws);
    const events = (await db.query("SELECT payload FROM outbox_events WHERE workspace_id=$1 AND event_type='community.reply'", [w.ws])).rows;
    expect(events.map((e) => e.payload.text)).toEqual([REPLY]);
    const lead = (await db.query("SELECT consent_accepted,consent_policy_version,phone_number FROM leads WHERE workspace_id=$1", [w.ws])).rows[0];
    expect(lead).toEqual({ consent_accepted: false, consent_policy_version: "community-unverified", phone_number: "0905123456" });
  });

  it("a lead whose question has no grounded answer waits for a person and nothing is sent", async () => {
    const w = await newWorkspace();
    await inbound(w, { status: "insufficient_data", missing_facts: ["grounded_answer", "verified_lead_owner_and_consent"], reply: "A human needs to review it.", escalation_required: true, lead_proposal: proposal });
    await tickAutomation(db, w.ws);
    expect((await db.query("SELECT count(*)::int AS n FROM outbox_events WHERE workspace_id=$1 AND event_type='community.reply'", [w.ws])).rows[0].n).toBe(0);
    expect((await db.query("SELECT count(*)::int AS n FROM leads WHERE workspace_id=$1", [w.ws])).rows[0].n).toBe(0);
  });

  it("a customer's history holds what was really said to them, on this channel only", async () => {
    const w = await newWorkspace();
    const earlier = async (platform: string, content: string, status: string, reply: string) => {
      const made = await awaiting(w, "community", "community.response", { status: "draft", reply });
      await db.query("UPDATE workflow_tasks SET status='completed' WHERE id=$1", [made.task]);
      await db.query(`INSERT INTO community_messages(workspace_id,platform,external_id,author_name,author_contact,content,status,task_id)
        VALUES($1,$2,$3,'Customer','same-id',$4,$5,$6)`, [w.ws, platform, randomUUID(), content, status, made.task]);
    };
    await earlier("facebook_message", "First question?", "replied", "The reply that was sent.");
    await earlier("facebook_message", "Second question?", "escalated", "A draft nobody sent.");
    await earlier("telegram_message", "A question elsewhere?", "replied", "Reply on another channel.");
    const message = randomUUID();
    await db.query(`INSERT INTO community_messages(id,workspace_id,platform,external_id,author_name,author_contact,content,status)
      VALUES($1,$2,'facebook_message',$3,'Customer','same-id','Third question?','received')`, [message, w.ws, message]);
    await processReceivedCommunityMessages(db, w.ws, owner, w.ctx);
    const task = (await db.query("SELECT t.payload FROM workflow_tasks t JOIN community_messages m ON m.task_id=t.id WHERE m.id=$1", [message])).rows[0];
    expect(task.payload.input.history).toEqual([
      { question: "First question?", reply: "The reply that was sent." },
      { question: "Second question?" },
    ]);
  });
});
