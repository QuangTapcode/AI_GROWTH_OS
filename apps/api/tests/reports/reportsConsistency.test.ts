import { describe, it, expect, beforeEach } from 'vitest';
import {
  getWorkspaceReport,
  recordMetricSnapshot,
  listWorkspaceExceptions,
  createWorkspaceException,
  updateWorkspaceException,
  recordOutboxEvent,
  processPendingOutboxEvents,
  memoryExceptions,
  memoryOutbox,
  memorySnapshots,
} from '../../src/modules/reports/service';
import { globalLeadRepo } from '../../src/lib/public-service';
import { submitLead } from '../../src/modules/leads/service';
import { MemoryAnalyticsSink } from '../../src/lib/analytics';

/**
 * TQ-07 — Reports, Metrics Snapshots, Exceptions with Owners & Outbox Consistency Tests
 */

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const OWNER_USER_ID = '11111111-1111-1111-1111-111111111111';
const SALES_USER_ID = '22222222-2222-2222-2222-222222222222';

describe('TQ-07: Reports, Real Metrics, Exceptions & Event Consistency', () => {
  beforeEach(() => {
    memoryExceptions.clear();
    memoryOutbox.clear();
    memorySnapshots.clear();
  });

  describe('1. Reports & Real Metrics (Never Fake 0 for Missing)', () => {
    it('đọc số liệu leads thật từ database và giữ nguyên missing_reason cho các chỉ số ngoài chưa kết nối', async () => {
      // 1. Tạo 2 leads thật
      const deps = { repo: globalLeadRepo, analytics: new MemoryAnalyticsSink() };
      await submitLead(deps, {
        siteId: 'tripc-pilot',
        idempotencyKey: 'report-lead-1',
        body: {
          email: 'lead1@report.test',
          name: 'Lead One',
          interest_topic: 'housing',
          consent: { accepted: true, policy_version: 'v1.0' },
        },
      });
      await submitLead(deps, {
        siteId: 'tripc-pilot',
        idempotencyKey: 'report-lead-2',
        body: {
          email: 'lead2@report.test',
          name: 'Lead Two',
          interest_topic: 'housing',
          consent: { accepted: true, policy_version: 'v1.0' },
        },
      });

      const today = new Date().toISOString().split('T')[0];
      const report = await getWorkspaceReport(WORKSPACE_ID, {
        from: today,
        to: today,
        timezone: 'Asia/Bang_Chi_Minh',
        currency: 'VND',
      });

      expect(report.workspace_id).toBe(WORKSPACE_ID);
      expect(report.period.timezone).toBe('Asia/Bang_Chi_Minh');
      expect(report.period.currency).toBe('VND');

      // Leads nội bộ đọc thật từ repo
      expect(report.kpis.leads_generated.availability).toBe('available');
      expect(report.kpis.leads_generated.value).toBeGreaterThanOrEqual(2);
      expect(report.kpis.leads_generated.missing_reason).toBeNull();

      // Chỉ số bên ngoài chưa có credentials: TUYỆT ĐỐI KHÔNG FAKE THÀNH 0
      expect(report.kpis.sessions.availability).toBe('missing');
      expect(report.kpis.sessions.value).toBeNull();
      expect(report.kpis.sessions.missing_reason).toBe('GOOGLE_CREDENTIALS_NOT_CONFIGURED');

      expect(report.kpis.search_clicks.availability).toBe('missing');
      expect(report.kpis.search_clicks.value).toBeNull();
      expect(report.kpis.search_clicks.missing_reason).toBe('PROPERTY_NOT_VERIFIED');

      expect(report.kpis.ad_spend.availability).toBe('missing');
      expect(report.kpis.ad_spend.value).toBeNull();
      expect(report.kpis.ad_spend.missing_reason).toBe('META_ADS_ACCESS_MISSING');
    });

    it('nếu có snapshot số liệu được lưu thì report đọc đúng snapshot thật', async () => {
      const today = '2026-10-17';
      recordMetricSnapshot({
        workspace_id: WORKSPACE_ID,
        provider: 'ga4',
        metric_name: 'sessions',
        period_from: today,
        period_to: today,
        timezone: 'Asia/Bang_Chi_Minh',
        currency: 'VND',
        metric_value: 1250,
        availability: 'available',
        missing_reason: null,
      });

      const report = await getWorkspaceReport(WORKSPACE_ID, {
        from: today,
        to: today,
      });

      expect(report.kpis.sessions.availability).toBe('available');
      expect(report.kpis.sessions.value).toBe(1250);
      expect(report.kpis.sessions.missing_reason).toBeNull();
    });
  });

  describe('2. Exceptions with Assigned Owners', () => {
    it('tạo và phân bổ ngoại lệ kỹ thuật/nghiệp vụ cho đúng owner chịu trách nhiệm', async () => {
      const exc = await createWorkspaceException(WORKSPACE_ID, {
        code: 'CONNECTOR_DISCONNECTED',
        title: 'Google Search Console token expired',
        severity: 'high',
        assigned_owner: OWNER_USER_ID,
        description: 'Service account credentials need refresh from GCP IAM console',
      });

      expect(exc.id).toBeDefined();
      expect(exc.status).toBe('open');
      expect(exc.assigned_owner).toBe(OWNER_USER_ID);
      expect(exc.severity).toBe('high');

      // Lọc danh sách exceptions theo owner
      const list = await listWorkspaceExceptions(WORKSPACE_ID, { assigned_owner: OWNER_USER_ID });
      expect(list).toHaveLength(1);
      expect(list[0].code).toBe('CONNECTOR_DISCONNECTED');
    });

    it('cập nhật tiến độ xử lý ngoại lệ: chuyển investigating → resolved kèm ghi chú', async () => {
      const exc = await createWorkspaceException(WORKSPACE_ID, {
        code: 'INSUFFICIENT_DATA',
        title: 'Traffic sample size below statistical threshold',
        severity: 'medium',
        assigned_owner: SALES_USER_ID,
      });

      const updated = await updateWorkspaceException(WORKSPACE_ID, exc.id, {
        status: 'resolved',
        resolution_note: 'Extended sampling window from 3 days to 7 days as approved by Lead',
      });

      expect(updated.status).toBe('resolved');
      expect(updated.resolution_note).toContain('Extended sampling window');
      expect(updated.resolved_at).not.toBeNull();
    });
  });

  describe('3. Transactional Outbox & Event Deduplication', () => {
    it('ghi nhận outbox event và chống trùng lặp theo dedup_key trong cùng workspace', async () => {
      const first = await recordOutboxEvent(WORKSPACE_ID, {
        event_type: 'task_completed',
        dedup_key: 'task-101-completed',
        payload: { task_id: 'task-101', role: 'content', next_step: 'approval' },
      });

      expect(first.deduplicated).toBe(false);
      expect(first.event.status).toBe('pending');
      expect(first.event.dedup_key).toBe('task-101-completed');

      // Gửi lại cùng dedup_key -> trả về event cũ, deduplicated: true
      const second = await recordOutboxEvent(WORKSPACE_ID, {
        event_type: 'task_completed',
        dedup_key: 'task-101-completed',
        payload: { task_id: 'task-101', role: 'content', next_step: 'approval' },
      });

      expect(second.deduplicated).toBe(true);
      expect(second.event.id).toBe(first.event.id);
    });

    it('dispatch outbox events: chuyển trạng thái atomic từ pending → published cho vòng tiếp theo', async () => {
      await recordOutboxEvent(WORKSPACE_ID, {
        event_type: 'lead_captured',
        dedup_key: 'lead-captured-001',
        payload: { lead_id: 'lead-uuid' },
      });
      await recordOutboxEvent(WORKSPACE_ID, {
        event_type: 'publication_completed',
        dedup_key: 'pub-completed-002',
        payload: { post_id: 'post-uuid' },
      });

      const result = await processPendingOutboxEvents(WORKSPACE_ID);
      expect(result.processed_count).toBe(2);
      expect(result.published_events).toHaveLength(2);
      expect(result.published_events[0].status).toBe('published');
      expect(result.published_events[0].published_at).not.toBeNull();

      // Không còn event nào pending
      const nextRun = await processPendingOutboxEvents(WORKSPACE_ID);
      expect(nextRun.processed_count).toBe(0);
    });
  });
});
