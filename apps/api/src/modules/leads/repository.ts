import { randomUUID } from 'node:crypto';
import type { LeadContext } from './schemas';

/**
 * Persistence cho lead submission (W1-MY-04).
 * - Transaction stub có semantics rollback thật: mọi ghi trong closure chỉ
 *   commit khi closure resolve; throw → không row nào được lưu.
 * - Idempotency record nằm TRONG transaction: rollback thì key cũng mất,
 *   retry sau server-fail vẫn tạo được record mới.
 * DB-backed impl (kysely/postgres) thay thế lúc core migrations sẵn sàng.
 */
export interface LeadRecord {
  id: string;
  site_id: string;
  workspace_id: string;
  organization_id: string;
  email: string;
  name: string;
  interest_topic: string;
  consent_accepted: boolean;
  consent_policy_version: string;
  context: LeadContext;
  idempotency_key: string;
  payload_hash: string;
  created_at: Date;
}

export interface LeadTransaction {
  findByKey(siteId: string, idempotencyKey: string): Promise<LeadRecord | null>;
  insertLead(record: LeadRecord): Promise<void>;
}

export interface LeadRepository {
  withTransaction<T>(fn: (tx: LeadTransaction) => Promise<T>): Promise<T>;
  count(): Promise<number>;
  findById(id: string): Promise<LeadRecord | null>;
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

  async count(): Promise<number> {
    return this.rows.size;
  }

  async findById(id: string): Promise<LeadRecord | null> {
    return this.rows.get(id) ?? null;
  }
}

export function newSubmissionId(): string {
  return randomUUID();
}