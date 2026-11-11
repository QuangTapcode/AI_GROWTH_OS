import { randomUUID } from 'node:crypto';
import { mkdirSync,writeFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';
import { ensureMeasurementArtifacts } from '../src/modules/site/measurement';

async function main() {
  const url = new URL(process.env.PERFORMANCE_TEST_DATABASE_URL ?? 'invalid:');
  if (!['localhost','127.0.0.1'].includes(url.hostname) || url.pathname !== '/performance_test' || process.env.INTEGRATION_MODE !== 'fake') {
    throw new Error('Requires the dedicated local performance_test DB and INTEGRATION_MODE=fake');
  }
  const pool = new Pool({ connectionString: url.href });
  try {
    const workspace = randomUUID(), context = randomUUID();
    await pool.query("INSERT INTO workspaces(id,name,slug) VALUES($1::uuid,'Synthetic local benchmark',$1::text)", [workspace]);
    await pool.query("INSERT INTO knowledge_contexts(snapshot_id,workspace_id,profile_version,profile,snapshot) VALUES($1,$2,1,'{}','{}')", [context,workspace]);
    const content = (await pool.query(`INSERT INTO contents(workspace_id,title,body_markdown,type,status,created_by,published_at,site_id,slug)
      VALUES($1,'Synthetic benchmark guide','Body','blog_post','published','benchmark',now(),'benchmark',$2) RETURNING id`, [workspace,workspace])).rows[0].id;
    await pool.query(`INSERT INTO site_events(workspace_id,site_id,content_id,event_type,session_id,path,occurred_at)
      SELECT $1,'benchmark',$2,CASE WHEN n%2=0 THEN 'cta_click' ELSE 'page_view' END,
        'benchmark-'||((n+1)/2)::text,'/posts/benchmark',now()-interval '1 day'+(n%2=0)::int*interval '1 second'
      FROM generate_series(1,10000) n`, [workspace,content]);
    await pool.query(`INSERT INTO leads(workspace_id,site_id,idempotency_key,payload_hash,contact_email,consent_policy_version,captured_at)
      SELECT $1,'benchmark','benchmark-'||n::text,repeat('a',64),'benchmark-'||n::text||'@example.test','synthetic-benchmark',now()-interval '1 day'
      FROM generate_series(1,1000) n`, [workspace]);
    // Bulk fixture insertion precedes autovacuum; make planner statistics explicit for this steady-state sample.
    for (const table of ['site_events', 'leads', 'contents', 'publishing_jobs', 'metrics_snapshots']) await pool.query(`ANALYZE ${table}`);
    const samples: number[] = [];
    let counts: unknown;
    for (let i=0;i<21;i++) {
      const started = performance.now();
      const result = await ensureMeasurementArtifacts(pool,workspace,context,0);
      if (i) samples.push(performance.now()-started); // Exclude one warm-up.
      counts = result.counts;
    }
    const plan = (await pool.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
      SELECT count(*) FROM leads WHERE workspace_id=$1 AND captured_at>=now()-interval '7 days'
        AND captured_at<now() AND COALESCE(context->>'synthetic','false') <> 'true'`, [workspace])).rows;
    samples.sort((a,b) => a-b);
    const concurrent = [];
    for (const concurrency of [3,5]) {
      const latencies: number[] = [];
      const begin = performance.now(), until = begin+10000;
      let errors = 0;
      await Promise.all(Array.from({length:concurrency},async()=>{
        while (performance.now()<until) {
          const started=performance.now();
          try {
            const measured=await ensureMeasurementArtifacts(pool,workspace,context,0);
            if (measured.counts?.leads!==1000 || measured.counts?.qualified_visits!==5000) throw new Error('BENCHMARK_COUNT_MISMATCH');
          } catch { errors++; }
          latencies.push(performance.now()-started);
        }
      }));
      latencies.sort((a,b)=>a-b);
      concurrent.push({concurrency,duration_ms:performance.now()-begin,requests:latencies.length,errors,
        p50_ms:latencies[Math.ceil(latencies.length*.5)-1],p95_ms:latencies[Math.ceil(latencies.length*.95)-1],max_ms:latencies[latencies.length-1]});
    }
    const report = { scope: 'local_serial_and_concurrent_snapshot_builder', synthetic_dataset: true,
      postgres: (await pool.query('SHOW server_version')).rows[0].server_version,
      generated_at: new Date().toISOString(), dataset: { events: 10000, leads: 1000 }, counts,
      statistics_mode: 'explicit_analyze_after_bulk_fixture_insert',
      samples: samples.length, p50_ms: samples[Math.ceil(samples.length*.5)-1], p95_ms: samples[Math.ceil(samples.length*.95)-1],
      max_ms: samples[samples.length-1], sample_ms: samples,
      concurrent,
      provider_network_calls: 0, llm_calls: 0, lead_count_query_plan: plan,
      limitations: ['Not a production SLO', '10 seconds per concurrency level; not a soak test', 'No HTTP/browser latency, queue wait or provider latency included'] };
    const target = resolve('../../test-results/performance-benchmark.json');
    mkdirSync(dirname(target),{recursive:true});
    writeFileSync(target,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({ path: target, ...report, lead_count_query_plan: undefined },null,2));
    if (concurrent.some(result=>result.errors)) process.exitCode=1;
  } finally { await pool.end(); }
}
void main().catch(error => { console.error(error); process.exitCode=1; });
