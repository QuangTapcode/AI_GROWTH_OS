import { describe, it, expect, beforeEach } from 'vitest';
import {
  InMemoryLeadRepository,
  type LeadRecord,
} from '../../src/modules/leads/repository';
import { submitLead } from '../../src/modules/leads/service';
import {
  listWorkspaceLeadsApi,
  getWorkspaceLeadByIdApi,
  updateWorkspaceLeadApi,
} from '../../src/modules/leads/workspace';
import { MemoryAnalyticsSink } from '../../src/lib/analytics';
import type { AuthUser } from '../../src/lib/auth';
import { AppError } from '../../src/lib/errors';

/**
 * TQ-05 — Leads Persistence, Idempotency, Contact Dedup & Sales Handoff Tests
 */

const TEST_WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_WORKSPACE_ID = '99999999-9999-9999-9999-999999999999';

const OWNER_USER: AuthUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'lead-owner@example.com',
  name: 'Lead Owner',
};

const SALES_USER_ID = '22222222-2222-2222-2222-222222222222';

describe('TQ-05: Lead Contact Dedup & Workspace Management', () => {
  let repo: InMemoryLeadRepository;
  let analytics: MemoryAnalyticsSink;

  beforeEach(() => {
    repo = new InMemoryLeadRepository();
    analytics = new MemoryAnalyticsSink();
  });

  it('contact deduplication trong workspace: cùng email gửi 2 form khác key → tạo record mới và ghi chú contact cũ', async () => {
    const deps = { repo, analytics };

    // Form 1
    const res1 = await submitLead(deps, {
      siteId: 'tripc-pilot',
      idempotencyKey: 'key-submit-1',
      body: {
        email: 'returning.buyer@example.com',
        name: 'Nguyen Van A',
        interest_topic: 'housing',
        consent: { accepted: true, policy_version: 'v1.0' },
      },
    });

    expect(res1.kind).toBe('created');
    if (res1.kind !== 'created') return;

    const lead1 = await repo.findById(res1.submission_id);
    expect(lead1).not.toBeNull();
    expect(lead1?.notes).toBeNull();
    expect(lead1?.lead_status).toBe('New');

    // Form 2: Khách hàng quay lại quan tâm thêm dự án khác (cùng email, khác idempotency key)
    const res2 = await submitLead(deps, {
      siteId: 'tripc-pilot',
      idempotencyKey: 'key-submit-2',
      body: {
        email: 'returning.buyer@example.com',
        name: 'Nguyen Van A',
        interest_topic: 'investment',
        consent: { accepted: true, policy_version: 'v1.0' },
      },
    });

    expect(res2.kind).toBe('created');
    if (res2.kind !== 'created') return;

    const lead2 = await repo.findById(res2.submission_id);
    expect(lead2).not.toBeNull();
    expect(lead2?.id).not.toBe(lead1?.id);
    // Contact deduplication marker
    expect(lead2?.notes).toContain('Returning contact in workspace');
    expect(lead2?.notes).toContain(lead1?.id);
    expect(await repo.count()).toBe(2);
  });

  it('lọc danh sách leads và tìm kiếm trong workspace', async () => {
    const deps = { repo, analytics };

    await submitLead(deps, {
      siteId: 'tripc-pilot',
      idempotencyKey: 'key-lead-a',
      body: {
        email: 'alice@tripc.test',
        name: 'Alice Johnson',
        interest_topic: 'beachfront-villa',
        consent: { accepted: true, policy_version: 'v1.0' },
      },
    });

    await submitLead(deps, {
      siteId: 'tripc-pilot',
      idempotencyKey: 'key-lead-b',
      body: {
        email: 'bob@tripc.test',
        name: 'Bob Martin',
        interest_topic: 'apartment-rent',
        consent: { accepted: true, policy_version: 'v1.0' },
      },
    });

    // Mock resolveTenantContext by testing repository list directly with filters
    const allLeads = await repo.listByWorkspace(TEST_WORKSPACE_ID, { limit: 10, offset: 0 });
    expect(allLeads.total).toBe(2);
    expect(allLeads.items).toHaveLength(2);

    // Filter by search
    const searchAlice = await repo.listByWorkspace(TEST_WORKSPACE_ID, { search: 'Alice' });
    expect(searchAlice.total).toBe(1);
    expect(searchAlice.items[0].email).toBe('alice@tripc.test');

    const searchTopic = await repo.listByWorkspace(TEST_WORKSPACE_ID, { search: 'rent' });
    expect(searchTopic.total).toBe(1);
    expect(searchTopic.items[0].name).toBe('Bob Martin');
  });

  it('sales handoff: cập nhật trạng thái, gán owner và bổ sung ghi chú tư vấn', async () => {
    const deps = { repo, analytics };

    const res = await submitLead(deps, {
      siteId: 'tripc-pilot',
      idempotencyKey: 'key-lead-sales',
      body: {
        email: 'investor@global.test',
        name: 'Michael Chen',
        interest_topic: 'da-nang-condo',
        consent: { accepted: true, policy_version: 'v1.0' },
      },
    });

    expect(res.kind).toBe('created');
    if (res.kind !== 'created') return;

    // Gán lead cho Sales và chuyển trạng thái sang Assigned
    const assigned = await repo.updateLead(TEST_WORKSPACE_ID, res.submission_id, {
      lead_status: 'Assigned',
      lead_owner: SALES_USER_ID,
      notes: 'Telesale team contacted via WhatsApp on Oct 17',
    });

    expect(assigned).not.toBeNull();
    expect(assigned?.lead_status).toBe('Assigned');
    expect(assigned?.lead_owner).toBe(SALES_USER_ID);
    expect(assigned?.notes).toBe('Telesale team contacted via WhatsApp on Oct 17');

    // Chuyển sang Converted
    const converted = await repo.updateLead(TEST_WORKSPACE_ID, res.submission_id, {
      lead_status: 'Converted',
    });

    expect(converted?.lead_status).toBe('Converted');
    expect(converted?.lead_owner).toBe(SALES_USER_ID); // vẫn giữ owner
  });

  it('cô lập đa khách thuê (Multi-tenant): không thể cập nhật hoặc xem lead từ workspace khác', async () => {
    const deps = { repo, analytics };

    const res = await submitLead(deps, {
      siteId: 'tripc-pilot',
      idempotencyKey: 'key-isolation-test',
      body: {
        email: 'tenant.isolate@test.com',
        name: 'Isolate User',
        interest_topic: 'villas',
        consent: { accepted: true, policy_version: 'v1.0' },
      },
    });

    if (res.kind !== 'created') throw new Error('Expected created');

    // Tìm kiếm với workspace khác -> null
    const crossCheck = await repo.findById(res.submission_id, OTHER_WORKSPACE_ID);
    expect(crossCheck).toBeNull();

    // Cập nhật với workspace khác -> null (bị chặn)
    const crossUpdate = await repo.updateLead(OTHER_WORKSPACE_ID, res.submission_id, {
      lead_status: 'Archived',
    });
    expect(crossUpdate).toBeNull();

    // Danh sách của workspace khác = 0
    const otherList = await repo.listByWorkspace(OTHER_WORKSPACE_ID);
    expect(otherList.total).toBe(0);
    expect(otherList.items).toHaveLength(0);
  });
});
