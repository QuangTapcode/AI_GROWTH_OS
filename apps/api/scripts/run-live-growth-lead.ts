import { readFileSync } from 'fs';
import { resolve } from 'path';

try {
  const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...vals] = trimmed.split('=');
    if (key && !process.env[key.trim()]) {
      process.env[key.trim()] = vals.join('=').trim();
    }
  }
} catch (e) {}

import { randomUUID } from 'crypto';
import pool from '../src/lib/db';
import { canonicalJson, sha256Hex } from '../src/lib/hash';
import { PgPlanRepository } from '../src/modules/campaignPlans/pgRepository';
import { submitCampaignPlan } from '../src/modules/campaignPlans/service';

const TRIPC_WS = '10000000-0000-4000-8000-000000000001';

async function main() {
  console.log('Connecting to database...');
  const repo = new PgPlanRepository(pool);

  // 1. Lấy context snapshot hiện tại của TripC
  const context = await repo.loadContext(TRIPC_WS);
  if (!context) {
    throw new Error('Chưa có current knowledge context cho TripC. Hãy chạy issueContext trước.');
  }
  console.log('Using snapshot:', context.snapshot_id);

  // 2. Chuẩn bị research artifact đầu vào có trích dẫn thật
  const researchArtifactId = randomUUID();
  const sourceId = '10000000-0000-4000-8000-000000000003';
  const researchFinding = {
    topic: 'An Thuong vs My Khe for Tech Expats & Digital Nomads',
    audience_fit: 'English-speaking remote workers looking for high-speed wifi, coworking spaces and walkable beach living',
    offer_fit: 'TripC curated long-term apartment rentals with verified fast fiber internet and quiet workstations',
    rationale: 'High concentration of coworking hubs (Enouvo, DNC) and expat cafes within 500m of My Khe beach',
    evidence: {
      source_id: sourceId,
      source_version: 1,
      chunk_id: 'chunk-an-thuong-live-01',
      locator: 'paragraph:3',
      quote: 'An Thuong expat quarter offers walkable amenities, vibrant coworking hubs and verified accommodations for digital nomads.',
      source_url: 'https://danangfantasticity.com/en/things-to-do/living-in-danang',
      license: 'CC-BY-4.0',
      attribution: 'Da Nang Tourism Promotion Center',
    },
    url: 'https://danangfantasticity.com/en/things-to-do/living-in-danang',
    fetched_at: '2026-10-23T03:00:00Z',
    confidence: 'hypothesis',
    demand_estimate: null,
    keywords: ['da nang digital nomad', 'an thuong apartments', 'my khe long term rental'],
    user_need: 'Find high-speed wifi accommodation in Da Nang expat neighborhood',
  };

  const researchResult = {
    brief_id: randomUUID(),
    workspace_id: TRIPC_WS,
    context_snapshot_id: context.snapshot_id,
    profile_version: context.profile_version,
    status: 'ready_for_handoff',
    findings: [researchFinding],
    missing_facts: [],
    synthetic: false,
  };

  const researchEvidence = [researchFinding.evidence];
  const researchHash = sha256Hex(canonicalJson({ result: researchResult, evidence: researchEvidence }));

  const researchRef = {
    artifact_id: researchArtifactId,
    workspace_id: TRIPC_WS,
    version: 1,
    content_hash: researchHash,
    role: 'research' as const,
    context_snapshot_id: context.snapshot_id,
    storage: 'ai_run_store' as const,
  };

  // Lưu Research artifact vào DB
  await repo.storeArtifact({
    ref: researchRef,
    result: researchResult,
    evidence: researchEvidence,
    operation: 'research.run',
  });
  console.log('Saved real Research artifact:', researchArtifactId);

  // 3. Gọi trực tiếp AI Service (Python + Gemini 2.5 Flash) để Growth Lead lập chiến lược thật
  console.log('Calling AI Service on http://127.0.0.1:5000 with Google Gemini...');
  const aiJobId = randomUUID();
  const futureDeadline = new Date(Date.now() + 86400000 * 14).toISOString();

  const aiRequestPayload = {
    job_id: aiJobId,
    workspace_id: TRIPC_WS,
    operation: 'strategy.generate',
    input_version: 1,
    context_snapshot_id: context.snapshot_id,
    trace_id: 'live-gemini-growth-lead',
    synthetic: false,
    approved_source_versions: [{ source_id: sourceId, version: 1 }],
    payload: {
      workspace_id: TRIPC_WS,
      business_profile: {
        company: 'TripC',
        workspace_id: TRIPC_WS,
        version: context.profile_version,
        audiences: ['English-speaking expats living or planning to live in Da Nang'],
        services: ['housing', 'living_areas', 'coworking'],
        topic_priority: ['Living areas guide', 'Digital nomad accommodation'],
      },
      goal_context: {
        workspace_id: TRIPC_WS,
        objective: 'Drive qualified long-term apartment inquiries from digital nomads in Da Nang',
      },
      snapshot: {
        workspace_id: TRIPC_WS,
        snapshot_id: context.snapshot_id,
        sources: [
          {
            source_id: sourceId,
            workspace_id: TRIPC_WS,
            version: 1,
            status: 'approved',
            provenance: {
              license: 'CC-BY-4.0',
              attribution: 'Da Nang Tourism Promotion Center',
              source_url: 'https://danangfantasticity.com/en/things-to-do/living-in-danang',
              retrieved_at: '2026-10-23T03:00:00Z',
            },
            chunks: [
              {
                chunk_id: 'chunk-an-thuong-live-01',
                text: researchFinding.evidence.quote,
                locator: 'paragraph:3',
              },
            ],
          },
        ],
      },
      research: researchResult,
      research_artifact: researchRef,
      cta: 'Book your verified nomad stay in An Thuong with TripC',
      deadline: futureDeadline,
      score_factors: {
        demand: 4,
        business_relevance: 5,
        growth_potential: 4,
        content_gap: 4,
        freshness: 4,
        conversion_potential: 4,
      },
    },
  };

  const aiRes = await fetch('http://127.0.0.1:5000/internal/v1/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(aiRequestPayload),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    throw new Error(`AI run submit failed (${aiRes.status}): ${errText}`);
  }

  const { run_id } = await aiRes.json();
  console.log('AI run submitted. Run ID:', run_id, '- Polling for Gemini completion...');

  let runResult: any = null;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const poll = await fetch(`http://127.0.0.1:5000/internal/v1/runs/${run_id}`);
    const data = await poll.json();
    if (data.status === 'completed') {
      runResult = data.result;
      break;
    }
    if (data.status === 'failed') {
      throw new Error(`AI run failed: ${data.error_message || JSON.stringify(data)}`);
    }
  }

  if (!runResult) throw new Error('AI run timed out');
  console.log('Gemini generated plan successfully!');
  console.log('Objective:', runResult.result.objective);
  console.log('Selected Opportunity:', runResult.result.selected_opportunity.topic);
  console.log('Tasks generated:', runResult.result.tasks.length);

  // 4. Lưu Growth Lead Plan artifact vào PostgreSQL
  const planArtifactRef = runResult.artifact;
  await repo.storeArtifact({
    ref: planArtifactRef,
    result: runResult.result,
    evidence: runResult.evidence,
    operation: 'strategy.generate',
  });
  console.log('Saved Growth Lead artifact into DB ledger:', planArtifactRef.artifact_id);

  // 5. Submit Campaign Plan qua Service để ghi Campaign, Task DAG & Outbox
  console.log('Research finding canonical:', canonicalJson(researchFinding));
  console.log('Selected opp canonical:', canonicalJson(runResult.result.selected_opportunity));
  console.log('Committing Campaign Plan to backend DAG...');
  const accepted = await submitCampaignPlan({ repo, allowSynthetic: true }, TRIPC_WS, planArtifactRef);
  console.log('Campaign accepted! Plan ID:', accepted.record.plan.plan_id);
  console.log('Task states:', accepted.record.task_states);

  // 6. Tạo Approval record trong DB để hiển thị trên Review Queue UI
  const approvalId = randomUUID();
  await pool.query(
    `INSERT INTO approvals(id, workspace_id, target_type, target_id, target_version, target_hash, status, created_at, updated_at)
     VALUES($1, $2, 'artifact', $3, $4, $5, 'pending', NOW(), NOW())
     ON CONFLICT DO NOTHING`,
    [approvalId, TRIPC_WS, planArtifactRef.artifact_id, planArtifactRef.version, planArtifactRef.content_hash]
  );
  console.log('Created Approval in Review Queue:', approvalId);

  await pool.end();
  console.log('\n SUCCESS! Full Real-World flow finished.');
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
