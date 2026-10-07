import { describe, it, expect } from 'vitest';
import {
  getConnectionStatus,
  probeOwnership,
  runSync,
  supportMatrix,
  syncMetrics,
} from '../../src/modules/integrations/stubs';
import { matrixFor, serverEnvKeys } from '../../src/modules/integrations/matrix';
import {
  FORBIDDEN_PARAM_KEYS,
  GA4_EVENTS,
  validateGenerateLeadParams,
} from '../../src/modules/integrations/eventSchema';
import { providerSchema } from '../../src/modules/integrations/types';

/**
 * W1-MY-06 — GA4/GSC config matrix & stubs.
 * Chưa có Google account → status not_connected, metrics missing reason,
 * không bịa property/live metrics, credential refs server-only.
 */

describe('GA4/GSC connection stubs (W1-MY-06)', () => {
  it('cả ga4 và gsc đều not_connected với missing_reason, không property bịa', () => {
    for (const provider of ['ga4', 'gsc'] as const) {
      expect(providerSchema.safeParse(provider).success).toBe(true);
      const status = getConnectionStatus('10000000-0000-4000-8000-000000000001', provider);
      expect(status).toMatchObject({
        provider,
        status: 'not_connected',
        missing_reason: 'GOOGLE_CREDENTIALS_NOT_CONFIGURED',
        property_ref: null,
        scopes: [],
        credential_ref: null,
      });
      expect(status.capabilities.length).toBeGreaterThan(0);
      expect(status.capabilities.every((c) => c.status === 'not_connected')).toBe(true);
    }
  });

  it('stub status không bao giờ serialize được credential/env key/secret', () => {
    const status = getConnectionStatus('ws-1', 'ga4');
    const serialized = JSON.stringify(status);
    for (const key of serverEnvKeys()) {
      expect(serialized).not.toContain(key);
    }
    expect(serialized.toLowerCase()).not.toContain('service_account');
    expect(serialized.toLowerCase()).not.toContain('secret');
  });

  it('probe ownership chưa kiểm chứng thật khi chưa kết nối', () => {
    const probe = probeOwnership('gsc', 'https://tripc.example');
    expect(probe).toMatchObject({
      status: 'not_connected',
      checked: false,
      verified: null,
      missing_reason: 'PROPERTY_NOT_VERIFIED',
    });
    const ga4Probe = probeOwnership('ga4', 'properties/123456');
    expect(ga4Probe.checked).toBe(false);
    expect(ga4Probe.verified).toBeNull();
  });

  it('sync metrics → values null + availability missing + reason (KHÔNG thay bằng 0)', () => {
    const result = syncMetrics({
      provider: 'ga4',
      metric: 'sessions',
      range: { from: '2026-10-01', to: '2026-10-07' },
      timezone: 'Asia/Bang_Chi_Minh',
    });
    expect(result).toMatchObject({
      availability: 'missing',
      missing_reason: 'INTEGRATION_NOT_CONNECTED',
      values: null,
      synced_at: null,
    });
    expect(result.values).toBeNull();
  });

  it('runSync skip, không pretend đã sync', () => {
    expect(runSync('gsc')).toEqual({
      status: 'skipped',
      reason: 'INTEGRATION_NOT_CONNECTED',
      synced_at: null,
    });
  });
});

describe('Support/access matrix (W1-MY-06)', () => {
  it('matrix phủ đủ 2 provider và luôn kèm scope + permission', () => {
    const matrix = supportMatrix();
    expect(matrix.length).toBeGreaterThanOrEqual(6);
    for (const provider of ['ga4', 'gsc'] as const) {
      const rows = matrixFor(provider);
      expect(rows.length).toBeGreaterThanOrEqual(2);
      for (const row of rows) {
        expect(row.provider).toBe(provider);
        expect(row.required_scope.length).toBeGreaterThan(0);
        expect(row.required_permission.length).toBeGreaterThan(0);
        expect(row.default_status).toBe('not_connected');
      }
    }
    const scopes = matrix.map((r) => r.required_scope);
    expect(scopes).toContain('https://www.googleapis.com/auth/analytics.readonly');
    expect(scopes).toContain('https://www.googleapis.com/auth/webmasters.readonly');
  });

  it('verify_site_ownership (GSC) nằm trong matrix với lý do chưa verified', () => {
    const rows = matrixFor('gsc');
    const verifyRow = rows.find((r) => r.capability === 'verify_site_ownership');
    expect(verifyRow).toBeDefined();
    expect(verifyRow!.default_missing_reason).toBe('PROPERTY_NOT_VERIFIED');
  });
});

describe('GA4 event schema (W1-MY-06)', () => {
  it('generate_lead hợp lệ (allowlist, theo EXAMPLES) được chấp nhận', () => {
    const result = validateGenerateLeadParams({
      event_id: '10000000-0000-4000-8000-000000000020',
      site_id: 'tripc-pilot',
      content_id: '10000000-0000-4000-8000-000000000008',
      campaign_id: 'synthetic-housing-001',
      assignment_id: '10000000-0000-4000-8000-000000000015',
      utm_source: 'community',
      utm_medium: 'referral',
      utm_campaign: 'da-nang-living',
      utm_content: 'housing-guide',
      variant: 'B',
    });
    expect(result.ok).toBe(true);
  });

  it('params chứa email bị chặn (strict schema → 422 phía contract, không gửi GA4)', () => {
    const result = validateGenerateLeadParams({
      event_id: 'evt-1',
      site_id: 'tripc-pilot',
      email: 'visitor@example.test',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.field === 'email')).toBe(true);
    }
    expect([...FORBIDDEN_PARAM_KEYS]).toContain('email');
  });

  it('unknown key (ngoài allowlist) bị chặn', () => {
    const result = validateGenerateLeadParams({
      event_id: 'evt-1',
      site_id: 'tripc-pilot',
      debug_mode: true,
    });
    expect(result.ok).toBe(false);
  });

  it('thiếu event_id → invalid (dedup bắt buộc)', () => {
    const result = validateGenerateLeadParams({ site_id: 'tripc-pilot' });
    expect(result.ok).toBe(false);
  });

  it('event name generate_lead theo GA4 convention', () => {
    expect(GA4_EVENTS.GENERATE_LEAD).toBe('generate_lead');
    expect(GA4_EVENTS.PAGE_VIEW).toBe('page_view');
  });
});