import { withTransaction, query } from "../../lib/db";
import { EDITABLE_PROFILE_FIELDS, UpdateBusinessProfileInput } from "./schemas";
import type { ResearchStrategy } from './strategy';

export interface BusinessProfileRow {
  id: string;
  workspace_id: string;
  company_name: string;
  website_url: string | null;
  industry: string | null;
  overview: string | null;
  safety_rules: Record<string, boolean> | null;
  target_locations: string[] | null;
  target_audiences: string[] | null;
  products_services: string[] | null;
  brand_voice: string | null;
  brand_guidelines: string | null;
  competitors: string[] | null;
  research_strategy: ResearchStrategy | null;
  version: number;
  updated_by: string | null;
  updated_at: string;
}

const COLUMNS = `id, workspace_id, company_name, website_url, industry, overview, safety_rules, target_locations,
  target_audiences, products_services, brand_voice, brand_guidelines, competitors, research_strategy, version, updated_by, updated_at`;

export async function getProfile(workspaceId: string): Promise<BusinessProfileRow | null> {
  const res = await query<BusinessProfileRow>(`SELECT ${COLUMNS} FROM business_profiles WHERE workspace_id = $1`, [
    workspaceId,
  ]);
  return res.rows[0] || null;
}

export type UpdateResult =
  | { kind: "updated"; profile: BusinessProfileRow }
  | { kind: "not_found" }
  | { kind: "conflict"; currentVersion: number };

/**
 * Cập nhật nguyên tử: chỉ ghi khi version hiện tại = expected_version, tăng version,
 * ghi audit_events trong cùng transaction.
 */
export async function updateProfile(
  workspaceId: string,
  input: UpdateBusinessProfileInput,
  actorId: string
): Promise<UpdateResult> {
  return withTransaction(async (client) => {
    const current = await client.query<{ id: string; version: number }>(
      `SELECT id, version FROM business_profiles WHERE workspace_id = $1 FOR UPDATE`,
      [workspaceId]
    );
    if (current.rowCount === 0) return { kind: "not_found" };
    if (current.rows[0].version !== input.expected_version) {
      return { kind: "conflict", currentVersion: current.rows[0].version };
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    const changed: string[] = [];
    for (const field of EDITABLE_PROFILE_FIELDS) {
      if (input[field] === undefined) continue;
      params.push(field === "safety_rules" || field === 'research_strategy' ? JSON.stringify(input[field]) : input[field]);
      sets.push(`${field} = $${params.length}`);
      changed.push(field);
    }
    params.push(actorId, workspaceId);
    const res = await client.query<BusinessProfileRow>(
      `UPDATE business_profiles
       SET ${[...sets, "version = version + 1", `updated_by = $${params.length - 1}`, "updated_at = NOW()"].join(", ")}
       WHERE workspace_id = $${params.length}
       RETURNING ${COLUMNS}`,
      params
    );
    const profile = res.rows[0];

    await client.query(
      `INSERT INTO audit_events (workspace_id, actor_id, action, entity_type, entity_id, entity_version, details)
       VALUES ($1, $2, 'business_profile.updated', 'business_profile', $3, $4, $5)`,
      [workspaceId, actorId, profile.id, profile.version, JSON.stringify({ fields: changed })]
    );
    return { kind: "updated", profile };
  });
}
