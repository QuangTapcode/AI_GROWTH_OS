import { describe, it, expect } from 'vitest';
import { createLeadRoutes, type PublicHttpRequest } from '../../src/modules/leads/routes';
import { InMemoryLeadRepository } from '../../src/modules/leads/repository';
import { MemoryAnalyticsSink } from '../../src/lib/analytics';

/**
 * W1-MY-04 — Public lead endpoint tests.
 * Không cần auth/DB/API ngoài: repository in-memory + transaction stub.
 */

const VALID_BODY = {
  email: 'qa@example.test',
  name: 'Example Visitor',
  interest_topic: 'housing',
  consent: { accepted: true, policy_version: 'draft-1' },
  context: {
    visitor_id: 'synthetic-visitor-001',
    content_id: '10000000-0000-4000-8000-000000000008',
    campaign_id: 'synthetic-housing-001',
    assignment_id: '10000000-0000-4000-8000-000000000015',
    utm_source: 'community',
    utm_medium: 'referral',
    utm_campaign: 'da-nang-living',
    utm_content: 'housing-guide',
  },
};

function harness() {
  const repo = new InMemoryLeadRepository();
  const analytics = new MemoryAnalyticsSink();
  const routes = createLeadRoutes({ repo, analytics });
  return { repo, analytics, routes };
}

function makeReq(over: Partial<PublicHttpRequest> = {}): PublicHttpRequest {
  return {
    params: { site_id: 'tripc-pilot' },
    headers: { 'idempotency-key': 'synthetic-submit-001' },
    body: VALID_BODY,
    ...over,
  };
}

describe('POST /public/v1/sites/{site_id}/leads (W1-MY-04)', () => {
  it('payload hợp lệ → 201 {submission_id, status persisted, deduplicated false}', async () => {
    const { routes, repo } = harness();
    const res = await routes.handleCreateLead(makeReq());

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'persisted', deduplicated: false });
    expect(typeof res.body.submission_id).toBe('string');
    expect(await repo.count()).toBe(1);
  });

  it('gửi trùng (cùng key + cùng payload) → 200 cùng submission_id, deduplicated true, row vẫn = 1', async () => {
    const { routes, repo } = harness();
    const first = await routes.handleCreateLead(makeReq());
    const second = await routes.handleCreateLead(makeReq());

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.submission_id).toBe(first.body.submission_id);
    expect(second.body).toMatchObject({ status: 'persisted', deduplicated: true });
    expect(await repo.count()).toBe(1);
  });

  it('cùng key + khác payload → 409, không tạo record khác', async () => {
    const { routes, repo } = harness();
    const first = await routes.handleCreateLead(makeReq());
    const conflict = await routes.handleCreateLead(
      makeReq({ body: { ...VALID_BODY, email: 'other@example.test' } }),
    );

    expect(conflict.status).toBe(409);
    const err = conflict.body.error as Record<string, unknown>;
    expect(err.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH');
    expect((err.details as { submission_id: string }).submission_id).toBe(first.body.submission_id);
    expect(await repo.count()).toBe(1);
  });

  it('email không hợp lệ → 422 kèm field_errors', async () => {
    const { routes, repo } = harness();
    const res = await routes.handleCreateLead(makeReq({ body: { ...VALID_BODY, email: 'not-an-email' } }));

    expect(res.status).toBe(422);
    const err = res.body.error as Record<string, unknown>;
    expect(err.code).toBe('VALIDATION_ERROR');
    const fieldErrors = err.field_errors as Array<{ field: string }>;
    expect(fieldErrors.some((f) => f.field === 'email')).toBe(true);
    expect(await repo.count()).toBe(0);
  });

  it('consent.accepted = false → 422 (không persist, không event)', async () => {
    const { routes, repo, analytics } = harness();
    const res = await routes.handleCreateLead(
      makeReq({ body: { ...VALID_BODY, consent: { accepted: false, policy_version: 'draft-1' } } }),
    );

    expect(res.status).toBe(422);
    const err = res.body.error as Record<string, unknown>;
    const fieldErrors = err.field_errors as Array<{ field: string }>;
    expect(fieldErrors.some((f) => f.field === 'consent.accepted')).toBe(true);
    expect(await repo.count()).toBe(0);
    expect(analytics.events).toHaveLength(0);
  });

  it('thiếu Idempotency-Key → 422', async () => {
    const { routes, repo } = harness();
    const res = await routes.handleCreateLead(makeReq({ headers: {} }));

    expect(res.status).toBe(422);
    const err = res.body.error as Record<string, unknown>;
    const fieldErrors = err.field_errors as Array<{ field: string }>;
    expect(fieldErrors.some((f) => f.field === 'Idempotency-Key')).toBe(true);
    expect(await repo.count()).toBe(0);
  });

  it('site không tồn tại → 404', async () => {
    const { routes } = harness();
    const res = await routes.handleCreateLead(makeReq({ params: { site_id: 'no-such-site' } }));
    expect(res.status).toBe(404);
    expect((res.body.error as Record<string, unknown>).code).toBe('SITE_NOT_FOUND');
  });
});

describe('W1-MY-04 — transaction rollback, server fail và analytics an toàn', () => {
  it('DB fail giữa transaction → 500, KHÔNG row, KHÔNG event success', async () => {
    const { routes, repo, analytics } = harness();
    repo.failNextTransactionAfterInsert();

    const res = await routes.handleCreateLead(makeReq());

    expect(res.status).toBe(500);
    expect((res.body.error as Record<string, unknown>).code).toBe('INTERNAL_ERROR');
    expect(await repo.count()).toBe(0); // rollback: insert đã stage bị hủy
    expect(analytics.events).toHaveLength(0); // không có generate_lead success
  });

  it('server fail rồi retry cùng key vẫn tạo được record (key không dính sau rollback)', async () => {
    const { routes, repo } = harness();
    repo.failNextTransactionAfterInsert();
    const failed = await routes.handleCreateLead(makeReq());
    expect(failed.status).toBe(500);

    const retried = await routes.handleCreateLead(makeReq());
    expect(retried.status).toBe(201);
    expect(await repo.count()).toBe(1);
  });

  it('sau khi persist thành công mới ghi 1 generate_lead, params allowlist không PII', async () => {
    const { routes, analytics } = harness();
    const first = await routes.handleCreateLead(makeReq());
    // duplicate không tính conversion lần 2
    await routes.handleCreateLead(makeReq());

    expect(analytics.events).toHaveLength(1);
    const event = analytics.events[0];
    expect(event.name).toBe('generate_lead');
    expect(event.params).toMatchObject({
      content_id: '10000000-0000-4000-8000-000000000008',
      campaign_id: 'synthetic-housing-001',
      utm_source: 'community',
      site_id: 'tripc-pilot',
    });
    expect(event.params.event_id).toBe(first.body.submission_id); // conversion gắn đúng submission
    const serialized = JSON.stringify(event.params).toLowerCase();
    expect(serialized).not.toContain('qa@example.test');
    expect(serialized).not.toContain('example visitor');
    expect(serialized).not.toContain('"email"');
    expect(serialized).not.toContain('"name"');
  });

  it('response không echo email/name (chỉ submission_id/status/deduplicated)', async () => {
    const { routes } = harness();
    const res = await routes.handleCreateLead(makeReq());

    expect(Object.keys(res.body).sort()).toEqual(['deduplicated', 'status', 'submission_id']);
    const serialized = JSON.stringify(res.body).toLowerCase();
    expect(serialized).not.toContain('qa@example.test');
    expect(serialized).not.toContain('example visitor');
  });

  it('request_id luôn có mặt trong envelope lỗi', async () => {
    const { routes } = harness();
    const res = await routes.handleCreateLead(makeReq({ body: { ...VALID_BODY, email: 'bad' } }));
    const err = res.body.error as Record<string, unknown>;
    expect(typeof err.request_id).toBe('string');
    expect(String(err.request_id).length).toBeGreaterThan(0);
  });
});
