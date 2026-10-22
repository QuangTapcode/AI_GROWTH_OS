import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import pool, { query as dbQuery, withTransaction as dbWithTransaction } from '../../lib/db';
import type { LeadContext, LeadStatus, ListLeadsQuery, UpdateLeadBody } from './schemas';

/**
 * Persistence cho lead submission và quản lý leads trong workspace (TQ-05).
 * - Semantics rollback: mọi ghi trong closure chỉ commit khi closure resolve;
 *   throw → không row nào được lưu.
 * - Idempotency record nằm TRONG transaction.
 * - Hỗ trợ cả PostgresLeadRepository (thật) và InMemoryLeadRepository (test).
 */
export interface LeadRecord {
  id: string;
  site_id: string;
  workspace_id: string;
  organization_id?: string;
  email: string;
  name: string;
  phone_number?: string | null;
  interest_topic: string;
  consent_accepted: boolean;
  consent_policy_version: string;
  context: LeadContext;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  idempotency_key: string;
  payload_hash: string;
  lead_status: LeadStatus;
  lead_owner: string | null;
  notes: string | null;
  captured_at: Date;
  updated_at: Date;
  /** Backward compatibility với các test W1 cũ */
  created_at: Date;
}

export interface LeadTransaction {
  findByKey(siteId: string, idempotencyKey: string): Promise<LeadRecord | null>;
  findByContact(workspaceId: string, email: string): Promise<LeadRecord | null>;
  insertLead(record: LeadRecord): Promise<void>;
}

export interface LeadRepository {
  withTransaction<T>(fn: (tx: LeadTransaction) => Promise<T>): Promise<T>;
  count(workspaceId?: string): Promise<number>;
  findById(id: string, workspaceId?: string): Promise<LeadRecord | null>;
  findByContact(workspaceId: string, email: string): Promise<LeadRecord | null>;
  listByWorkspace(workspaceId: string, filter?: ListLeadsQuery): Promise<{ items: LeadRecord[]; total: number }>;
  updateLead(workspaceId: string, leadId: string, patch: UpdateLeadBody): Promise<LeadRecord | null>;
}

function mapDbRowToLeadRecord(row: any): LeadRecord {
  const context = typeof row.context === 'string' ? JSON.parse(row.context) : (row.context ?? {});
  const capturedAt = new Date(row.captured_at);
  const updatedAt = new Date(row.updated_at ?? row.captured_at);
  return {
    id: row.lead_id,
    site_id: row.site_id,
    workspace_id: row.workspace_id,
    organization_id: row.organization_id ?? row.workspace_id,
    email: row.contact_email,
    name: row.contact_name,
    phone_number: row.phone_number ?? null,
    interest_topic: row.interest_topic,
    consent_accepted: row.consent_accepted,
    consent_policy_version: row.consent_policy_version,
    utm_source: row.utm_source ?? null,
    utm_medium: row.utm_medium ?? null,
    utm_campaign: row.utm_campaign ?? null,
    utm_content: row.utm_content ?? null,
    context,
    idempotency_key: row.idempotency_key,
    payload_hash: row.payload_hash,
    lead_status: (row.lead_status as LeadStatus) || 'New',
    lead_owner: row.lead_owner ?? null,
    notes: row.notes ?? null,
    captured_at: capturedAt,
    updated_at: updatedAt,
    created_at: capturedAt,
  };
}

export class PostgresLeadRepository implements LeadRepository {
  async withTransaction<T>(fn: (tx: LeadTransaction) => Promise<T>): Promise<T> {
    return dbWithTransaction(async (client: PoolClient) => {
      const tx: LeadTransaction = {
        async findByKey(siteId: string, idempotencyKey: string): Promise<LeadRecord | null> {
          const res = await client.query(
            `SELECT * FROM leads WHERE site_id = $1 AND idempotency_key = $2 LIMIT 1`,
            [siteId, idempotencyKey]
          );
          if (res.rows.length === 0) return null;
          return mapDbRowToLeadRecord(res.rows[0]);
        },
        async findByContact(workspaceId: string, email: string): Promise<LeadRecord | null> {
          const res = await client.query(
            `SELECT * FROM leads WHERE workspace_id = $1 AND contact_email = $2 ORDER BY captured_at DESC LIMIT 1`,
            [workspaceId, email]
          );
          if (res.rows.length === 0) return null;
          return mapDbRowToLeadRecord(res.rows[0]);
        },
        async insertLead(record: LeadRecord): Promise<void> {
          await client.query(
            `INSERT INTO leads (
              lead_id, workspace_id, site_id, idempotency_key, payload_hash,
              contact_email, contact_name, phone_number, interest_topic,
              consent_accepted, consent_policy_version, utm_source, utm_medium,
              utm_campaign, utm_content, context, lead_status, lead_owner,
              notes, captured_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
            )`,
            [
              record.id,
              record.workspace_id,
              record.site_id,
              record.idempotency_key,
              record.payload_hash,
              record.email,
              record.name,
              record.phone_number ?? null,
              record.interest_topic,
              record.consent_accepted,
              record.consent_policy_version,
              record.utm_source ?? null,
              record.utm_medium ?? null,
              record.utm_campaign ?? null,
              record.utm_content ?? null,
              JSON.stringify(record.context ?? {}),
              record.lead_status ?? 'New',
              record.lead_owner ?? null,
              record.notes ?? null,
              record.captured_at,
              record.updated_at,
            ]
          );
        },
      };
      return await fn(tx);
    });
  }

  async count(workspaceId?: string): Promise<number> {
    const res = workspaceId
      ? await dbQuery(`SELECT COUNT(*)::int AS cnt FROM leads WHERE workspace_id = $1`, [workspaceId])
      : await dbQuery(`SELECT COUNT(*)::int AS cnt FROM leads`);
    return res.rows[0]?.cnt ?? 0;
  }

  async findById(id: string, workspaceId?: string): Promise<LeadRecord | null> {
    const res = workspaceId
      ? await dbQuery(`SELECT * FROM leads WHERE lead_id = $1 AND workspace_id = $2 LIMIT 1`, [id, workspaceId])
      : await dbQuery(`SELECT * FROM leads WHERE lead_id = $1 LIMIT 1`, [id]);
    if (res.rows.length === 0) return null;
    return mapDbRowToLeadRecord(res.rows[0]);
  }

  async findByContact(workspaceId: string, email: string): Promise<LeadRecord | null> {
    const res = await dbQuery(
      `SELECT * FROM leads WHERE workspace_id = $1 AND contact_email = $2 ORDER BY captured_at DESC LIMIT 1`,
      [workspaceId, email]
    );
    if (res.rows.length === 0) return null;
    return mapDbRowToLeadRecord(res.rows[0]);
  }

  async listByWorkspace(
    workspaceId: string,
    filter?: ListLeadsQuery
  ): Promise<{ items: LeadRecord[]; total: number }> {
    const conditions: string[] = ['workspace_id = $1'];
    const params: any[] = [workspaceId];
    let idx = 2;

    if (filter?.lead_status) {
      conditions.push(`lead_status = $${idx++}`);
      params.push(filter.lead_status);
    }

    if (filter?.lead_owner) {
      conditions.push(`lead_owner = $${idx++}`);
      params.push(filter.lead_owner);
    }

    if (filter?.search) {
      conditions.push(
        `(contact_name ILIKE $${idx} OR contact_email ILIKE $${idx} OR interest_topic ILIKE $${idx})`
      );
      params.push(`%${filter.search}%`);
      idx++;
    }

    const whereClause = conditions.join(' AND ');
    const countRes = await dbQuery(`SELECT COUNT(*)::int AS cnt FROM leads WHERE ${whereClause}`, params);
    const total = countRes.rows[0]?.cnt ?? 0;

    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;
    params.push(limit, offset);

    const rowsRes = await dbQuery(
      `SELECT * FROM leads WHERE ${whereClause} ORDER BY captured_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    return {
      items: rowsRes.rows.map(mapDbRowToLeadRecord),
      total,
    };
  }

  async updateLead(
    workspaceId: string,
    leadId: string,
    patch: UpdateLeadBody
  ): Promise<LeadRecord | null> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: any[] = [leadId, workspaceId];
    let idx = 3;

    if (patch.lead_status !== undefined) {
      setClauses.push(`lead_status = $${idx++}`);
      params.push(patch.lead_status);
    }
    if (patch.lead_owner !== undefined) {
      setClauses.push(`lead_owner = $${idx++}`);
      params.push(patch.lead_owner);
    }
    if (patch.notes !== undefined) {
      setClauses.push(`notes = $${idx++}`);
      params.push(patch.notes);
    }

    const res = await dbQuery(
      `UPDATE leads SET ${setClauses.join(', ')} WHERE lead_id = $1 AND workspace_id = $2 RETURNING *`,
      params
    );

    if (res.rows.length === 0) return null;
    return mapDbRowToLeadRecord(res.rows[0]);
  }
}

export class InMemoryLeadRepository implements LeadRepository {
  private rows = new Map<string, LeadRecord>();
  private failNextAfterInsert = false;

  /** Kích hoạt failure giữa transaction (sau khi đã stage insert) để test rollback. */
  failNextTransactionAfterInsert(): void {
    this.failNextAfterInsert = true;
  }

  async withTransaction<T>(fn: (tx: LeadTransaction) => Promise<T>): Promise<T> {
    const staged = new Map(this.rows); // bản copy = working set của transaction
    const self = this;
    const tx: LeadTransaction = {
      async findByKey(siteId, idempotencyKey) {
        for (const rec of staged.values()) {
          if (rec.site_id === siteId && rec.idempotency_key === idempotencyKey) return rec;
        }
        return null;
      },
      async findByContact(workspaceId, email) {
        for (const rec of staged.values()) {
          if (rec.workspace_id === workspaceId && rec.email.toLowerCase() === email.toLowerCase()) {
            return rec;
          }
        }
        return null;
      },
      async insertLead(record) {
        if ([...staged.values()].some((r) => r.id === record.id)) throw new Error('LEAD_DUPLICATE_ID');
        staged.set(record.id, record);
        if (self.failNextAfterInsert) {
          self.failNextAfterInsert = false;
          // giả lập DB chết giữa transaction → closure throw → rollback
          throw new Error('DB_WRITE_FAILED');
        }
      },
    };

    try {
      const result = await fn(tx);
      this.rows = staged; // commit duy nhất tại đây
      return result;
    } catch (err) {
      // rollback: `staged` bị bỏ, `this.rows` giữ nguyên → không row nào thoát
      throw err;
    }
  }

  async count(workspaceId?: string): Promise<number> {
    if (!workspaceId) return this.rows.size;
    let c = 0;
    for (const r of this.rows.values()) {
      if (r.workspace_id === workspaceId) c++;
    }
    return c;
  }

  async findById(id: string, workspaceId?: string): Promise<LeadRecord | null> {
    const rec = this.rows.get(id);
    if (!rec) return null;
    if (workspaceId && rec.workspace_id !== workspaceId) return null;
    return rec;
  }

  async findByContact(workspaceId: string, email: string): Promise<LeadRecord | null> {
    for (const rec of this.rows.values()) {
      if (rec.workspace_id === workspaceId && rec.email.toLowerCase() === email.toLowerCase()) {
        return rec;
      }
    }
    return null;
  }

  async listByWorkspace(
    workspaceId: string,
    filter?: ListLeadsQuery
  ): Promise<{ items: LeadRecord[]; total: number }> {
    let items = Array.from(this.rows.values()).filter((r) => r.workspace_id === workspaceId);

    if (filter?.lead_status) {
      items = items.filter((r) => r.lead_status === filter.lead_status);
    }
    if (filter?.lead_owner) {
      items = items.filter((r) => r.lead_owner === filter.lead_owner);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      items = items.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.interest_topic.toLowerCase().includes(q)
      );
    }

    const total = items.length;
    items.sort((a, b) => b.captured_at.getTime() - a.captured_at.getTime());

    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;
    const paginated = items.slice(offset, offset + limit);

    return { items: paginated, total };
  }

  async updateLead(
    workspaceId: string,
    leadId: string,
    patch: UpdateLeadBody
  ): Promise<LeadRecord | null> {
    const rec = this.rows.get(leadId);
    if (!rec || rec.workspace_id !== workspaceId) return null;

    const updated: LeadRecord = {
      ...rec,
      lead_status: patch.lead_status ?? rec.lead_status,
      lead_owner: patch.lead_owner !== undefined ? patch.lead_owner : rec.lead_owner,
      notes: patch.notes !== undefined ? patch.notes : rec.notes,
      updated_at: new Date(),
    };

    this.rows.set(leadId, updated);
    return updated;
  }
}

export function newSubmissionId(): string {
  return randomUUID();
}