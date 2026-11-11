import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { assignExperiment, createExperiment, changeExperiment, listExperiments } from '../../src/modules/performance/experiments';
import { ensureMeasurementArtifacts, ensureBaselineArtifact } from '../../src/modules/site/measurement';
import { recordSiteEvent } from '../../src/modules/site/events';
import { approvePerformanceAction } from '../../src/modules/performance/actions';
import { canonicalJson, sha256Hex } from '../../src/lib/hash';
import { aggregateProviderMetrics, spendWindowLeads } from '../../src/modules/metrics/aggregate';
import { countLeadsInPeriod } from '../../src/modules/leads/repository';
import { socialEvidence, syncFacebookCounters } from '../../src/modules/performance/social';
import { recordGroupObservation,groupMetricEvidence,groupPostEvidence } from '../../src/modules/performance/groups';
import { facebookHistoryReport } from '../../src/modules/performance/socialReport';
import { vi } from 'vitest';

describe.skipIf(!process.env.PERFORMANCE_TEST_DATABASE_URL)('Performance on disposable PostgreSQL', () => {
  const workspace = randomUUID(), other = randomUUID(), actor = randomUUID(), context = randomUUID();
  let pool: Pool;
  beforeAll(async () => {
    const url = new URL(process.env.PERFORMANCE_TEST_DATABASE_URL!);
    if (!['localhost','127.0.0.1'].includes(url.hostname) || url.pathname !== '/performance_test') throw new Error('Only the dedicated local performance_test database is permitted');
    pool = new Pool({ connectionString: url.href, max: 8 });
    const directory = resolve('../../database/migrations');
    for (const file of readdirSync(directory).filter(f => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort())
      await pool.query(readFileSync(resolve(directory,file),'utf8').replace(/^\uFEFF/,''));
    await pool.query("INSERT INTO workspaces(id,name,slug) VALUES($1::uuid,'Performance test',$1::text),($2::uuid,'Other test',$2::text)", [workspace,other]);
    await pool.query("INSERT INTO users(id,email,full_name) VALUES($1,$2,'Test Owner')", [actor, `${actor}@example.test`]);
    await pool.query("INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [workspace,actor]);
    await pool.query("INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot) VALUES($1,$2,1,'{}','{}')", [context,workspace]);
    process.env.PUBLIC_SITES_JSON = JSON.stringify([{ site_id: 'performance-pilot', workspace_id: workspace, timezone: 'UTC', status: 'active' },
      { site_id: 'performance-other', workspace_id: other, timezone: 'UTC', status: 'active' }]);
  },60000);
  afterAll(async () => { if (pool) await pool.end(); });

  it('stores real-shaped Group observations with native periods, version pins and tenant isolation',async()=>{
    const groupWorkspace=randomUUID(), artifact=randomUUID(), channel=randomUUID(), group='1134282109069209';
    await pool.query("INSERT INTO workspaces(id,name,slug) VALUES($1::uuid,'Group contract',$1::text)",[groupWorkspace]);
    await pool.query("INSERT INTO channels(id,workspace_id,platform_name,channel_identifier) VALUES($1,$2,'facebook_group',$3)",[channel,groupWorkspace,group]);
    await pool.query(`INSERT INTO content_artifacts(id,workspace_id,version,content_hash,role,operation,artifact_type,title)
      VALUES($1,$2,2,repeat('a',64),'content','content.manual','social_pack','Group test')`,[artifact,groupWorkspace]);
    const content=(await pool.query(`INSERT INTO contents(workspace_id,title,body_markdown,type,status,created_by)
      VALUES($1,'Group','Text','social_post','published','test') RETURNING id`,[groupWorkspace])).rows[0].id;
    const job=(await pool.query(`INSERT INTO publishing_jobs(workspace_id,content_id,channel_id,artifact_id,scheduled_for,published_at,status,external_post_id)
      VALUES($1,$2,$3,$4,now()-interval '2 days',now()-interval '2 days','published','1138550578642362') RETURNING id`,[groupWorkspace,content,channel,artifact])).rows[0].id;
    const captured=new Date(Date.now()-1000).toISOString(),postCaptured=new Date(Date.now()-2000).toISOString();
    const input={workspace_id:groupWorkspace,group_id:group,source:'facebook_group_browser',captured_at:captured,
      period_from:'2026-10-12',period_to:'2026-11-08',timezone:'provider_unspecified',
      metrics:{posts:6,comments:1,reactions:2,new_members:null},total_members:7,
      source_url:`https://www.facebook.com/groups/${group}/insights/?section=engagement`,
      post:{job_id:job,post_id:'1138550578642362',source_url:`https://www.facebook.com/groups/${group}/posts/1138550578642362/`,
        captured_at:postCaptured,counters:{reactions:1,comments:0,shares:null},external_content_modified:true,observed_text_hash:'a'.repeat(64)}};
    await recordGroupObservation(pool,input);
    const groups=await groupMetricEvidence(pool,groupWorkspace);
    expect(groups[0]).toMatchObject({period_from:'2026-10-12',period_to:'2026-11-08',total_members:7,metrics:{new_members:null,posts:6}});
    expect(await groupMetricEvidence(pool,other)).toEqual([]);
    const posts=await groupPostEvidence(pool,groupWorkspace,new Date(Date.now()-3*86400000),new Date(),new Date());
    expect(posts[0]).toMatchObject({artifact_id:artifact,artifact_version:2,provider:'facebook_group',external_content_modified:true,counters:{reactions:1,comments:0,shares:null}});
    expect(await groupPostEvidence(pool,other,new Date(Date.now()-3*86400000),new Date(),new Date())).toEqual([]);
    await expect(recordGroupObservation(pool,{...input,post:{...input.post,post_id:'99999'}})).rejects.toMatchObject({code:'GROUP_POST_MISMATCH'});
  });

  it('applies new migrations twice without losing data', async () => {
    for (const name of ['024_performance_event_attribution.sql','025_performance_experiments.sql'])
      await pool.query(readFileSync(resolve('../../database/migrations', name),'utf8'));
    expect((await pool.query('SELECT count(*) FROM performance_experiments')).rows[0].count).toBeDefined();
  });

  it('carries version-pinned Facebook evidence and excludes foreign or revoked Page connections', async () => {
    const socialWorkspace = randomUUID(), artifact = randomUUID(), channel = randomUUID();
    await pool.query("INSERT INTO workspaces(id,name,slug) VALUES($1::uuid,'Social contract',$1::text)", [socialWorkspace]);
    await pool.query(`INSERT INTO integration_connections(workspace_id,provider,account_ref,status,verified_at)
      VALUES($1,'facebook_page','123','connected',now())`, [socialWorkspace]);
    await pool.query(`INSERT INTO content_artifacts(id,workspace_id,version,content_hash,role,operation,artifact_type,title)
      VALUES($1,$2,2,repeat('a',64),'content','social.pack','social_pack','Test post')`, [artifact,socialWorkspace]);
    const content = (await pool.query(`INSERT INTO contents(workspace_id,title,body_markdown,type,status,created_by)
      VALUES($1,'Social','Body','social_post','published','test') RETURNING id`, [socialWorkspace])).rows[0].id;
    await pool.query("INSERT INTO channels(id,workspace_id,platform_name,channel_identifier) VALUES($1,$2,'facebook','123')", [channel,socialWorkspace]);
    await pool.query(`INSERT INTO publishing_jobs(workspace_id,content_id,channel_id,artifact_id,scheduled_for,published_at,status,external_post_id)
      VALUES($1,$2,$3,$4,now()-interval '2 days',now()-interval '2 days','published','123_456')`, [socialWorkspace,content,channel,artifact]);
    vi.stubEnv('INTEGRATION_MODE','production'); vi.stubEnv('FACEBOOK_PAGE_ID','123');
    vi.stubEnv('FACEBOOK_PAGE_ACCESS_TOKEN','test-only'); vi.stubEnv('FACEBOOK_GRAPH_API_VERSION','v99.0');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: '123_456', reactions: { summary: { total_count: 0 } }, shares: { count: 8 } }))));
    try {
      const today = new Date().toISOString().slice(0,10), from = new Date(Date.now()-3*86400000).toISOString().slice(0,10);
      await syncFacebookCounters(pool,socialWorkspace,{ from, to: today });
      const args = [new Date(Date.now()-3*86400000),new Date(Date.now()+86400000)] as const;
      const evidence = await socialEvidence(pool,socialWorkspace,...args);
      expect(evidence).toHaveLength(1);
      expect(evidence[0]).toMatchObject({ workspace_id: socialWorkspace, artifact_id: artifact, artifact_version: 2,
        counters: { reactions: 0, comments: null, shares: 8 }, missing_reasons: { comments: 'COUNTER_NOT_RETURNED' } });
      await pool.query(`INSERT INTO metrics_snapshots(workspace_id,provider,metric_name,period_from,period_to,timezone,metric_value,availability,missing_reason,metadata,captured_at)
        SELECT workspace_id,provider,metric_name,current_date-1,current_date-1,timezone,metric_value,availability,missing_reason,metadata,now()-interval '1 day'
        FROM metrics_snapshots WHERE workspace_id=$1 AND provider='facebook_page'`,[socialWorkspace]);
      expect(await socialEvidence(pool,other,...args)).toEqual([]);
      const socialContext = randomUUID();
      await pool.query("INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot) VALUES($1,$2,1,'{}','{}')", [socialContext,socialWorkspace]);
      const first = await ensureMeasurementArtifacts(pool,socialWorkspace,socialContext);
      expect((await ensureMeasurementArtifacts(pool,socialWorkspace,socialContext)).metrics_artifact_id).toBe(first.metrics_artifact_id);
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: '123_456', reactions: { summary: { total_count: 1 } }, comments: { summary: { total_count: 3 } }, shares: { count: 8 } }))));
      await syncFacebookCounters(pool,socialWorkspace,{ from, to: today });
      const updated = await ensureMeasurementArtifacts(pool,socialWorkspace,socialContext);
      expect(updated.created).toBe(true);
      expect(updated.metrics_artifact_id).not.toBe(first.metrics_artifact_id);
      const snapshot = (await pool.query("SELECT payload->'result'->'social_posts' AS posts FROM content_artifacts WHERE id=$1", [updated.metrics_artifact_id])).rows[0];
      expect(snapshot.posts[0].counters).toEqual({ reactions: 1, comments: 3, shares: 8 });
      const history=await facebookHistoryReport(pool,socialWorkspace,{from:today,to:today});
      expect(history.items).toHaveLength(1);
      expect(history.items[0]).toMatchObject({artifact_id:artifact,artifact_version:2});
      expect(history.items[0].comparisons[0]).toMatchObject({baseline_value:0,current_value:1,absolute_change:1,status:'zero_baseline'});
      expect(history.items[0].comparisons[1]).toMatchObject({baseline_value:null,current_value:3,absolute_change:null,status:'baseline_missing'});
      expect((await facebookHistoryReport(pool,other,{from:today,to:today})).items).toEqual([]);
      await pool.query("UPDATE integration_connections SET verified_at=NULL WHERE workspace_id=$1", [socialWorkspace]);
      expect(await socialEvidence(pool,socialWorkspace,...args)).toEqual([]);
    } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
  });

  it('aggregates all historical leads using PostgreSQL timezone boundaries and excludes synthetic data', async () => {
    await pool.query(`INSERT INTO leads(workspace_id,site_id,idempotency_key,payload_hash,contact_email,consent_policy_version,captured_at)
      SELECT $1,'performance-pilot',gen_random_uuid()::text,repeat('a',64),'historical@example.test','test','2026-10-01T17:00:00Z'
      FROM generate_series(1,150)`, [workspace]);
    await pool.query(`INSERT INTO leads(workspace_id,site_id,idempotency_key,payload_hash,contact_email,consent_policy_version,captured_at,context)
      VALUES($1,'performance-pilot',gen_random_uuid()::text,repeat('a',64),'boundary@example.test','test','2026-10-02T17:00:00Z','{}'),
        ($1,'performance-pilot',gen_random_uuid()::text,repeat('a',64),'synthetic@example.test','test','2026-10-02T01:00:00Z','{"synthetic":true}')`, [workspace]);
    expect(await countLeadsInPeriod(pool,workspace,'2026-10-02','2026-10-02','Asia/Ho_Chi_Minh')).toBe(150);
    expect(await countLeadsInPeriod(pool,other,'2026-10-02','2026-10-02','Asia/Ho_Chi_Minh')).toBe(0);
  });

  it('keeps assignment stable, deduplicates exposure and counts only persisted non-synthetic leads after exposure', async () => {
    const trial = await createExperiment(pool, workspace, { hypothesis: 'Specific CTA may improve leads', control_cta: 'Ask TripC', treatment_cta: 'Request guide',
      starts_at: new Date(Date.now()-1000).toISOString(), ends_at: new Date(Date.now()+86400000).toISOString() });
    expect(await assignExperiment(pool,'performance-pilot',{ visitor_id: randomUUID() },false)).toBeNull();
    await expect(changeExperiment(pool,other,trial.id,actor,'start')).rejects.toMatchObject({ code: 'EXPERIMENT_STATE_CONFLICT' });
    await changeExperiment(pool,workspace,trial.id,actor,'start');
    const visitor = randomUUID();
    const assignments = await Promise.all(Array.from({ length: 5 }, () => assignExperiment(pool,'performance-pilot',{ visitor_id: visitor },false)));
    expect(new Set(assignments.map(a => a.assignment_id)).size).toBe(1);
    expect(new Set(assignments.map(a => a.variant)).size).toBe(1);
    const assignment = assignments[0];
    for (let i=0;i<3;i++) await assignExperiment(pool,'performance-pilot',{ visitor_id: visitor, assignment_id: assignment.assignment_id },false);
    const internal = await assignExperiment(pool,'performance-pilot',{ visitor_id: randomUUID() },true);
    await pool.query('UPDATE performance_assignments SET exposed_at=now()-interval \'1 minute\' WHERE id=$1', [internal.assignment_id]);
    await pool.query(`INSERT INTO leads(workspace_id,site_id,idempotency_key,payload_hash,contact_email,consent_policy_version,context)
      SELECT $1,'performance-pilot',gen_random_uuid()::text,repeat('a',64),'synthetic@example.test','test',jsonb_build_object('assignment_id',$2::text,'synthetic',false) FROM generate_series(1,3)`, [workspace,assignment.assignment_id]);
    const results = (await listExperiments(pool,workspace)).find(t => t.id===trial.id)!.results;
    expect(results.variants.reduce((sum,v) => sum+v.exposures,0)).toBe(1);
    expect(results.variants.reduce((sum,v) => sum+v.conversions,0)).toBe(1);
    expect(results.winner).toBeNull();
    expect(await assignExperiment(pool,'performance-other',{ visitor_id: visitor, assignment_id: assignment.assignment_id },false)).toEqual({ recorded: false });
    await changeExperiment(pool,workspace,trial.id,actor,'stop');
    expect(await assignExperiment(pool,'performance-pilot',{ visitor_id: visitor },false)).toBeNull();
  });

  it('deduplicates event retries under concurrency and never treats another article CTA as a qualified visit', async () => {
    const slug = `guide-${randomUUID().slice(0,8)}`;
    const post = (await pool.query(`INSERT INTO contents(workspace_id,title,body_markdown,type,status,created_by,published_at,site_id,slug)
      VALUES($1,'Guide','Body','blog_post','published','test',now(),'performance-pilot',$2) RETURNING id`, [workspace,slug])).rows[0].id;
    const event = { event_id: randomUUID(), event_type: 'cta_click' as const, session_id: 'anonymous-session-1234', path: `/posts/${slug}`, content_slug: slug };
    const results = await Promise.all(Array.from({ length: 8 }, () => recordSiteEvent(pool,'performance-pilot',event,false)));
    expect(results.filter(r => r.recorded)).toHaveLength(1);
    await pool.query(`INSERT INTO site_events(workspace_id,site_id,content_id,event_type,session_id,path,occurred_at)
      VALUES($1,'performance-pilot',$2,'page_view','mismatch','/posts/guide',now()-interval '2 hours'),
        ($1,'performance-pilot',NULL,'cta_click','mismatch','/',now()-interval '1 hour')`, [workspace,post]);
    const measured = await ensureMeasurementArtifacts(pool,workspace,context,0);
    const baseline = await ensureBaselineArtifact(pool,workspace,context,measured.metrics_artifact_id);
    expect(baseline).toBeTruthy();
    const reused = await ensureMeasurementArtifacts(pool,workspace,context);
    expect(reused.metrics_artifact_id).toBe(measured.metrics_artifact_id);
    expect(reused.lead_aggregate_id).toBe(measured.lead_aggregate_id);
    const data = (await pool.query('SELECT payload FROM content_artifacts WHERE id=$1', [measured.metrics_artifact_id])).rows[0].payload;
    expect(data.result.qualified_visits).toBe(0);
    await pool.query(`INSERT INTO site_events(workspace_id,site_id,content_id,event_type,session_id,path,occurred_at)
      VALUES($1,'performance-pilot',$2,'page_view','qualified-session','/posts/guide',now()-interval '3 hours'),
        ($1,'performance-pilot',$2,'cta_click','qualified-session','/posts/guide',now()-interval '2 hours')`, [workspace,post]);
    await pool.query(`INSERT INTO leads(workspace_id,site_id,idempotency_key,payload_hash,contact_email,consent_policy_version,context,captured_at)
      VALUES($1,'performance-pilot',$2,repeat('a',64),'synthetic@example.test','test','{"visitor_id":"qualified-session"}',now()-interval '1 hour')`, [workspace,randomUUID()]);
    const updated = await ensureMeasurementArtifacts(pool,workspace,context,0);
    const actual = (await pool.query('SELECT payload FROM content_artifacts WHERE id=$1', [updated.metrics_artifact_id])).rows[0].payload.result;
    expect(actual.qualified_visits).toBe(1);
    expect(actual.converted_visits).toBe(1);
  });

  it('builds provider aggregates only from a verified bound account and keeps currency and coverage', async () => {
    await pool.query(`INSERT INTO integration_connections(workspace_id,provider,account_ref,status,verified_at)
      VALUES($1,'ga4','property-test','connected',now()),($1,'meta_ads','ad-test','connected',now())`, [workspace]);
    await pool.query(`INSERT INTO metrics_snapshots(workspace_id,provider,metric_name,period_from,period_to,timezone,currency,metric_value,availability,metadata)
      SELECT $1,'ga4','sessions',day::date,day::date,'UTC','VND',10,'available','{"account_ref":"property-test"}'
      FROM generate_series('2026-10-01'::date,'2026-10-07'::date,'1 day'::interval) day`, [workspace]);
    await pool.query(`INSERT INTO metrics_snapshots(workspace_id,provider,metric_name,period_from,period_to,timezone,currency,metric_value,availability,metadata)
      VALUES($1,'meta_ads','ad_spend','2026-10-01','2026-10-01','UTC','USD',25,'available','{"account_ref":"ad-test"}'),
        ($1,'ga4','sessions','2026-10-01','2026-10-01','UTC','VND',999,'available','{"account_ref":"foreign-property"}')`, [workspace]);
    const result = await aggregateProviderMetrics(pool,workspace,new Date('2026-10-01T00:00:00Z'),new Date('2026-10-08T00:00:00Z'));
    expect(result.values.sessions).toBe(70);
    expect(result.coverage.sessions).toMatchObject({ status: 'available', days: 7, expected_days: 7 });
    expect(result.currency).toBe('USD');
    expect(result.coverage.ad_spend.status).toBe('partial');
    expect((await aggregateProviderMetrics(pool,other,new Date('2026-10-01T00:00:00Z'),new Date('2026-10-08T00:00:00Z'))).values.sessions).toBeNull();
  });

  it('owner-approved report action atomically creates one Research task; stale, foreign and non-owner requests fail', async () => {
    await pool.query("INSERT INTO business_profiles(workspace_id,company_name) VALUES($1,'Test')", [workspace]);
    await pool.query("UPDATE knowledge_contexts SET snapshot='{\"sources\":[]}' WHERE snapshot_id=$1", [context]);
    const id = randomUUID(), result = { synthetic: false, status: 'draft', missing_facts: [], actions: [
      { role: 'research', operation: 'research.run', metric_name: 'leads', reason: 'Measured leads declined', priority: 'high' }] };
    const hash = sha256Hex(canonicalJson({ result, evidence: [] }));
    await pool.query(`INSERT INTO content_artifacts(id,workspace_id,context_snapshot_id,content_hash,role,operation,artifact_type,title,payload)
      VALUES($1,$2,$3,$4,'performance','analytics.report','ai_result','Report',$5)`, [id,workspace,context,hash,JSON.stringify({ result })]);
    const input = { artifact_id: id, expected_version: 1, expected_hash: hash, action_index: 0 };
    await expect(approvePerformanceAction(pool,workspace,randomUUID(),input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(approvePerformanceAction(pool,workspace,actor,{ ...input, expected_version: 2 })).rejects.toMatchObject({ code: 'STALE_ARTIFACT' });
    const first = await approvePerformanceAction(pool,workspace,actor,input);
    const again = await approvePerformanceAction(pool,workspace,actor,input);
    expect(again).toEqual({ task_id: first.task_id, deduplicated: true });
    expect((await pool.query('SELECT count(*)::int AS count FROM plan_task_outbox WHERE task_id=$1', [first.task_id])).rows[0].count).toBe(1);
    const task = (await pool.query('SELECT payload FROM workflow_tasks WHERE id=$1', [first.task_id])).rows[0].payload;
    expect(task.input.performance_action).toMatchObject({ reason: 'Measured leads declined', report_artifact_id: id });
  });

  it('releases an expired page slot atomically and keeps a full-horizon verdict under concurrent starts', async () => {
    const input = { hypothesis: 'A clearer CTA may improve leads', control_cta: 'Ask', treatment_cta: 'Get guide',
      starts_at: new Date(Date.now()-1000).toISOString(), ends_at: new Date(Date.now()+86400000).toISOString() };
    const expired = await createExperiment(pool, workspace, input);
    await changeExperiment(pool,workspace,expired.id,actor,'start');
    await pool.query("UPDATE performance_experiments SET starts_at=now()-interval '8 days',ends_at=now()-interval '1 day' WHERE id=$1", [expired.id]);
    const first = await createExperiment(pool,workspace,input), second = await createExperiment(pool,workspace,input);
    const attempts = await Promise.allSettled([first,second].map(trial => changeExperiment(pool,workspace,trial.id,actor,'start')));
    expect(attempts.filter(r => r.status==='fulfilled')).toHaveLength(1);
    const rejected = attempts.find(r => r.status==='rejected') as PromiseRejectedResult;
    expect(rejected.reason.code).toBe('EXPERIMENT_ALREADY_RUNNING');
    const ended = (await pool.query('SELECT * FROM performance_experiments WHERE id=$1',[expired.id])).rows[0];
    expect(ended.status).toBe('stopped');
    expect(ended.stopped_at).toEqual(ended.ends_at);
    for (const trial of [first,second]) await pool.query("UPDATE performance_experiments SET status='stopped',stopped_at=now() WHERE id=$1",[trial.id]);
  });

  it('counts CPL leads at provider-native midnight, excluding the rolling window, foreign sites and synthetic leads', async () => {
    await pool.query(`INSERT INTO leads(workspace_id,site_id,idempotency_key,payload_hash,contact_email,consent_policy_version,captured_at,context)
      VALUES($1,'performance-pilot',gen_random_uuid()::text,repeat('a',64),'before@example.test','test','2026-10-01T06:59:59Z','{}'),
        ($1,'performance-pilot',gen_random_uuid()::text,repeat('a',64),'start@example.test','test','2026-10-01T07:00:00Z','{}'),
        ($1,'performance-pilot',gen_random_uuid()::text,repeat('a',64),'end@example.test','test','2026-10-02T07:00:00Z','{}'),
        ($1,'another-site',gen_random_uuid()::text,repeat('a',64),'foreign-site@example.test','test','2026-10-01T12:00:00Z','{}'),
        ($1,'performance-pilot',gen_random_uuid()::text,repeat('a',64),'fake@example.test','test','2026-10-01T12:00:00Z','{"synthetic":true}')`,[other]);
    const coverage = { status: 'available', from: '2026-10-01', to: '2026-10-01', timezone: 'America/Los_Angeles' };
    expect(await spendWindowLeads(pool,other,'performance-pilot',coverage)).toBe(1);
    expect(await spendWindowLeads(pool,other,'performance-other',coverage)).toBe(0);
    expect(await spendWindowLeads(pool,other,'performance-pilot',{ ...coverage,status:'partial' })).toBeNull();
    expect(await spendWindowLeads(pool,other,'performance-pilot',{ ...coverage,timezone:'unknown' })).toBeNull();
  });
});
