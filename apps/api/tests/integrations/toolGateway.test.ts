import { describe, it, expect, beforeEach } from 'vitest';
import {
  authorizeToolExecution,
  MemoryToolAuditSink,
  type ToolExecutionRequest,
} from '../../src/modules/integrations/gateway';
import { sha256Hex } from '../../src/lib/hash';

/**
 * TQ-06 — Tool Gateway and Connector Authorization Tests
 */

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001';
const ACTOR_ID = '11111111-1111-1111-1111-111111111111';

describe('TQ-06: Tool Gateway and Connector Authorization', () => {
  let auditSink: MemoryToolAuditSink;
  const mockApprovals = new Map<string, any>();

  const mockApprovalGetter = async (wsId: string, appId: string) => {
    const rec = mockApprovals.get(appId);
    if (!rec || rec.workspace_id !== wsId) return null;
    return rec;
  };

  beforeEach(() => {
    auditSink = new MemoryToolAuditSink();
    mockApprovals.clear();
  });

  describe('1. Strict Ads Mutation Guard', () => {
    it('chặn đứng mọi mutation trên Meta Ads (cấm AI tự ý tiêu tiền)', async () => {
      const mutationReq: ToolExecutionRequest = {
        workspace_id: WORKSPACE_ID,
        actor_id: ACTOR_ID,
        actor_role: 'performance',
        provider: 'meta_ads',
        capability: 'create_ad_campaign',
        action_type: 'draft',
        params: { daily_budget: 1000000, campaign_name: 'Expat Summer' },
      };

      await expect(
        authorizeToolExecution(mutationReq, auditSink, mockApprovalGetter)
      ).rejects.toThrowError(/ADS_MUTATIONS_FORBIDDEN/);

      // Verify audit log ghi nhận denial
      const logs = await auditSink.listByWorkspace(WORKSPACE_ID);
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('denied');
      expect(logs[0].denial_reason).toContain('ADS_MUTATIONS_FORBIDDEN');
    });

    it('cho phép đọc read_ads_insights cho vai trò Performance / Research', async () => {
      const readReq: ToolExecutionRequest = {
        workspace_id: WORKSPACE_ID,
        actor_id: ACTOR_ID,
        actor_role: 'performance',
        provider: 'meta_ads',
        capability: 'read_ads_insights',
        action_type: 'read',
        params: { date_range: 'last_7_days' },
      };

      const result = await authorizeToolExecution(readReq, auditSink, mockApprovalGetter);
      expect(result.authorized).toBe(true);

      const logs = await auditSink.listByWorkspace(WORKSPACE_ID);
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('granted');
    });
  });

  describe('2. Role Capability & Action Level Separation', () => {
    it('Research chỉ được phép READ, bị từ chối khi cố tạo draft hoặc publish', async () => {
      const draftReq: ToolExecutionRequest = {
        workspace_id: WORKSPACE_ID,
        actor_id: ACTOR_ID,
        actor_role: 'research',
        provider: 'website_cms',
        capability: 'publish_cms_post',
        action_type: 'draft',
      };

      await expect(
        authorizeToolExecution(draftReq, auditSink, mockApprovalGetter)
      ).rejects.toThrowError(/ROLE_UNAUTHORIZED/);

      const logs = await auditSink.listByWorkspace(WORKSPACE_ID);
      expect(logs[0].status).toBe('denied');
      expect(logs[0].denial_reason).toContain("Role 'research' is not authorized");
    });

    it('SEO được phép đọc Search Console analytics', async () => {
      const gscReq: ToolExecutionRequest = {
        workspace_id: WORKSPACE_ID,
        actor_id: ACTOR_ID,
        actor_role: 'seo',
        provider: 'gsc',
        capability: 'read_search_analytics',
        action_type: 'read',
      };

      const result = await authorizeToolExecution(gscReq, auditSink, mockApprovalGetter);
      expect(result.authorized).toBe(true);
    });

    it('SEO không được phép tự động publish bài ra ngoài', async () => {
      const publishReq: ToolExecutionRequest = {
        workspace_id: WORKSPACE_ID,
        actor_id: ACTOR_ID,
        actor_role: 'seo',
        provider: 'website_cms',
        capability: 'publish_cms_post',
        action_type: 'publish',
        approval_id: 'some-id',
      };

      await expect(
        authorizeToolExecution(publishReq, auditSink, mockApprovalGetter)
      ).rejects.toThrowError(/ROLE_UNAUTHORIZED/);
    });
  });

  describe('3. Human Approval Requirement for "publish"', () => {
    it('hành động publish thiếu approval_id → 403 PUBLISH_REQUIRES_APPROVAL', async () => {
      const publishReq: ToolExecutionRequest = {
        workspace_id: WORKSPACE_ID,
        actor_id: ACTOR_ID,
        actor_role: 'content',
        provider: 'website_cms',
        capability: 'publish_cms_post',
        action_type: 'publish',
      };

      await expect(
        authorizeToolExecution(publishReq, auditSink, mockApprovalGetter)
      ).rejects.toThrowError(/PUBLISH_REQUIRES_APPROVAL/);
    });

    it('approval chưa duyệt (pending) → từ chối xuất bản', async () => {
      const approvalId = 'approval-pending-001';
      mockApprovals.set(approvalId, {
        id: approvalId,
        workspace_id: WORKSPACE_ID,
        target_type: 'content',
        target_id: 'post-123',
        target_version: 1,
        target_hash: sha256Hex('v1'),
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const publishReq: ToolExecutionRequest = {
        workspace_id: WORKSPACE_ID,
        actor_id: ACTOR_ID,
        actor_role: 'content',
        provider: 'website_cms',
        capability: 'publish_cms_post',
        action_type: 'publish',
        approval_id: approvalId,
      };

      await expect(
        authorizeToolExecution(publishReq, auditSink, mockApprovalGetter)
      ).rejects.toThrowError(/APPROVAL_NOT_GRANTED/);
    });

    it('approval bị lệch version cũ (stale version) → 409 CONFLICT', async () => {
      const approvalId = 'approval-stale-002';
      mockApprovals.set(approvalId, {
        id: approvalId,
        workspace_id: WORKSPACE_ID,
        target_type: 'content',
        target_id: 'post-123',
        target_version: 1, // đã duyệt version 1
        target_hash: sha256Hex('v1'),
        status: 'approved',
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Khi gọi executor, content đã bị sửa lên version 2
      const publishReq: ToolExecutionRequest = {
        workspace_id: WORKSPACE_ID,
        actor_id: ACTOR_ID,
        actor_role: 'content',
        provider: 'website_cms',
        capability: 'publish_cms_post',
        action_type: 'publish',
        approval_id: approvalId,
        expected_version: 2, // version mismatch!
      };

      await expect(
        authorizeToolExecution(publishReq, auditSink, mockApprovalGetter)
      ).rejects.toThrowError(/VERSION_MISMATCH/);
    });

    it('approval hợp lệ và khớp đúng version/hash → Cho phép xuất bản thành công', async () => {
      const approvalId = 'approval-valid-003';
      const hash = sha256Hex('content-v2-approved');
      mockApprovals.set(approvalId, {
        id: approvalId,
        workspace_id: WORKSPACE_ID,
        target_type: 'content',
        target_id: 'post-999',
        target_version: 2,
        target_hash: hash,
        status: 'approved',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const publishReq: ToolExecutionRequest = {
        workspace_id: WORKSPACE_ID,
        actor_id: ACTOR_ID,
        actor_role: 'content',
        provider: 'website_cms',
        capability: 'publish_cms_post',
        action_type: 'publish',
        approval_id: approvalId,
        expected_version: 2,
        expected_hash: hash,
      };

      const result = await authorizeToolExecution(publishReq, auditSink, mockApprovalGetter);
      expect(result.authorized).toBe(true);

      const logs = await auditSink.listByWorkspace(WORKSPACE_ID);
      expect(logs[0].status).toBe('granted');
      expect(logs[0].approval_id).toBe(approvalId);
    });
  });

  describe('4. Audit Trail & Secret Redaction', () => {
    it('tuyệt đối không leak secret token trong params_summary của audit log', async () => {
      const readReq: ToolExecutionRequest = {
        workspace_id: WORKSPACE_ID,
        actor_id: ACTOR_ID,
        actor_role: 'seo',
        provider: 'gsc',
        capability: 'read_sites',
        action_type: 'read',
        params: {
          site_url: 'https://tripc.example',
          api_token: 'secret-token-xyz',
          service_account_key: 'my-super-secret-key',
        },
      };

      await authorizeToolExecution(readReq, auditSink, mockApprovalGetter);
      const logs = await auditSink.listByWorkspace(WORKSPACE_ID);
      expect(logs).toHaveLength(1);

      const summary = logs[0].params_summary;
      expect(summary.site_url).toBe('https://tripc.example');
      expect(summary.api_token).toBe('[REDACTED]');
      expect(summary.service_account_key).toBe('[REDACTED]');
    });
  });
});
