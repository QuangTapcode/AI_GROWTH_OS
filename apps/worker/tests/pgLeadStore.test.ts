import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { PgLeadStore } from '../src/leads/PgLeadStore';
import { LeadIntakeService, generateLeadIdempotencyKey } from '../src/leads/LeadIntakeService';

/**
 * Test tích hợp MY-06 trên Postgres thật (thay script tay tasks/pgLeadSmoke.ts):
 * - Chạy khi kết nối được DATABASE_URL (mặc định infra local :15432).
 * - Không có DB → skip, không fail CI local.
 * - Seed workspace UUID thật (FK workspaces) và cleanup theo cascade.
 */
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://ai_growth_dev:ai_growth_dev@localhost:15432/ai_growth_os';

async function tryConnect(): Promise<Pool | null> {
  const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 4000 });
  try {
    await pool.query('SELECT 1');
    return pool;
  } catch {
    await pool.end().catch(() => undefined);
    return null;
  }
}

const baseInput = (workspaceId: string) => ({
  workspaceId,
  contactEmail: 'lead-pg-test@example.com',
  contactName: 'PG Test Lead',
  utmSource: 'newsletter',
  utmMedium: 'email',
  utmCampaign: 'sprint3',
  consent: true,
});

describe('PgLeadStore — Postgres (MY-06)', () => {
  it('intake/dedup/list/updateStatus roundtrip trên DB thật', async () => {
    const pool = await tryConnect();
    if (!pool) {
      console.warn('SKIP pgLeadStore.test: no Postgres at ' + DATABASE_URL);
      return;
    }
    const store = new PgLeadStore(pool);
    const client = await pool.connect();
    let workspaceId: string;
    try {
      const ws = await client.query(
        `INSERT INTO workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
        [`pg-lead-test-${Date.now()}`, `pg-lead-test-${Date.now()}`],
      );
      workspaceId = ws.rows[0].id as string;

      const svc = new LeadIntakeService(store);
      const input = baseInput(workspaceId);

      // Insert lần đầu → success, không duplicate.
      const first = await svc.intake(input);
      expect(first.success).toBe(true);
      expect(first.duplicate).toBe(false);
      expect(first.lead!.leadId).toBeTruthy();
      expect(first.lead!.leadStatus).toBe('New');

      // Intake cùng payload → dedup, cùng leadId (idempotency key deterministic).
      const second = await svc.intake(input);
      expect(second.success).toBe(true);
      expect(second.duplicate).toBe(true);
      expect(second.lead!.leadId).toBe(first.lead!.leadId);
      const key = generateLeadIdempotencyKey(input);
      expect(second.lead!.idempotencyKey).toBe(key);

      // List PG-aware.
      const list = await svc.listLeads(workspaceId);
      expect(list.length).toBe(1);
      expect(list[0].leadId).toBe(first.lead!.leadId);

      // Handoff status (owner handoff MY-06).
      const updated = await store.updateStatus(workspaceId, first.lead!.leadId, 'Assigned');
      expect(updated).toMatchObject({ leadStatus: 'Assigned' });

      // Payload khác UTM → key khác → lead mới (không dedup oan).
      const other = await svc.intake({ ...input, utmCampaign: 'other-campaign' });
      expect(other.success).toBe(true);
      expect(other.duplicate).toBe(false);
      expect(other.lead!.leadId).not.toBe(first.lead!.leadId);
    } finally {
      client.release();
      await pool.end();
    }
  });

  it('2 request song song cùng key → cùng leadId (unique constraint + 23505 fallback)', async () => {
    const pool = await tryConnect();
    if (!pool) {
      console.warn('SKIP pgLeadStore.test race: no Postgres at ' + DATABASE_URL);
      return;
    }
    const store = new PgLeadStore(pool);
    try {
      const ws = await pool.query(
        `INSERT INTO workspaces (name, slug) VALUES ($1, $2) RETURNING id`,
        [`pg-lead-race-${Date.now()}`, `pg-lead-race-${Date.now()}`],
      );
      const workspaceId = ws.rows[0].id as string;
      const input = baseInput(workspaceId);
      const key = generateLeadIdempotencyKey(input);

      // Hai service riêng (hai pool) cùng insert một lúc — read-before-write race.
      const svcA = new LeadIntakeService(new PgLeadStore(pool));
      const svcB = new LeadIntakeService(new PgLeadStore(pool));
      const [ra, rb] = await Promise.all([svcA.intake(input), svcB.intake(input)]);

      expect(ra.success).toBe(true);
      expect(rb.success).toBe(true);
      // Đúng một lead; bên thua race nhận row đã commit qua 23505 fallback.
      expect(ra.lead!.leadId).toBe(rb.lead!.leadId);
      expect(ra.duplicate !== rb.duplicate).toBe(true);

      const rows = await pool.query(
        'SELECT lead_id FROM leads WHERE workspace_id = $1 AND idempotency_key = $2',
        [workspaceId, key],
      );
      expect(rows.rows.length).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it('workspace không tồn tại → LEAD_PERSIST_FAILED, không có half-written row', async () => {
    const pool = await tryConnect();
    if (!pool) {
      console.warn('SKIP pgLeadStore.test persist-fail: no Postgres at ' + DATABASE_URL);
      return;
    }
    try {
      const svc = new LeadIntakeService(new PgLeadStore(pool));
      const ghost = '00000000-0000-4000-8000-000000000000';
      const res = await svc.intake(baseInput(ghost));
      expect(res.success).toBe(false);
      expect(res.errorCode).toBe('LEAD_PERSIST_FAILED');

      // Không rác row (FK violation → ROLLBACK).
      const rows = await pool.query('SELECT lead_id FROM leads WHERE workspace_id = $1', [ghost]);
      expect(rows.rows.length).toBe(0);
    } finally {
      await pool.end();
    }
  });
});
