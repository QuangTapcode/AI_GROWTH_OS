import type { Pool } from 'pg';
import { AppError } from '../../lib/errors';
import { canonicalJson } from '../../lib/hash';
import { researchStrategySchema } from './strategy';

/** Authorized local import. No competitor claim is promoted to a knowledge source or measured KPI. */
export async function applyTripcResearchStrategy(pool: Pool, workspaceId: string, raw: unknown) {
  const strategy = researchStrategySchema.parse(raw);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [workspaceId]);
    const profile = (await db.query('SELECT id,company_name,version,competitors,research_strategy FROM business_profiles WHERE workspace_id=$1 FOR UPDATE', [workspaceId])).rows[0];
    if (!profile || profile.company_name.trim().toLowerCase() !== 'tripc') throw new AppError(422, 'TRIPC_PROFILE_REQUIRED', 'This preset applies only to the TripC business profile');
    const competitors = [...new Set([...(profile.competitors ?? []), ...strategy.competitor_references.map(c => c.url)])];
    if (competitors.length > 20) throw new AppError(422, 'COMPETITOR_LIMIT', 'Review existing competitor references before importing more');
    if (canonicalJson(profile.research_strategy) === canonicalJson(strategy) && canonicalJson(profile.competitors) === canonicalJson(competitors)) {
      await db.query('COMMIT'); return { changed: false, profile_version: profile.version };
    }
    const updated = (await db.query(`UPDATE business_profiles SET research_strategy=$2,competitors=$3,version=version+1,updated_by=NULL,updated_at=now()
      WHERE workspace_id=$1 RETURNING version`, [workspaceId, JSON.stringify(strategy), competitors])).rows[0];
    // Old approvals/artifacts remain immutable. A new context must be issued for the new profile version.
    await db.query('UPDATE knowledge_contexts SET current=false WHERE workspace_id=$1 AND current', [workspaceId]);
    await db.query(`INSERT INTO audit_events(workspace_id,actor_id,action,entity_type,entity_id,entity_version,details)
      VALUES($1,NULL,'business_profile.strategy_imported','business_profile',$2,$3,$4)`,
      [workspaceId, profile.id, updated.version, JSON.stringify({ authorization: 'user_requested_document_import', source: strategy.source_document,
        fields: ['research_strategy', 'competitors'], topics: strategy.topics.map(t => t.id), market_data_verified: false })]);
    await db.query('COMMIT'); return { changed: true, profile_version: updated.version };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
