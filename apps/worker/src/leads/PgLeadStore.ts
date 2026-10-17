import { Pool } from 'pg';
import type { LeadRecord } from './LeadIntakeService';

/** Seam persist cho LeadIntakeService: in-memory mặc định, PG khi có DB. */
export interface LeadStore {
  findByKey(ws: string, key: string): Promise<LeadRecord | null>;
  insertLead(lead: LeadRecord): Promise<LeadRecord>;
  listByWorkspace(ws: string): Promise<LeadRecord[]>;
  updateStatus(ws: string, id: string, st: LeadRecord['leadStatus'], owner?: string): Promise<LeadRecord | null>;
}

function mapRow(r: Record<string, unknown>): LeadRecord {
  const s = (k: string): string | undefined =>
    typeof r[k] === 'string' ? (r[k] as string) : undefined;
  const now = new Date();
  const dt = (k: string): Date => {
    const v = r[k];
    if (typeof v === 'string' || v instanceof Date) return new Date(v as string);
    return now;
  };
  return {
    leadId: String(r['lead_id']),
    workspaceId: String(r['workspace_id']),
    idempotencyKey: String(r['idempotency_key']),
    contactName: s('contact_name'),
    contactEmail: String(r['contact_email']),
    phoneNumber: s('phone_number'),
    utmSource: s('utm_source') ?? '',
    utmMedium: s('utm_medium') ?? '',
    utmCampaign: s('utm_campaign') ?? '',
    leadStatus: (r['lead_status'] as LeadRecord['leadStatus']) ?? 'New',
    leadOwner: s('lead_owner'),
    capturedAt: dt('captured_at'),
    createdAt: dt('captured_at'),
    updatedAt: dt('updated_at'),
  };
}

/** Worker PG store — bảng `leads` migration 003, raw SQL theo pattern DbWorkflowStore. */
export class PgLeadStore implements LeadStore {
  constructor(private pool: Pool, private siteId?: string) {}

  async findByKey(ws: string, key: string): Promise<LeadRecord | null> {
    const res = await this.pool.query(
      'SELECT * FROM leads WHERE workspace_id = $1 AND idempotency_key = $2 LIMIT 1',
      [ws, key],
    );
    return res.rows.length === 0 ? null : mapRow(res.rows[0]);
  }

  async insertLead(lead: LeadRecord): Promise<LeadRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const ex = await client.query(
        'SELECT * FROM leads WHERE workspace_id = $1 AND idempotency_key = $2 LIMIT 1',
        [lead.workspaceId, lead.idempotencyKey],
      );
      if (ex.rows.length > 0) {
        await client.query('ROLLBACK');
        return mapRow(ex.rows[0]);
      }
      const site = this.siteId ?? `worker:${lead.workspaceId.slice(0, 8)}`;
      const now = new Date();
      await client.query(
        `INSERT INTO leads (lead_id, workspace_id, site_id, idempotency_key, payload_hash,
          contact_email, contact_name, phone_number, interest_topic,
          consent_accepted, consent_policy_version,
          utm_source, utm_medium, utm_campaign,
          context, lead_status, lead_owner, notes, captured_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          lead.leadId, lead.workspaceId, site, lead.idempotencyKey,
          `worker:${lead.idempotencyKey}`,
          lead.contactEmail, lead.contactName ?? lead.contactEmail,
          lead.phoneNumber ?? null, 'general', true, 'v1',
          lead.utmSource ?? null, lead.utmMedium ?? null, lead.utmCampaign ?? null,
          JSON.stringify({ source: 'worker-intake' }),
          lead.leadStatus ?? 'New', lead.leadOwner ?? null, null,
          lead.capturedAt ?? now, now,
        ],
      );
      await client.query('COMMIT');
      const saved = await this.pool.query('SELECT * FROM leads WHERE lead_id = $1 LIMIT 1', [lead.leadId]);
      return mapRow(saved.rows[0]);
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* noop */ }
      throw e;
    } finally {
      client.release();
    }
  }

  async listByWorkspace(ws: string): Promise<LeadRecord[]> {
    const res = await this.pool.query(
      'SELECT * FROM leads WHERE workspace_id = $1 ORDER BY captured_at DESC LIMIT 100',
      [ws],
    );
    return res.rows.map(mapRow);
  }

  async updateStatus(
    ws: string, id: string, st: LeadRecord['leadStatus'], owner?: string,
  ): Promise<LeadRecord | null> {
    const res = await this.pool.query(
      `UPDATE leads SET lead_status = $3, lead_owner = COALESCE($4, lead_owner), updated_at = NOW()
       WHERE lead_id = $1 AND workspace_id = $2 RETURNING *`,
      [id, ws, st, owner ?? null],
    );
    return res.rows.length === 0 ? null : mapRow(res.rows[0]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/** Auto PG khi có DATABASE_URL, ngược lại null (in-memory). */
export function autoPgStore(): LeadStore | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    return new PgLeadStore(new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 5000 }));
  } catch {
    return null;
  }
}
