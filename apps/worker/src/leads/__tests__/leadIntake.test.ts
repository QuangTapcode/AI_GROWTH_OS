/**
 * Tests for LeadIntakeService — independent, mock-based (preparation for MY-06).
 * Run: npm test (vitest)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LeadIntakeService, generateLeadIdempotencyKey } from '../LeadIntakeService';

describe('LeadIntakeService', () => {
  let service: LeadIntakeService;

  beforeEach(() => {
    // null tường minh: luôn in-memory, không phụ thuộc DATABASE_URL của môi trường
    // (test PG thật nằm ở tests/pgLeadStore.test.ts).
    service = new LeadIntakeService(null);
  });

  it('should create a new lead with valid input', async () => {
    const result = await service.intake({
      workspaceId: 'ws_1',
      contactName: 'John Doe',
      contactEmail: 'john@example.com',
      phoneNumber: '+84 123 456 789',
      utmSource: 'facebook',
      utmMedium: 'social',
      utmCampaign: 'da-nang-housing',
      consent: true,
    });
    expect(result.success).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.lead?.contactEmail).toBe('john@example.com');
    expect(result.lead?.leadStatus).toBe('New');
    expect(result.lead?.idempotencyKey).toBeDefined();
  });

  it('should reject invalid email', async () => {
    const result = await service.intake({
      workspaceId: 'ws_1',
      contactEmail: 'not-an-email',
      utmSource: 'facebook',
      utmMedium: 'social',
      utmCampaign: 'campaign',
      consent: true,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('INVALID_EMAIL');
  });

  it('should reject missing UTM params', async () => {
    const result = await service.intake({
      workspaceId: 'ws_1',
      contactEmail: 'john@example.com',
      utmSource: '',
      utmMedium: 'social',
      utmCampaign: 'campaign',
      consent: true,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('MISSING_UTM');
  });

  it('should reject without consent', async () => {
    const result = await service.intake({
      workspaceId: 'ws_1',
      contactEmail: 'john@example.com',
      utmSource: 'facebook',
      utmMedium: 'social',
      utmCampaign: 'campaign',
      consent: false,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('CONSENT_REQUIRED');
  });

  it('should deduplicate same lead (same idempotency key)', async () => {
    const input = {
      workspaceId: 'ws_1',
      contactEmail: 'john@example.com',
      utmSource: 'facebook',
      utmMedium: 'social',
      utmCampaign: 'campaign',
      consent: true,
    };
    const first = await service.intake(input);
    const second = await service.intake(input);
    expect(first.success).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(second.success).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(second.lead?.leadId).toBe(first.lead?.leadId); // Same record returned
  });

  it('should generate same idempotency key for same input', () => {
    const input = {
      workspaceId: 'ws_1',
      contactEmail: 'john@example.com',
      utmSource: 'facebook',
      utmMedium: 'social',
      utmCampaign: 'campaign',
    };
    const key1 = generateLeadIdempotencyKey(input);
    const key2 = generateLeadIdempotencyKey(input);
    expect(key1).toBe(key2);
    expect(key1).toContain('lead:ws_1:');
  });

  it('should list leads for workspace', async () => {
    await service.intake({
      workspaceId: 'ws_1',
      contactEmail: 'a@example.com',
      utmSource: 'fb', utmMedium: 'social', utmCampaign: 'c1', consent: true,
    });
    await service.intake({
      workspaceId: 'ws_2',
      contactEmail: 'b@example.com',
      utmSource: 'fb', utmMedium: 'social', utmCampaign: 'c1', consent: true,
    });
    const ws1Leads = service.listForWorkspace('ws_1');
    const ws2Leads = service.listForWorkspace('ws_2');
    expect(ws1Leads).toHaveLength(1);
    expect(ws2Leads).toHaveLength(1);
  });

  it('should update lead status and owner', async () => {
    const result = await service.intake({
      workspaceId: 'ws_1',
      contactEmail: 'john@example.com',
      utmSource: 'fb', utmMedium: 'social', utmCampaign: 'c1', consent: true,
    });
    const leadId = result.lead!.leadId;
    const updated = await service.updateStatus('ws_1', leadId, 'Assigned', 'owner_1');
    expect(updated?.leadStatus).toBe('Assigned');
    expect(updated?.leadOwner).toBe('owner_1');
  });

  it('should return null for non-existent lead update', async () => {
    const updated = await service.updateStatus('ws_1', 'nonexistent', 'Converted');
    expect(updated).toBeNull();
  });
});