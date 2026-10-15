import { query } from "@/lib/db";
import { CreateCampaignInput } from "./schemas";

export interface CampaignRow {
  id: string;
  workspace_id: string;
  name: string;
  utm_campaign: string;
  start_date?: string | null;
  end_date?: string | null;
}

export async function createCampaign(
  workspaceId: string,
  input: CreateCampaignInput
): Promise<CampaignRow> {
  const sql = `
    INSERT INTO campaigns (workspace_id, name, utm_campaign, start_date, end_date)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const res = await query<CampaignRow>(sql, [
    workspaceId,
    input.name,
    input.utm_campaign,
    input.start_date || null,
    input.end_date || null,
  ]);
  return res.rows[0];
}

export async function listCampaigns(workspaceId: string): Promise<CampaignRow[]> {
  const sql = `SELECT * FROM campaigns WHERE workspace_id = $1 ORDER BY name ASC`;
  const res = await query<CampaignRow>(sql, [workspaceId]);
  return res.rows;
}

export async function getCampaignById(
  workspaceId: string,
  campaignId: string
): Promise<CampaignRow | null> {
  const sql = `SELECT * FROM campaigns WHERE workspace_id = $1 AND id = $2`;
  const res = await query<CampaignRow>(sql, [workspaceId, campaignId]);
  return res.rows[0] || null;
}
