import { createHash } from "node:crypto";
import pool from "../src/lib/db";
import { PgPlanRepository } from "../src/modules/campaignPlans/pgRepository";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001"; // TripC
const OWNER_ID = "a0000000-0000-4000-8000-000000000001";
const SOURCE_ID = "10000000-0000-4000-8000-000000000003";
const CHUNK_IDS = [
  "30000000-0000-4000-8000-000000000001",
  "30000000-0000-4000-8000-000000000002",
];
const SOURCE_URL = "https://tripc.vn/knowledge/demo-staging";
const RETRIEVED_AT = "2026-10-20T10:00:00.000Z";
const METRICS_ARTIFACT_ID = "50000000-0000-4000-8000-000000000001";
const METRICS_SNAPSHOT_ID = "50000000-0000-4000-8000-000000000002";
const CHUNKS = [
  "TripC helps English-speaking expats find housing, coworking and local services in Da Nang.",
  "TripC focuses on housing and local living guidance for people moving to Da Nang.",
];

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV === "production") {
    throw new Error("Refusing to seed synthetic knowledge in production");
  }

  const client = await pool.connect();
  let version = 1;
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE", [WORKSPACE_ID]);
    const existing = (
      await client.query<{ version: number }>("SELECT version FROM sources WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [SOURCE_ID, WORKSPACE_ID])
    ).rows[0];
    version = existing?.version ?? 1;
    const content = CHUNKS.join("\n\n");

    await client.query(
      `INSERT INTO sources
         (id, workspace_id, title, kind, url_or_blob, category, status, version, content_hash,
          reviewed_by, reviewed_at, license, attribution, source_url, upstream_version, retrieved_at,
          deleted_at, updated_at)
       VALUES ($1,$2,$3,'url',$4,'company','approved',$5,$6,$7,NOW(),'demo',
               'Synthetic staging fixture for agent smoke tests',$4,'staging-fixture-v1',$8,NULL,NOW())
       ON CONFLICT (id) DO UPDATE SET
         title=EXCLUDED.title, kind=EXCLUDED.kind, url_or_blob=EXCLUDED.url_or_blob,
         category=EXCLUDED.category, status='approved', version=sources.version,
         content_hash=EXCLUDED.content_hash, reviewed_by=EXCLUDED.reviewed_by,
         reviewed_at=NOW(), license=EXCLUDED.license, attribution=EXCLUDED.attribution,
         source_url=EXCLUDED.source_url, upstream_version=EXCLUDED.upstream_version,
         retrieved_at=EXCLUDED.retrieved_at, deleted_at=NULL, updated_at=NOW()`,
      [SOURCE_ID, WORKSPACE_ID, "TripC demo knowledge (synthetic staging)", SOURCE_URL, version, sha256(content), OWNER_ID, RETRIEVED_AT],
    );

    await client.query("DELETE FROM source_chunks WHERE source_id=$1 AND workspace_id=$2 AND source_version=$3", [SOURCE_ID, WORKSPACE_ID, version]);
    await client.query("DELETE FROM source_facts WHERE source_id=$1 AND workspace_id=$2 AND source_version=$3", [SOURCE_ID, WORKSPACE_ID, version]);
    for (let index = 0; index < CHUNKS.length; index += 1) {
      await client.query(
        `INSERT INTO source_chunks
           (id, workspace_id, source_id, source_version, chunk_index, text_content, citation_locator, model)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'embeddinggemma')`,
        [CHUNK_IDS[index], WORKSPACE_ID, SOURCE_ID, version, index, CHUNKS[index], `paragraph:${index + 1}`],
      );
    }
    await client.query(
      `INSERT INTO source_facts
         (workspace_id, source_id, source_version, fact_key, fact_value, verification_status)
       VALUES ($1,$2,$3,'business_focus','Da Nang housing and local living guidance','verified')`,
      [WORKSPACE_ID, SOURCE_ID, version],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const issued = await new PgPlanRepository(pool).issueContext(WORKSPACE_ID);
  const metricResult = {
    workspace_id: WORKSPACE_ID,
    snapshot_id: METRICS_SNAPSHOT_ID,
    version: 1,
    window_start: "2026-10-01T00:00:00.000Z",
    window_end: "2026-10-20T23:59:59.000Z",
    qualified_visits: 1240,
    leads: 86,
    impressions: 18200,
    clicks: 940,
    synthetic: true,
  };
  const metricEvidence: unknown[] = [];
  const metricHash = sha256(canonical({ result: metricResult, evidence: metricEvidence }));
  const metricArtifact = {
    artifact_id: METRICS_ARTIFACT_ID,
    workspace_id: WORKSPACE_ID,
    version: 1,
    content_hash: metricHash,
    context_snapshot_id: issued.context_snapshot_id,
    role: "performance",
  };
  await pool.query(
    `INSERT INTO content_artifacts
       (id, workspace_id, task_id, version, content_hash, context_snapshot_id, role, operation,
        artifact_type, title, storage, payload, evidence)
     VALUES ($1,$2,NULL,1,$3,$4,'performance','metrics.snapshot','metrics_snapshot',
             'Synthetic Performance Metrics','postgres_ledger',$5::jsonb,$6::jsonb)
     ON CONFLICT (id) DO UPDATE SET
       content_hash=EXCLUDED.content_hash, context_snapshot_id=EXCLUDED.context_snapshot_id,
       payload=EXCLUDED.payload, evidence=EXCLUDED.evidence, created_at=NOW()`,
    [
      METRICS_ARTIFACT_ID,
      WORKSPACE_ID,
      metricHash,
      issued.context_snapshot_id,
      JSON.stringify({ artifact: metricArtifact, result: metricResult }),
      JSON.stringify(metricEvidence),
    ],
  );
  console.log(JSON.stringify({
    workspace_id: WORKSPACE_ID,
    source_id: SOURCE_ID,
    source_version: version,
    context_snapshot_id: issued.context_snapshot_id,
    approved_source_versions: issued.approved_source_versions,
    metrics_artifact_id: METRICS_ARTIFACT_ID,
    metric_snapshot_id: METRICS_SNAPSHOT_ID,
    synthetic: true,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
