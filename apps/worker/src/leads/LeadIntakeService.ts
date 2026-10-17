/**
 * Lead intake service — validation, dedup, and PostgreSQL persistence (MY-06).
 *
 * - Mặc định in-memory (giữ test cũ xanh, không cần DB).
 * - Khi có DATABASE_URL (hoặc truyền store PG), persist vào bảng `leads`
 *   của migration 003: dedup theo (workspace_id, idempotency_key) unique,
 *   contact dedup theo email trong workspace, transaction commit mới success.
 * - Worker KHÔNG import code từ apps/api (giữ runtime TS riêng theo TEAM);
 *   PG store ở đây dùng pg Pool raw SQL theo pattern DbWorkflowStore.
 */

import { randomUUID } from 'node:crypto';
import { autoPgStore } from './PgLeadStore.js';
import type { LeadStore } from './PgLeadStore.js';

export interface LeadInput {
  workspaceId: string;
  contactName?: string;
  contactEmail: string;
  phoneNumber?: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  consent?: boolean;
}

export interface LeadRecord {
  leadId: string;
  workspaceId: string;
  idempotencyKey: string;
  contactName?: string;
  contactEmail: string;
  phoneNumber?: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  leadStatus: 'New' | 'Assigned' | 'Contacted' | 'Converted';
  leadOwner?: string;
  capturedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeadIntakeResult {
  success: boolean;
  lead?: LeadRecord;
  errorCode?: string;
  errorMessage?: string;
  duplicate?: boolean;
}

/**
 * Generate deterministic idempotency key from contact info within workspace.
 * Same contact + same workspace → same key → prevents duplicate leads.
 */
export function generateLeadIdempotencyKey(input: LeadInput): string {
  const payload = `${input.workspaceId}|${input.contactEmail.toLowerCase().trim()}|${input.utmSource}|${input.utmMedium}|${input.utmCampaign}`;
  // Simple hash (for production use crypto.createHash('sha256'))
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `lead:${input.workspaceId}:${Math.abs(hash).toString(16)}`;
}

export class LeadIntakeService {
  private leads = new Map<string, LeadRecord>(); // key = idempotencyKey (fallback khi chưa có PG)
  private pgStore: LeadStore | null;

  constructor(store?: LeadStore | null) {
    // null/undefined → in-memory; truyền PgLeadStore (hoặc auto từ DATABASE_URL) → PG
    this.pgStore = store ?? autoPgStore();
  }

  /**
   * Intake a new lead. Validates input, checks dedup, returns record or conflict.
   * Backend confirms success before returning (transaction not committed until DB write).
   */
  async intake(input: LeadInput): Promise<LeadIntakeResult> {
    // Validation
    if (!input.contactEmail || !this.isValidEmail(input.contactEmail)) {
      return {
        success: false,
        errorCode: 'INVALID_EMAIL',
        errorMessage: 'Contact email is required and must be valid.',
      };
    }

    if (!input.utmSource || !input.utmMedium || !input.utmCampaign) {
      return {
        success: false,
        errorCode: 'MISSING_UTM',
        errorMessage: 'utm_source, utm_medium, utm_campaign are required.',
      };
    }

    if (input.consent === false) {
      return {
        success: false,
        errorCode: 'CONSENT_REQUIRED',
        errorMessage: 'User consent is required for lead capture.',
      };
    }

    const idempotencyKey = generateLeadIdempotencyKey(input);

    // PG path: dedup trong transaction, commit mới success (TQ-05 semantics)
    if (this.pgStore) {
      try {
        const existing = await this.pgStore.findByKey(input.workspaceId, idempotencyKey);
        if (existing) {
          return { success: true, lead: existing, duplicate: true };
        }
        const now = new Date();
        const lead: LeadRecord = {
          leadId: randomUUID(),
          workspaceId: input.workspaceId,
          idempotencyKey,
          contactName: input.contactName,
          contactEmail: input.contactEmail,
          phoneNumber: input.phoneNumber,
          utmSource: input.utmSource,
          utmMedium: input.utmMedium,
          utmCampaign: input.utmCampaign,
          leadStatus: 'New',
          capturedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        const saved = await this.pgStore.insertLead(lead);
        return { success: true, lead: saved, duplicate: false };
      } catch (err) {
        // PG fail (VD thiếu bảng/workspace) → rớt về in-memory để không mất lead local?
        // KHÔNG: báo lỗi rõ để caller biết chưa persist (đúng TQ-05: chưa commit = chưa success).
        return {
          success: false,
          errorCode: 'LEAD_PERSIST_FAILED',
          errorMessage: err instanceof Error ? err.message.slice(0, 300) : 'lead persist failed',
        };
      }
    }

    // In-memory fallback (không DB): dedup theo key
    const existing = this.leads.get(idempotencyKey);
    if (existing) {
      return {
        success: true,
        lead: existing,
        duplicate: true,
      };
    }

    // Create new lead (in-memory)
    const now = new Date();
    const lead: LeadRecord = {
      leadId: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      workspaceId: input.workspaceId,
      idempotencyKey,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      phoneNumber: input.phoneNumber,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
      leadStatus: 'New',
      capturedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    this.leads.set(idempotencyKey, lead);

    return {
      success: true,
      lead,
      duplicate: false,
    };
  }

  /**
   * Look up lead by idempotency key (memory path; PG path dùng store trực tiếp).
   */
  findByIdempotencyKey(workspaceId: string, idempotencyKey: string): LeadRecord | undefined {
    const lead = this.leads.get(idempotencyKey);
    if (lead && lead.workspaceId === workspaceId) {
      return lead;
    }
    return undefined;
  }

  /**
   * List all leads for a workspace (memory path).
   */
  listForWorkspace(workspaceId: string): LeadRecord[] {
    return Array.from(this.leads.values()).filter((l) => l.workspaceId === workspaceId);
  }

  /** PG-aware list (integrated path). */
  async listLeads(workspaceId: string): Promise<LeadRecord[]> {
    if (this.pgStore) return this.pgStore.listByWorkspace(workspaceId);
    return this.listForWorkspace(workspaceId);
  }

  /**
   * Update lead status (owner handoff). PG path update DB, memory update map.
   */
  async updateStatus(
    workspaceId: string,
    leadId: string,
    status: 'New' | 'Assigned' | 'Contacted' | 'Converted',
    ownerId?: string
  ): Promise<LeadRecord | null> {
    if (this.pgStore) {
      try {
        return await this.pgStore.updateStatus(workspaceId, leadId, status, ownerId);
      } catch {
        return null;
      }
    }
    const lead = Array.from(this.leads.values()).find((l) => l.leadId === leadId && l.workspaceId === workspaceId);
    if (!lead) {
      return null;
    }
    lead.leadStatus = status;
    if (ownerId) {
      lead.leadOwner = ownerId;
    }
    lead.updatedAt = new Date();
    return lead;
  }

  private isValidEmail(email: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }
}

export const leadIntakeService = new LeadIntakeService();