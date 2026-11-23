import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { AiAdapter } from '../adapters/AiAdapter';

const canonical = (value: unknown): string => JSON.stringify(sort(value));
function sort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, v]) => [key, sort(v)]));
  return value;
}

// 768 numbers at four decimals are about 6.5 KB per chunk; stay well below the AI service's 8 MB request limit.
// Above this the question is matched by keywords only (an English source rarely shares words with a
// Vietnamese question). 800 was passed on 08/11 when the corpus grew to 1,301 chunks; packed vectors
// make 3,000 chunks a request of roughly 12 MB, inside AI_MAX_REQUEST_BYTES.
const MAX_CHUNKS_WITH_VECTORS = 3000;

type SnapshotChunks = { sources: { chunks: { chunk_id: string }[] }[] };

/**
 * "f16:" + base64 of little-endian float16 (AI SnapshotChunk accepts it). About 2 KB per 768-d vector
 * instead of ~5.4 KB of JSON numbers; float16 keeps about 3 significant digits, enough for cosine ranking.
 */
export function packEmbedding(vector: number[]): string {
  const out = Buffer.alloc(vector.length * 2);
  vector.forEach((value, index) => out.writeUInt16LE(toFloat16Bits(value), index * 2));
  return `f16:${out.toString('base64')}`;
}

const f32 = new Float32Array(1);
const u32 = new Uint32Array(f32.buffer);

/** IEEE 754 half-precision bits, round half up (Float16Array is not available on every supported Node). */
function toFloat16Bits(value: number): number {
  f32[0] = value;
  const bits = u32[0];
  const sign = (bits >>> 16) & 0x8000;
  const exponent = ((bits >>> 23) & 0xff) - 127 + 15;
  const mantissa = bits & 0x7fffff;
  if (((bits >>> 23) & 0xff) === 0xff) return sign | 0x7c00 | (mantissa ? 0x200 : 0);
  if (exponent >= 31) return sign | 0x7c00;
  if (exponent <= 0) {
    if (exponent < -10) return sign;
    return sign | (((mantissa | 0x800000) >> (1 - exponent)) + 0x1000 >> 13);
  }
  // Adding (not OR-ing) lets a rounding carry move into the exponent.
  return sign | ((exponent << 10) + ((mantissa + 0x1000) >> 13));
}

const vectorSnapshotCache = new Map<string, SnapshotChunks>();

/** Vectors stored at ingest, so a question is compared with the corpus without embedding it again. Never kept in the pinned context. */
async function withStoredVectors(pool: Pool, workspaceId: string, snapshot: SnapshotChunks & { snapshot_id?: string }) {
  const cacheKey = snapshot.snapshot_id ? `${workspaceId}:${snapshot.snapshot_id}` : '';
  if (cacheKey && vectorSnapshotCache.has(cacheKey)) {
    return vectorSnapshotCache.get(cacheKey)!;
  }
  const ids = snapshot.sources.flatMap((source) => source.chunks.map((chunk) => chunk.chunk_id));
  if (!ids.length || ids.length > MAX_CHUNKS_WITH_VECTORS) return snapshot;
  const rows = (await pool.query<{ id: string; model: string | null; embedding: string }>(
    'SELECT id, model, embedding::text AS embedding FROM source_chunks WHERE workspace_id=$1 AND id::text=ANY($2::text[]) AND embedding IS NOT NULL',
    [workspaceId, ids])).rows;
  const stored = new Map(rows.map((row) => [row.id, row]));
  const withVector = (chunk: { chunk_id: string }) => {
    const row = stored.get(chunk.chunk_id);
    if (!row) return chunk;
    return { ...chunk, model: row.model, embedding: packEmbedding(JSON.parse(row.embedding) as number[]) };
  };
  const enriched = { ...snapshot, sources: snapshot.sources.map((source) => ({ ...source, chunks: source.chunks.map(withVector) })) };
  if (cacheKey) {
    if (vectorSnapshotCache.size >= 3) {
      const oldest = vectorSnapshotCache.keys().next().value;
      if (oldest) vectorSnapshotCache.delete(oldest);
    }
    vectorSnapshotCache.set(cacheKey, enriched);
  }
  return enriched;
}

/** Durable DB outbox consumer; one task per tick, stable AI idempotency across lease recovery. */
/**
 * What customers asked before this task, newest first. A community lead's topic is a fixed label and its
 * message is already counted; "general" is what a form records when nothing was chosen.
 */
export async function customerSignals(pool: Pool, workspaceId: string, until: Date | string) {
  return (await pool.query<{ signal: string }>(`
    SELECT signal FROM (
      SELECT left(trim(content), 240) AS signal, received_at AS at FROM community_messages
       WHERE workspace_id = $1 AND received_at <= $2 AND length(trim(content)) >= 6
      UNION ALL
      SELECT left(trim(interest_topic), 240), captured_at FROM leads
       WHERE workspace_id = $1 AND captured_at <= $2 AND length(trim(interest_topic)) >= 4 AND interest_topic <> 'general'
         AND COALESCE(context->>'synthetic', 'false') <> 'true' AND utm_source IS DISTINCT FROM 'community'
    ) asked GROUP BY signal ORDER BY max(at) DESC LIMIT 15`, [workspaceId, until])).rows.map((row) => row.signal);
}

function currentVietnamCampaignWeekWorker(now: Date = new Date()): number {
  const vnTime = new Date(now.getTime() + 7 * 3600_000);
  const targetMs = Date.UTC(vnTime.getUTCFullYear(), vnTime.getUTCMonth(), vnTime.getUTCDate());
  if (targetMs < Date.UTC(2026, 10, 9)) return 1;
  if (targetMs < Date.UTC(2026, 10, 16)) return 2;
  if (targetMs < Date.UTC(2026, 10, 23)) return 3;
  return 4;
}

async function loadCommunityContextForGrowthLead(pool: Pool, workspaceId: string): Promise<Record<string, unknown> | null> {
  try {
    const settings = (
      await pool.query<{
        community_name: string | null;
        group_member_count: number | null;
        auto_reply_comments: boolean | null;
        auto_invite_enabled: boolean | null;
        daily_invite_limit: number | null;
      }>(
        `SELECT community_name, group_member_count, auto_reply_comments, auto_invite_enabled, daily_invite_limit
           FROM community_hub_settings WHERE workspace_id = $1 LIMIT 1`,
        [workspaceId],
      )
    ).rows[0];
    if (!settings) return null;

    const latestSnap = (
      await pool.query<{ group_member_count: number; page_followers_count: number | null }>(
        `SELECT group_member_count, page_followers_count FROM community_member_snapshots
          WHERE workspace_id = $1 ORDER BY captured_at DESC LIMIT 1`,
        [workspaceId],
      )
    ).rows[0];
    const w1Snap = (
      await pool.query<{ group_member_count: number }>(
        `SELECT group_member_count FROM community_member_snapshots
          WHERE workspace_id = $1 AND campaign_week = 1 ORDER BY captured_at ASC LIMIT 1`,
        [workspaceId],
      )
    ).rows[0];
    const stats = (
      await pool.query<{ prospects: number; invites_7d: number; replies_7d: number; pending: number }>(
        `SELECT
           (SELECT count(*)::int FROM community_hub_members WHERE workspace_id = $1 AND external_ref LIKE 'fb:%') AS prospects,
           (SELECT count(*)::int FROM community_invite_logs WHERE workspace_id = $1 AND status = 'invited' AND invited_at >= NOW() - INTERVAL '7 days') AS invites_7d,
           (SELECT count(*)::int FROM community_messages WHERE workspace_id = $1 AND status = 'replied' AND updated_at >= NOW() - INTERVAL '7 days') AS replies_7d,
           (SELECT count(*)::int FROM community_messages WHERE workspace_id = $1 AND status IN ('received', 'queued')) AS pending`,
        [workspaceId],
      )
    ).rows[0];

    const dailyCap = Math.max(10, Math.min(15, Math.round(settings.daily_invite_limit ?? 12)));
    return {
      group_name: settings.community_name ?? undefined,
      current_members: Math.max(0, latestSnap?.group_member_count ?? settings.group_member_count ?? 5),
      week1_baseline_members: w1Snap?.group_member_count ?? settings.group_member_count ?? 5,
      page_followers: latestSnap?.page_followers_count ?? null,
      identified_prospects: stats?.prospects ?? 0,
      invites_sent_7d: stats?.invites_7d ?? 0,
      comments_replied_7d: stats?.replies_7d ?? 0,
      pending_questions: stats?.pending ?? 0,
      current_campaign_week: currentVietnamCampaignWeekWorker(),
      daily_invite_cap: dailyCap,
      auto_reply_comments: settings.auto_reply_comments !== false,
      auto_invite_enabled: settings.auto_invite_enabled !== false,
    };
  } catch {
    return null;
  }
}

async function tryAutoApplyCommunityPlan(
  pool: Pool,
  workspaceId: string,
  artifactId: string,
  output: Record<string, unknown>,
): Promise<void> {
  const cgp = output.community_growth_plan as {
    source?: string;
    week1_target?: number;
    week2_target?: number;
    week3_target?: number;
    week4_target?: number;
    recommended_daily_invite_limit?: number;
    weekly_targets?: unknown[];
    rationale?: string;
    current_members?: number;
    recommended_auto_reply_comments?: boolean;
    recommended_auto_invite_enabled?: boolean;
  } | undefined;
  if (!cgp || cgp.source !== 'growth_lead_agent') return;
  if (
    typeof cgp.week1_target !== 'number' ||
    typeof cgp.week2_target !== 'number' ||
    typeof cgp.week3_target !== 'number' ||
    typeof cgp.week4_target !== 'number'
  ) {
    return;
  }
  const dailyLimit = Math.max(10, Math.min(15, Math.round(cgp.recommended_daily_invite_limit ?? 12)));
  const planId = typeof output.plan_id === 'string' ? output.plan_id : null;
  try {
    const existing = (
      await pool.query<{ target_source?: string | null }>(
        'SELECT target_source FROM community_hub_settings WHERE workspace_id = $1 LIMIT 1',
        [workspaceId],
      )
    ).rows[0];
    if (!existing) {
      await pool.query(
        `INSERT INTO community_hub_settings (
          workspace_id, community_name, group_url, publish_target, page_name, page_url, positioning,
          group_member_count, week1_target, week2_target, week3_target, week4_target,
          target_source, strategy_artifact_id, strategy_plan_id, target_rationale, target_updated_at,
          weekly_targets_json, auto_reply_comments, auto_invite_enabled, daily_invite_limit
        ) VALUES (
          $1, 'Cộng đồng Du lịch & Sống tại Việt Nam', 'https://www.facebook.com/groups/1134282109069209',
          'group', 'Dịch vụ hỗ trợ du lịch', 'https://www.facebook.com/profile.php?id=61596152213281',
          'Không gian chia sẻ kinh nghiệm Du lịch & Sống tại Việt Nam.',
          $2, $3, $4, $5, $6,
          'growth_lead_agent', $7, $8, $9, NOW(), $10::jsonb, $11, $12, $13
        ) ON CONFLICT (workspace_id) DO NOTHING`,
        [
          workspaceId,
          Math.max(0, cgp.current_members ?? 5),
          cgp.week1_target,
          cgp.week2_target,
          cgp.week3_target,
          cgp.week4_target,
          artifactId,
          planId,
          cgp.rationale ?? null,
          JSON.stringify(cgp.weekly_targets ?? []),
          cgp.recommended_auto_reply_comments !== false,
          cgp.recommended_auto_invite_enabled !== false,
          dailyLimit,
        ],
      );
      return;
    }
    if (existing.target_source === 'locked_manual') return;
    await pool.query(
      `UPDATE community_hub_settings
          SET week1_target = $2,
              week2_target = $3,
              week3_target = $4,
              week4_target = $5,
              daily_invite_limit = $6,
              target_source = 'growth_lead_agent',
              strategy_artifact_id = $7,
              strategy_plan_id = COALESCE($8, strategy_plan_id),
              target_rationale = $9,
              weekly_targets_json = $10::jsonb,
              target_updated_at = NOW(),
              updated_at = NOW()
        WHERE workspace_id = $1`,
      [
        workspaceId,
        cgp.week1_target,
        cgp.week2_target,
        cgp.week3_target,
        cgp.week4_target,
        dailyLimit,
        artifactId,
        planId,
        cgp.rationale ?? null,
        JSON.stringify(cgp.weekly_targets ?? []),
      ],
    );
  } catch {
    // community_hub_settings may be absent in isolated worker unit tests
  }
}

export class PlanOutboxRunner {
  constructor(private pool: Pool, private ai: AiAdapter) {}

  async runOnce() {
    await this.pool.query(`WITH expired AS (UPDATE plan_task_outbox SET status='failed',error_code='LEASE_EXHAUSTED',lease_until=NULL
      WHERE status='claimed' AND lease_until<now() AND attempts>=3 RETURNING task_id)
      UPDATE workflow_tasks SET status='failed',error_details='{"code":"LEASE_EXHAUSTED"}',updated_at=now() WHERE id IN(SELECT task_id FROM expired)`);
    const claimed = (await this.pool.query(`UPDATE plan_task_outbox SET status='claimed',lease_until=now()+interval '10 minutes',attempts=attempts+1
      WHERE id=(SELECT id FROM plan_task_outbox WHERE (status='pending' OR (status='claimed' AND lease_until<now())) AND attempts<3 ORDER BY (operation = 'community.response') DESC, created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`)).rows[0];
    if (!claimed) return null;
    try {
      let task = (await this.pool.query('SELECT * FROM workflow_tasks WHERE workspace_id=$1 AND id=$2', [claimed.workspace_id, claimed.task_id])).rows[0];
      if (!task || !['queued', 'running'].includes(task.status)) throw new Error('TASK_NOT_RUNNABLE');
      const deadline = task?.payload?.deadline ?? task?.payload?.input?.deadline;
      if (deadline && Date.parse(deadline) <= Date.now()) throw new Error('TASK_DEADLINE_EXCEEDED');
      let context = (await this.pool.query('SELECT * FROM knowledge_contexts WHERE workspace_id=$1 AND snapshot_id=$2 AND current', [claimed.workspace_id, task.context_snapshot_id])).rows[0];
      if (!context && task.operation === 'community.response') {
        // A customer's question belongs to no campaign: a context issued while it waited makes the answer better, not invalid.
        // New input_version, because the AI service must not treat the re-pinned request as a conflicting retry.
        context = (await this.pool.query('SELECT * FROM knowledge_contexts WHERE workspace_id=$1 AND current', [claimed.workspace_id])).rows[0];
        if (context) {
          task = (await this.pool.query('UPDATE workflow_tasks SET context_snapshot_id=$2,input_version=input_version+1,updated_at=now() WHERE id=$1 RETURNING *', [task.id, context.snapshot_id])).rows[0];
          await this.pool.query('UPDATE plan_task_outbox SET input_version=$2 WHERE id=$1', [claimed.id, task.input_version]);
        }
      }
      const profile = (await this.pool.query('SELECT version FROM business_profiles WHERE workspace_id=$1', [claimed.workspace_id])).rows[0];
      if (!context || profile?.version !== context.profile_version) throw new Error('STALE_CONTEXT');
      const expectedSources = Array.isArray(context.snapshot?.sources) ? context.snapshot.sources : [];
      if (expectedSources.length > 0) {
        const approvedRows = (await this.pool.query<{ id: string; version: number }>(
          "SELECT id, version FROM sources WHERE workspace_id=$1 AND id=ANY($2::uuid[]) AND status='approved' AND deleted_at IS NULL",
          [claimed.workspace_id, expectedSources.map((s: { source_id: string }) => s.source_id)],
        )).rows;
        const approvedMap = new Map(approvedRows.map((r) => [r.id, r.version]));
        for (const source of expectedSources) {
          if (approvedMap.get(source.source_id) !== source.version) throw new Error('SOURCE_NOT_APPROVED');
        }
      }
      const load = async (id: string) => {
        const row = (await this.pool.query('SELECT payload,evidence FROM content_artifacts WHERE workspace_id=$1 AND id=$2', [claimed.workspace_id, id])).rows[0];
        if (!row?.payload?.artifact) throw new Error('MISSING_ARTIFACT');
        return { artifact: row.payload.artifact, result: row.payload.result, evidence: row.evidence };
      };
      const taskInput = (task.payload?.input && typeof task.payload.input === 'object')
        ? task.payload.input as Record<string, any>
        : task.payload as Record<string, any>;
      const payload: Record<string, unknown> = { workspace_id: claimed.workspace_id, business_profile: context.profile,
        snapshot: context.snapshot, goal_context: context.goal };
      if (['seo.audit', 'seo.local_draft', 'content.refresh'].includes(task.operation)) {
        const researchId = taskInput.research_artifact_id ?? task.payload.input_artifact_refs?.[0]?.artifact_id;
        if (!researchId) throw new Error('MISSING_RESEARCH_ARTIFACT');
        payload.cta = taskInput.cta ?? task.payload.brief?.cta;
        if (typeof payload.cta !== 'string' || !payload.cta.trim()) throw new Error('MISSING_CTA');
        payload.research = await load(researchId);
        // Write about the opportunity Growth Lead selected (its brief topic), not whichever finding is first.
        const findings = ((payload.research as { result?: { findings?: { topic?: string }[] } }).result?.findings) ?? [];
        const selected = findings.findIndex((f) => f.topic === task.payload.brief?.topic);
        const findingIndex = typeof taskInput.finding_index === 'number' ? taskInput.finding_index : selected >= 0 ? selected : 0;
        if (findingIndex < 0 || findingIndex >= findings.length) throw new Error('SELECTED_FINDING_MISSING');
        payload.finding_index = findingIndex;
      } else if (['content.generate', 'content.repurpose', 'content.quality_check'].includes(task.operation)) {
        payload.cta = taskInput.cta ?? task.payload.brief?.cta;
        if (typeof payload.cta !== 'string' || !payload.cta.trim()) throw new Error('MISSING_CTA');
        let parentId = taskInput.source_article_id;
        if (!parentId && Array.isArray(task.payload.depends_on) && task.payload.depends_on[0]) {
          parentId = (await this.pool.query("SELECT result_ref FROM workflow_tasks WHERE workspace_id=$1 AND id=$2 AND status='completed'", [claimed.workspace_id, task.payload.depends_on[0]])).rows[0]?.result_ref;
        }
        if (!parentId) throw new Error('DEPENDENCY_NOT_APPROVED');
        payload.source_article = await load(parentId);
        let rawAssets = taskInput.assets ?? context.assets;
        if (Array.isArray(rawAssets) && rawAssets.length > 1) {
          const recentImages = (await this.pool.query<{ url: string }>(`
            SELECT payload->'result'->'image_assets'->0->>'url' AS url
              FROM content_artifacts
             WHERE workspace_id = $1 AND role = 'content'
               AND payload->'result'->'image_assets'->0->>'url' IS NOT NULL
             ORDER BY created_at DESC LIMIT 12`, [claimed.workspace_id])).rows.map(r => r.url);
          const usedOrder = new Map<string, number>();
          recentImages.forEach((url, idx) => {
            if (url && !usedOrder.has(url)) usedOrder.set(url, idx);
          });
          const freshAssets = rawAssets.filter((a: any) => !usedOrder.has(a?.url));
          if (freshAssets.length > 0) {
            rawAssets = freshAssets;
          } else {
            rawAssets = [...rawAssets].sort((a: any, b: any) => {
              const rankA = usedOrder.has(a?.url) ? (1000 - (usedOrder.get(a?.url) ?? 0)) : 0;
              const rankB = usedOrder.has(b?.url) ? (1000 - (usedOrder.get(b?.url) ?? 0)) : 0;
              return rankA - rankB;
            });
          }
        }
        payload.assets = Array.isArray(rawAssets) ? rawAssets.slice(0, 10) : rawAssets;
        if (Array.isArray(taskInput.target_channels)) payload.target_channels = taskInput.target_channels;
        const automation = (await this.pool.query(
          'SELECT auto_publish_facebook,auto_approve_outputs FROM agent_automation WHERE workspace_id=$1',
          [claimed.workspace_id],
        )).rows[0];
        if (automation?.auto_publish_facebook === true) {
          // A TikTok target would hold the post on video assets; the script alone goes to the reviewer.
          payload.target_channels = ['facebook'];
          payload.draft_tiktok_script = true;
        }
        // An illustration waits for a person, so an unattended run would pay for one nobody looks at.
        if (automation?.auto_approve_outputs === true) payload.allow_ai_image = false;
      } else if (['strategy.generate', 'opportunity.score', 'brief.generate'].includes(task.operation)) {
        const researchId = taskInput.research_artifact_id;
        if (!researchId) throw new Error('MISSING_RESEARCH_ARTIFACT');
        const research = await load(researchId);
        payload.research = research.result; payload.research_artifact = research.artifact;
        payload.cta = taskInput.cta; payload.deadline = taskInput.deadline;
        payload.score_factors = taskInput.score_factors ?? {};
        const measured = (await this.pool.query(`SELECT payload,evidence FROM content_artifacts
          WHERE workspace_id=$1 AND context_snapshot_id=$2 AND operation='metrics.snapshot'
          ORDER BY (payload->'result'->>'window_end')::timestamptz DESC LIMIT 1`, [claimed.workspace_id, context.snapshot_id])).rows[0];
        if (measured?.payload?.artifact) payload.latest_metrics = { artifact: measured.payload.artifact, result: measured.payload.result, evidence: measured.evidence };
        const communityContext = await loadCommunityContextForGrowthLead(this.pool, claimed.workspace_id);
        if (communityContext) payload.community_context = communityContext;
      } else if (task.operation === 'community.response') {
        payload.question = taskInput.question;
        if (Array.isArray(taskInput.history) && taskInput.history.length > 0) {
          payload.history = taskInput.history;
        }
        payload.snapshot = await withStoredVectors(this.pool, claimed.workspace_id, context.snapshot);
      } else if (task.operation === 'analytics.report' || task.operation === 'experiment.hypothesis') {
        payload.metrics = taskInput.metrics_artifact_id ? await load(taskInput.metrics_artifact_id) : null;
        payload.baseline_metrics = taskInput.baseline_metrics_artifact_id ? await load(taskInput.baseline_metrics_artifact_id) : null;
        if (task.operation === 'experiment.hypothesis') payload.experiment = taskInput.experiment;
      } else if (task.operation === 'learning.analyze') {
        const input = taskInput;
        payload.performance = input.performance_artifact_id ? await load(input.performance_artifact_id) : null;
        payload.lead_summary = input.lead_summary_artifact_id ? await load(input.lead_summary_artifact_id) : null;
        payload.iteration = input.iteration; payload.max_iterations = input.max_iterations; payload.task_quota = input.task_quota;
      } else if (task.operation === 'research.run') {
        // Both the current nested envelope and already queued v1 tasks retain the approved proposal.
        const action = taskInput.performance_action ?? task.payload.performance_action;
        if (action) payload.performance_action = {
          metric_name: action.metric_name, reason: action.reason,
          report_artifact_id: action.report_artifact_id,
        };
        // A round opened by Learning carries what it observed about past articles.
        if (taskInput.lessons) payload.lessons = taskInput.lessons;
        payload.content_inventory = (await this.pool.query(`SELECT content_id,workspace_id,version,title,evidence_quotes,evidence_chunk_ids FROM (
          SELECT id AS content_id,workspace_id,1 AS version,left(title,200) AS title,created_at,'[]'::jsonb AS evidence_quotes,
            '[]'::jsonb AS evidence_chunk_ids,1 AS rank_group FROM contents WHERE workspace_id=$1 AND type <> 'social_post'
          UNION ALL
          SELECT id AS content_id,workspace_id,version,left(payload->'result'->>'title',200) AS title,created_at,
            (SELECT coalesce(jsonb_agg(e->>'quote'),'[]'::jsonb) FROM (SELECT e FROM jsonb_array_elements(evidence) e LIMIT 10) q) AS evidence_quotes,
            (SELECT coalesce(jsonb_agg(e->>'chunk_id'),'[]'::jsonb) FROM (SELECT e FROM jsonb_array_elements(evidence) e LIMIT 10) q) AS evidence_chunk_ids,
            1 AS rank_group
          FROM content_artifacts WHERE workspace_id=$1 AND role='seo' AND payload->'result'->>'title' IS NOT NULL
          UNION ALL
          -- Articles already on the business's own blog: a topic they cover is not new content. Titles only,
          -- so their facts can still be cited for a different topic.
          SELECT id AS content_id,workspace_id,version,left(regexp_replace(title,'\\s*\\((tripc\\.ai|tripc\\.vn)\\)\\s*$',''),200) AS title,
            created_at,'[]'::jsonb AS evidence_quotes,'[]'::jsonb AS evidence_chunk_ids,0 AS rank_group
          FROM sources WHERE workspace_id=$1 AND status='approved' AND deleted_at IS NULL AND license='TripC first-party content'
            AND COALESCE(source_url,url_or_blob) ~ '^https://(www\\.)?tripc\\.(ai|vn)/blog/'
          ) inventory WHERE title IS NOT NULL AND length(trim(title))>0 ORDER BY rank_group, created_at DESC LIMIT 100`, [claimed.workspace_id])).rows;
        // The business's own sites, so Research can tell which searched topics it is absent from.
        payload.own_domains = (await this.pool.query<{ domain: string }>(
          `SELECT DISTINCT lower(regexp_replace(substring(COALESCE(source_url,url_or_blob) from '^https?://([^/:]+)'),'^www\\.','')) AS domain
             FROM sources WHERE workspace_id=$1 AND status='approved' AND deleted_at IS NULL
              AND (license ILIKE '%first-party%' OR license ILIKE '%-owned%') LIMIT 10`, [claimed.workspace_id],
        )).rows.map((r) => r.domain).filter(Boolean);
        const measured = (await this.pool.query(`SELECT a.payload,a.evidence FROM content_artifacts a
          JOIN integration_connections c ON c.workspace_id=a.workspace_id AND c.provider='gsc'
            AND c.account_ref=a.payload->'result'->>'site_url' AND c.status='connected' AND c.verified_at IS NOT NULL
          WHERE a.workspace_id=$1 AND a.context_snapshot_id=$2 AND a.operation='research.search_metrics'
            AND a.created_at<=$3 AND a.created_at>now()-interval '7 days'
          ORDER BY a.created_at DESC LIMIT 1`, [claimed.workspace_id, context.snapshot_id, task.created_at])).rows[0];
        if (measured?.payload?.artifact) payload.search_metrics = { ...measured.payload, evidence: measured.evidence };
        else payload.search_metrics_missing_reason = 'gsc_snapshot_missing_or_stale';
        // Latest search landscape observed before the task: metadata only, never page text.
        // Rank in the previous run (same query + URL) tells Research what is new or rising.
        payload.trend_signals = (await this.pool.query(`WITH runs AS (SELECT discovery_run_id, max(observed_at) AS at FROM trend_signals
            WHERE workspace_id=$1 AND observed_at<=$2 GROUP BY discovery_run_id ORDER BY at DESC LIMIT 2),
          cur AS (SELECT discovery_run_id FROM runs ORDER BY at DESC LIMIT 1),
          prev AS (SELECT discovery_run_id FROM runs ORDER BY at ASC LIMIT 1 OFFSET 0)
          SELECT s.id AS signal_id, s.query, s.rank, s.title, s.url, s.domain, s.observed_at, p.rank AS previous_rank,
            (p.id IS NULL AND (SELECT count(*) FROM runs) > 1 AND EXISTS (SELECT 1 FROM trend_signals q WHERE q.workspace_id=s.workspace_id
              AND q.discovery_run_id=(SELECT discovery_run_id FROM prev) AND q.query=s.query)) AS is_new
          FROM trend_signals s LEFT JOIN trend_signals p ON p.workspace_id=s.workspace_id AND (SELECT count(*) FROM runs) > 1
            AND p.discovery_run_id=(SELECT discovery_run_id FROM prev) AND p.query=s.query AND p.url=s.url
          WHERE s.workspace_id=$1 AND s.discovery_run_id=(SELECT discovery_run_id FROM cur)
          ORDER BY s.rank, s.query LIMIT 30`, [claimed.workspace_id, task.created_at])).rows
          .map((row: { observed_at: Date | string }) => ({ ...row, observed_at: new Date(row.observed_at).toISOString() }));
        const signals = await customerSignals(this.pool, claimed.workspace_id, task.created_at);
        if (signals.length > 0) payload.customer_signals = signals;
      } else throw new Error('UNKNOWN_PLAN_OPERATION');
      await this.pool.query("UPDATE workflow_tasks SET status='running',started_at=COALESCE(started_at,now()),updated_at=now() WHERE id=$1 AND status NOT IN ('completed','cancelled','failed')", [task.id]);
      const result = await this.ai.run({ operation: 'content', aiOperation: task.operation, input: payload,
        job_id: task.id, workspace_id: claimed.workspace_id, input_version: task.input_version,
        trace_id: `plan-task:${task.id}`, context_snapshot_id: context.snapshot_id,
        // Draft generation on a local model exceeds the 120s default; AI caps this at its job deadline.
        timeout_seconds: 600,
        approved_source_versions: context.snapshot.sources.map((s: { source_id: string; version: number }) => ({ source_id: s.source_id, version: s.version })),
        synthetic: Boolean(task.payload.synthetic || (payload.research as { result?: { synthetic?: boolean } })?.result?.synthetic ||
          (payload.source_article as { result?: { synthetic?: boolean } })?.result?.synthetic ||
          Object.values(payload).some(value => Boolean((value as { result?: { synthetic?: boolean }; synthetic?: boolean } | null)?.result?.synthetic || (value as { synthetic?: boolean } | null)?.synthetic))) });
      const artifact = result.artifact as { artifact_id: string; workspace_id: string; version: number; content_hash: string; context_snapshot_id: string; role: string } | null;
      if (!artifact || artifact.workspace_id !== claimed.workspace_id || artifact.version !== task.input_version || artifact.context_snapshot_id !== context.snapshot_id || artifact.role !== task.role)
        throw new Error('INVALID_AI_ARTIFACT');
      const hash = createHash('sha256').update(canonical({ result: result.output, evidence: result.evidence ?? [] })).digest('hex');
      if (hash !== artifact.content_hash) throw new Error('ARTIFACT_HASH_MISMATCH');
      const db = await this.pool.connect();
      try {
        await db.query('BEGIN');
        const lease = (await db.query("SELECT id FROM plan_task_outbox WHERE id=$1 AND status='claimed' AND attempts=$2 FOR UPDATE", [claimed.id, claimed.attempts])).rows[0];
        if (!lease) throw new Error('LEASE_LOST');
        await db.query('SELECT id FROM workflow_tasks WHERE id=$1 FOR UPDATE', [task.id]);
        await db.query(`INSERT INTO content_artifacts(id,workspace_id,task_id,version,content_hash,context_snapshot_id,role,operation,artifact_type,title,storage,payload,evidence)
          VALUES($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::varchar,$6::uuid,$7::varchar,$8::varchar,'ai_result',$7::varchar,'ai_run_store',$9::jsonb,$10::jsonb) ON CONFLICT(id) DO NOTHING`,
          [artifact.artifact_id, claimed.workspace_id, task.id, artifact.version, hash, context.snapshot_id, task.role, task.operation,
            JSON.stringify({ artifact, result: result.output, run_metadata: { run_id: result.run_id, model_version: result.model,
              prompt_version: result.prompt_version, input_version: task.input_version, trace_id: `plan-task:${task.id}`, provider_calls: result.provider_calls } }), JSON.stringify(result.evidence ?? [])]);
        const saved = (await db.query('SELECT workspace_id,content_hash FROM content_artifacts WHERE id=$1', [artifact.artifact_id])).rows[0];
        if (saved?.workspace_id !== claimed.workspace_id || saved.content_hash !== hash) throw new Error('ARTIFACT_HASH_MISMATCH');
        const requiresApproval = task.payload?.requires_human_approval !== false;
        if (requiresApproval) {
          // The review UI reads the approval ledger, while the worker owns
          // artifact creation. Create the pending approval in the same
          // transaction so an awaiting task can never become invisible to
          // Review Queue. The guard keeps retries idempotent and allows a
          // fresh approval after a previous rejection/revocation.
          await db.query(`
            INSERT INTO approvals (workspace_id, target_type, target_id, target_version, target_hash, status)
            SELECT $1::uuid, 'artifact', $2::uuid, $3::integer, $4::varchar, 'pending'
            WHERE NOT EXISTS (
              SELECT 1 FROM approvals
              WHERE workspace_id = $1::uuid AND target_type = 'artifact' AND target_id = $2::uuid
                AND target_version = $3::integer AND target_hash = $4::varchar AND status IN ('pending', 'approved')
            )`, [claimed.workspace_id, artifact.artifact_id, artifact.version, hash]);
        }
        await db.query("UPDATE workflow_tasks SET status=CASE WHEN status='completed' THEN status ELSE $3 END,result_ref=$2,error_details=NULL,completed_at=CASE WHEN $3='completed' THEN now() ELSE completed_at END,updated_at=now() WHERE id=$1", [task.id, artifact.artifact_id, requiresApproval ? 'awaiting_approval' : 'completed']);
        // A retry may have recorded a transient database/provider error before
        // the same outbox item succeeds. Clear that stale error so the UI and
        // monitoring reflect the final delivery state.
        await db.query("UPDATE plan_task_outbox SET status='sent',lease_until=NULL,error_code=NULL WHERE id=$1", [claimed.id]);
        await db.query('COMMIT');
      } catch (error) { await db.query('ROLLBACK'); throw error; }
      finally { db.release(); }
      if (task.operation === 'strategy.generate') {
        await tryAutoApplyCommunityPlan(this.pool, claimed.workspace_id, artifact.artifact_id, result.output);
      }
      return { task_id: task.id, artifact, output: result.output, evidence: result.evidence ?? [], model: result.model, run_id: result.run_id, status: 'awaiting_approval' };
    } catch (error) {
      console.error('[plan-outbox]', error);
      // Model output varies between runs, so a malformed reply gets one fresh run. New input_version,
      // because the AI service keeps a failed run and its call budget per version.
      const schemaRetry = (error as { code?: string }).code === 'INVALID_STRUCTURED_OUTPUT' && claimed.attempts === 1;
      const permanent = !schemaRetry && ((error as { permanent?: boolean }).permanent === true ||
        ['TASK_NOT_RUNNABLE', 'TASK_DEADLINE_EXCEEDED', 'SELECTED_FINDING_MISSING', 'MISSING_RESEARCH_ARTIFACT', 'MISSING_CTA', 'STALE_CONTEXT', 'SOURCE_NOT_APPROVED', 'DEPENDENCY_NOT_APPROVED', 'UNKNOWN_PLAN_OPERATION', 'INVALID_AI_ARTIFACT', 'ARTIFACT_HASH_MISMATCH'].includes((error as Error).message));
      const owned = await this.pool.query("UPDATE plan_task_outbox SET status=$2::varchar,lease_until=NULL,error_code=$3::text WHERE id=$1::uuid AND status='claimed' AND attempts=$4::integer RETURNING task_id", [claimed.id, permanent || claimed.attempts >= 3 ? 'failed' : 'pending', (error as Error).message, claimed.attempts]);
      if (owned.rowCount && !permanent && claimed.attempts < 3) await this.pool.query("UPDATE workflow_tasks SET status='queued',error_details=$2,updated_at=now() WHERE id=$1 AND status='running'", [claimed.task_id, JSON.stringify({ code: (error as Error).message })]);
      if (owned.rowCount && schemaRetry) {
        const bumped = (await this.pool.query('UPDATE workflow_tasks SET input_version=input_version+1,updated_at=now() WHERE id=$1 RETURNING input_version', [claimed.task_id])).rows[0];
        await this.pool.query('UPDATE plan_task_outbox SET input_version=$2 WHERE id=$1', [claimed.id, bumped.input_version]);
      }
      // A question the agents cannot answer goes to a person; it must not stay queued with nobody working on it.
      if (owned.rowCount && (permanent || claimed.attempts >= 3) && claimed.operation === 'community.response')
        await this.pool.query("UPDATE community_messages SET status='escalated',updated_at=now() WHERE workspace_id=$1 AND task_id=$2 AND status='queued'", [claimed.workspace_id, claimed.task_id]);
      if (owned.rowCount && (permanent || claimed.attempts >= 3)) await this.pool.query("UPDATE workflow_tasks SET status='failed',error_details=$2,updated_at=now() WHERE id=$1 AND status NOT IN('completed','cancelled')", [claimed.task_id, JSON.stringify({ code: (error as Error).message })]);
      throw error;
    }
  }
}
