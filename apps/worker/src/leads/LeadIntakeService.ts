/**
 * Lead intake service — validation, dedup, and DB-ready payload (preparation for MY-06).
 *
 * Independent of other pending tasks. When TQ-05 migration/repository is ready,
 * replace in-memory store with PostgreSQL repository. Until then, this module
 * validates input, generates idempotency keys, and detects duplicate leads.
 */

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
  private leads = new Map<string, LeadRecord>(); // key = idempotencyKey

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

    // Dedup check: same key already exists → return existing record (not error)
    const existing = this.leads.get(idempotencyKey);
    if (existing) {
      return {
        success: true,
        lead: existing,
        duplicate: true,
      };
    }

    // Create new lead (in production: INSERT into PostgreSQL within transaction)
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
   * Look up lead by idempotency key.
   */
  findByIdempotencyKey(workspaceId: string, idempotencyKey: string): LeadRecord | undefined {
    const lead = this.leads.get(idempotencyKey);
    if (lead && lead.workspaceId === workspaceId) {
      return lead;
    }
    return undefined;
  }

  /**
   * List all leads for a workspace.
   */
  listForWorkspace(workspaceId: string): LeadRecord[] {
    return Array.from(this.leads.values()).filter((l) => l.workspaceId === workspaceId);
  }

  /**
   * Update lead status (owner handoff).
   */
  async updateStatus(
    workspaceId: string,
    leadId: string,
    status: 'New' | 'Assigned' | 'Contacted' | 'Converted',
    ownerId?: string
  ): Promise<LeadRecord | null> {
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