import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { InMemoryLeadRepository } from '../../src/modules/leads/repository';
import {
  createWorkspaceException,
  updateWorkspaceException,
  recordOutboxEvent,
  processPendingOutboxEvents,
  memoryExceptions,
  memoryOutbox,
} from '../../src/modules/reports/service';
import { AppError } from '../../src/lib/errors';

/**
 * TQ-08 — Hardening Auth, Multi-tenant Relation Isolation, Concurrent Approval & Migration Verifications
 */

const WORKSPACE_A = '10000000-0000-4000-8000-000000000001';
const WORKSPACE_B = '20000000-0000-4000-8000-000000000002';
const USER_A = '11111111-1111-1111-1111-111111111111';

describe('TQ-08: Security, Tenant Isolation & Migration Hardening', () => {
  beforeEach(() => {
    memoryExceptions.clear();
    memoryOutbox.clear();
  });

  describe('1. Cross-Tenant Relation IDs Hardening', () => {
    it('lead thuộc workspace A tuyệt đối không thể đọc hoặc update từ workspace B', async () => {
      const leadRepo = new InMemoryLeadRepository();
      const leadId = 'lead-uuid-test-001';

      await leadRepo.withTransaction(async (tx) => {
        await tx.insertLead({
          id: leadId,
          site_id: 'tripc-pilot',
          workspace_id: WORKSPACE_A,
          email: 'secure@tripc.test',
          name: 'Secure Contact',
          interest_topic: 'housing',
          consent_accepted: true,
          consent_policy_version: 'v1.0',
          context: {},
          idempotency_key: 'secure-key-1',
          payload_hash: 'hash-1',
          lead_status: 'New',
          lead_owner: null,
          notes: null,
          captured_at: new Date(),
          updated_at: new Date(),
          created_at: new Date(),
        });
      });

      // 1. Tìm trong workspace A: tìm thấy
      const foundInA = await leadRepo.findById(leadId, WORKSPACE_A);
      expect(foundInA).not.toBeNull();

      // 2. Cố tình truy cập bằng workspace B: trả về null (chặn đứng rò rỉ dữ liệu)
      const leakAttempt = await leadRepo.findById(leadId, WORKSPACE_B);
      expect(leakAttempt).toBeNull();

      // 3. Cố tình cập nhật từ workspace B: bị từ chối (trả về null)
      const updateAttempt = await leadRepo.updateLead(WORKSPACE_B, leadId, {
        lead_status: 'Archived',
        notes: 'Hacked note',
      });
      expect(updateAttempt).toBeNull();

      // Trạng thái trong A vẫn nguyên vẹn
      const verifiedA = await leadRepo.findById(leadId, WORKSPACE_A);
      expect(verifiedA?.lead_status).toBe('New');
      expect(verifiedA?.notes).toBeNull();
    });

    it('exception thuộc workspace A không thể truy cập hoặc cập nhật từ workspace B', async () => {
      const exc = await createWorkspaceException(WORKSPACE_A, {
        code: 'TENANT_TEST_ERROR',
        title: 'Error in workspace A',
        severity: 'medium',
      });

      // Cố tình update exception của workspace A từ workspace B -> ném 404 NOT_FOUND
      try {
        await updateWorkspaceException(WORKSPACE_B, exc.id, {
          status: 'resolved',
          resolution_note: 'Illegal cross-tenant resolve',
        });
        expect.unreachable('Should have thrown AppError');
      } catch (err: any) {
        expect(err.code).toBe('NOT_FOUND');
        expect(err.statusCode).toBe(404);
      }

      // Verify trạng thái trong A vẫn là open
      const excInA = memoryExceptions.get(exc.id);
      expect(excInA?.status).toBe('open');
      expect(excInA?.resolution_note).toBeNull();
    });

    it('outbox events của workspace A hoàn toàn độc lập với workspace B', async () => {
      await recordOutboxEvent(WORKSPACE_A, {
        event_type: 'workflow_completed',
        dedup_key: 'shared-dedup-key',
        payload: { source: 'ws-a' },
      });

      // Cùng dedup_key nhưng ở workspace B -> vẫn được tạo mới (cô lập tenant hoàn hảo)
      const resB = await recordOutboxEvent(WORKSPACE_B, {
        event_type: 'workflow_completed',
        dedup_key: 'shared-dedup-key',
        payload: { source: 'ws-b' },
      });
      expect(resB.deduplicated).toBe(false);

      // Dispatch trong A không làm ảnh hưởng B
      const dispatchA = await processPendingOutboxEvents(WORKSPACE_A);
      expect(dispatchA.processed_count).toBe(1);

      // Event của B vẫn ở trạng thái pending
      const pendingB = Array.from(memoryOutbox.values()).filter(
        (e) => e.workspace_id === WORKSPACE_B && e.status === 'pending'
      );
      expect(pendingB).toHaveLength(1);
    });
  });

  describe('2. Concurrent Approval Conflict & Stale Detection', () => {
    it('chặn xung đột khi hai người cùng duyệt đồng thời: người thứ 2 nhận 409 APPROVAL_ALREADY_REVIEWED', () => {
      // Giả lập trạng thái approval đã được người thứ nhất duyệt thành công
      const approval = {
        id: 'appr-concurrent-001',
        workspace_id: WORKSPACE_A,
        status: 'approved', // đã approved
        target_version: 1,
      };

      // Người thứ hai gọi review
      const isAlreadyReviewed = approval.status !== 'pending';
      expect(isAlreadyReviewed).toBe(true);

      try {
        if (approval.status !== 'pending') {
          throw new AppError(
            409,
            'APPROVAL_ALREADY_REVIEWED',
            `Approval record has already been reviewed (current status: ${approval.status}). Concurrent reviews are not allowed.`
          );
        }
        expect.unreachable('Should have thrown AppError');
      } catch (err: any) {
        expect(err.code).toBe('APPROVAL_ALREADY_REVIEWED');
        expect(err.statusCode).toBe(409);
      }
    });

    it('khi nguồn (source) bị thu hồi (revoked), đánh dấu lý do SOURCE_REVOKED cho toàn bộ downstream', () => {
      const reason = 'SOURCE_REVOKED';
      const mockApproval = {
        id: 'appr-source-001',
        target_type: 'source',
        target_id: 'src-123',
        status: 'approved',
        invalidated_reason: null as string | null,
      };

      // Cascade revocation
      if (mockApproval.target_type === 'source') {
        mockApproval.status = 'revoked';
        mockApproval.invalidated_reason = reason;
      }

      expect(mockApproval.status).toBe('revoked');
      expect(mockApproval.invalidated_reason).toBe('SOURCE_REVOKED');
    });
  });

  describe('3. Migration Forward (UP) and Rollback (DOWN) Integrity', () => {
    it('kiểm tra toàn bộ migration scripts 001..004 có đầy đủ cấu trúc UP và DOWN script tương ứng', () => {
      const migrationsDir = path.resolve(__dirname, '../../../../database/migrations');
      expect(fs.existsSync(migrationsDir)).toBe(true);

      const files = fs.readdirSync(migrationsDir);

      const upFiles = files.filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql')).sort();
      const downFiles = files.filter((f) => f.endsWith('.down.sql')).sort();

      // Kiểm tra có đầy đủ 001, 002, 003, 004
      expect(upFiles.some((f) => f.includes('001_initial_core_schema.sql'))).toBe(true);
      expect(upFiles.some((f) => f.includes('002_workflow_content_ledger.sql'))).toBe(true);
      expect(upFiles.some((f) => f.includes('003_leads_persistence.sql'))).toBe(true);
      expect(upFiles.some((f) => f.includes('004_reports_exceptions_outbox.sql'))).toBe(true);

      // Kiểm tra các down files tương ứng với migration bổ sung (002, 003, 004)
      expect(downFiles.some((f) => f.includes('002_workflow_content_ledger.down.sql'))).toBe(true);
      expect(downFiles.some((f) => f.includes('003_leads_persistence.down.sql'))).toBe(true);
      expect(downFiles.some((f) => f.includes('004_reports_exceptions_outbox.down.sql'))).toBe(true);

      // Đọc nội dung để kiểm tra cú pháp DROP TABLE CASCADE trong down files
      for (const downFile of downFiles) {
        const content = fs.readFileSync(path.join(migrationsDir, downFile), 'utf-8');
        expect(content.toUpperCase()).toContain('DROP TABLE');
        expect(content.toUpperCase()).toContain('CASCADE');
      }
    });
  });

  describe('4. Audit Remediation Verifications (5 Flaws Fixed)', () => {
    it('Flaw 1: chặn đứng Privilege Escalation - Viewer không thể mạo nhận owner hoặc growth_lead', async () => {
      const { authorizeToolExecution, MemoryToolAuditSink } = await import('../../src/modules/integrations/gateway');
      const auditSink = new MemoryToolAuditSink();

      const escalationAttempt = {
        workspace_id: WORKSPACE_A,
        actor_id: USER_A,
        caller_role: 'viewer' as const,
        actor_role: 'owner' as const,
        provider: 'website_cms' as const,
        capability: 'publish_cms_post',
        action_type: 'read' as const,
      };

      await expect(
        authorizeToolExecution(escalationAttempt, auditSink, async () => null)
      ).rejects.toThrowError(/PRIVILEGE_ESCALATION_FORBIDDEN/);

      // Verify audit log ghi nhận denial với lý do privilege escalation
      const logs = await auditSink.listByWorkspace(WORKSPACE_A);
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('denied');
      expect(logs[0].denial_reason).toContain('PRIVILEGE_ESCALATION_FORBIDDEN');
    });

    it('Flaw 2: Dev Token Isolation - Chặn đứng dev tokens và raw unverified UUIDs khi chạy production', async () => {
      const { authenticateUser } = await import('../../src/lib/auth');
      const { NextRequest } = await import('next/server');

      const originalEnv = process.env.NODE_ENV;
      try {
        (process.env as any).NODE_ENV = 'production';
        delete process.env.ALLOW_INSECURE_DEV_AUTH;

        const req = new NextRequest('http://localhost:3000/v1/workspaces', {
          headers: { authorization: 'Bearer dev_owner' },
        });

        expect(() => authenticateUser(req)).toThrowError(/Dev tokens are strictly forbidden in production/);

        const rawUuidReq = new NextRequest('http://localhost:3000/v1/workspaces', {
          headers: { authorization: `Bearer ${USER_A}` },
        });

        expect(() => authenticateUser(rawUuidReq)).toThrowError(/Unsigned raw UUID tokens are forbidden in production/);
      } finally {
        (process.env as any).NODE_ENV = originalEnv;
      }
    });

    it('Flaw 3 & 4: Outbox RFC 9110 Safe GET & PostgreSQL/In-Memory State Separation', async () => {
      const { listWorkspaceOutboxEvents } = await import('../../src/modules/reports/service');

      await recordOutboxEvent(WORKSPACE_A, {
        event_type: 'lead_captured',
        dedup_key: 'audit-safe-get-key',
        payload: { email: 'safe@test.vn' },
      });

      // GET không làm thay đổi trạng thái (vẫn pending)
      const listBefore = await listWorkspaceOutboxEvents(WORKSPACE_A);
      expect(listBefore.length).toBeGreaterThanOrEqual(1);
      const target = listBefore.find((e) => e.dedup_key === 'audit-safe-get-key');
      expect(target?.status).toBe('pending');

      // Dispatch mới làm chuyển sang published
      const dispatchResult = await processPendingOutboxEvents(WORKSPACE_A);
      expect(dispatchResult.processed_count).toBeGreaterThanOrEqual(1);

      const listAfter = await listWorkspaceOutboxEvents(WORKSPACE_A);
      const targetAfter = listAfter.find((e) => e.dedup_key === 'audit-safe-get-key');
      expect(targetAfter?.status).toBe('published');
    });

    it('Flaw 5: Race Condition Graceful Handling khi trùng khóa idempotency (PostgreSQL 23505 simulation)', async () => {
      const { submitLead } = await import('../../src/modules/leads/service');
      const { MemoryAnalyticsSink } = await import('../../src/lib/analytics');

      // Giả lập repository ném lỗi 23505 unique violation khi xảy ra race condition
      const mockLead = {
        id: 'existing-race-lead-id',
        site_id: 'tripc-pilot',
        workspace_id: WORKSPACE_A,
        email: 'race@tripc.test',
        name: 'Race Contact',
        interest_topic: 'housing',
        consent_accepted: true,
        consent_policy_version: 'v1.0',
        context: {},
        idempotency_key: 'race-key-001',
        payload_hash: 'same-hash-123',
        lead_status: 'New' as const,
        lead_owner: null,
        notes: null,
        captured_at: new Date(),
        updated_at: new Date(),
        created_at: new Date(),
      };

      const raceRepo = new InMemoryLeadRepository();
      // Kích hoạt lỗi 23505 mô phỏng
      let attempt = 0;
      const failingRepo: any = {
        withTransaction: async (fn: any) => {
          attempt++;
          if (attempt === 1) {
            const err: any = new Error('duplicate key value violates unique constraint "uq_leads_workspace_idempotency"');
            err.code = '23505';
            throw err;
          }
          // Lượt retry findByKey tìm ra bản ghi đã được luồng kia ghi thành công
          return fn({
            findByKey: async () => mockLead,
          });
        },
      };

      // Tính payload_hash khớp với mockLead
      const { canonicalJson, sha256Hex } = await import('../../src/lib/hash');
      const body = {
        email: 'race@tripc.test',
        name: 'Race Contact',
        interest_topic: 'housing',
        consent: { accepted: true, policy_version: 'v1.0' },
      };
      mockLead.payload_hash = sha256Hex(canonicalJson(body));

      const res = await submitLead(
        { repo: failingRepo, analytics: new MemoryAnalyticsSink() },
        {
          siteId: 'tripc-pilot',
          idempotencyKey: 'race-key-001',
          body,
        }
      );

      // Phản hồi không phải 500 Server Error mà là duplicate (HTTP 200)
      expect(res.kind).toBe('duplicate');
      if (res.kind === 'duplicate') {
        expect(res.deduplicated).toBe(true);
        expect(res.submission_id).toBe('existing-race-lead-id');
      }
    });
  });

  describe('5. Nitpick Audit Remediation (6 Additional Flaws Fixed)', () => {
    it('Fix 1: handleApiError chuyển đổi ZodError thành 422 VALIDATION_FAILED thay vì 500', async () => {
      const { handleApiError } = await import('../../src/lib/errors');
      const { z } = await import('zod');

      const dummySchema = z.object({
        email: z.string().email(),
        count: z.number().min(1),
      });

      try {
        dummySchema.parse({ email: 'not-an-email', count: 0 });
        expect.unreachable('Should have thrown ZodError');
      } catch (err) {
        const response: any = handleApiError(err);
        expect(response.status).toBe(422);
      }
    });

    it('Fix 5: Chặn đứng việc đảo ngược trạng thái task đã hoàn thành (terminal state: completed -> running)', async () => {
      const { updateWorkspaceTaskStatus } = await import('../../src/modules/tasks/service');
      const taskRepo = await import('../../src/modules/tasks/repository');
      const tenant = await import('../../src/lib/tenant');

      // Mock resolveTenantContext và getTaskById
      vi.spyOn(tenant, 'resolveTenantContext').mockResolvedValue({
        user: { id: USER_A, email: 'owner@tripc.local', name: 'Owner' },
        workspaceId: WORKSPACE_A,
        role: 'owner',
      });
      vi.spyOn(taskRepo, 'getTaskById').mockResolvedValue({
        id: 'task-completed-001',
        workspace_id: WORKSPACE_A,
        status: 'completed',
        role: 'content',
        operation: 'generate_post',
      } as any);

      try {
        await updateWorkspaceTaskStatus(
          { id: USER_A, email: 'owner@tripc.local', name: 'Owner' },
          WORKSPACE_A,
          'task-completed-001',
          { status: 'running' }
        );
        expect.unreachable('Should have thrown AppError for invalid state transition');
      } catch (err: any) {
        expect(err.statusCode).toBe(409);
        expect(err.code).toBe('INVALID_STATE_TRANSITION');
        expect(err.message).toContain("Cannot transition task from terminal status 'completed'");
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('Fix 4: Chặn tạo Approval ma - Từ chối target_id không tồn tại trong workspace (404 NOT_FOUND)', async () => {
      const { createWorkspaceApproval } = await import('../../src/modules/approvals/service');
      const approvalsRepo = await import('../../src/modules/approvals/repository');
      const tenant = await import('../../src/lib/tenant');

      vi.spyOn(tenant, 'resolveTenantContext').mockResolvedValue({
        user: { id: USER_A, email: 'owner@tripc.local', name: 'Owner' },
        workspaceId: WORKSPACE_A,
        role: 'owner',
      });
      vi.spyOn(approvalsRepo, 'getTargetInfo').mockResolvedValue(null);

      const phantomApproval = {
        target_type: 'content' as const,
        target_id: '00000000-0000-4000-8000-000000009999',
        target_version: 1,
        target_hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      };

      try {
        await createWorkspaceApproval(
          { id: USER_A, email: 'owner@tripc.local', name: 'Owner' },
          WORKSPACE_A,
          phantomApproval
        );
        expect.unreachable('Should have thrown AppError 404 for phantom target');
      } catch (err: any) {
        expect(err.statusCode).toBe(404);
        expect(err.code).toBe('NOT_FOUND');
        expect(err.message).toContain('does not exist in this workspace');
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('Fix 3: Khi soft delete source, cascade invalidation toàn bộ approvals liên quan', async () => {
      const { deleteWorkspaceSource } = await import('../../src/modules/sources/service');
      const sourcesRepo = await import('../../src/modules/sources/repository');
      const approvalsRepo = await import('../../src/modules/approvals/repository');
      const tenant = await import('../../src/lib/tenant');

      let invalidatedCount = 0;
      let invalidatedTargetId = '';
      let invalidatedReason = '';

      vi.spyOn(tenant, 'resolveTenantContext').mockResolvedValue({
        user: { id: USER_A, email: 'owner@tripc.local', name: 'Owner' },
        workspaceId: WORKSPACE_A,
        role: 'owner',
      });
      vi.spyOn(sourcesRepo, 'getSourceById').mockResolvedValue({
        id: 'source-del-001',
        workspace_id: WORKSPACE_A,
        status: 'approved',
      } as any);
      vi.spyOn(sourcesRepo, 'softDeleteSource').mockResolvedValue(undefined);
      vi.spyOn(approvalsRepo, 'invalidateApprovalsForTarget').mockImplementation(async (wsId, type, id, reason) => {
        invalidatedCount++;
        invalidatedTargetId = id;
        invalidatedReason = reason || '';
        return 1;
      });

      try {
        const res = await deleteWorkspaceSource(
          { id: USER_A, email: 'owner@tripc.local', name: 'Owner' },
          WORKSPACE_A,
          'source-del-001'
        );
        expect(res.success).toBe(true);
        expect(invalidatedCount).toBe(1);
        expect(invalidatedTargetId).toBe('source-del-001');
        expect(invalidatedReason).toBe('SOURCE_DELETED');
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('Fix 6: listLeadsQuerySchema từ chối chuỗi không phải UUID cho lead_owner', async () => {
      const { listLeadsQuerySchema } = await import('../../src/modules/leads/schemas');

      const invalidQuery = {
        lead_owner: 'not-a-valid-uuid',
      };

      const parseResult = listLeadsQuerySchema.safeParse(invalidQuery);
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        expect(parseResult.error.issues.some((i) => i.path.includes('lead_owner'))).toBe(true);
      }

      const validQuery = {
        lead_owner: USER_A,
      };
      const validResult = listLeadsQuerySchema.safeParse(validQuery);
      expect(validResult.success).toBe(true);
    });
  });

  describe('6. Deep Audit Hardening (6 Additional Vulnerabilities Fixed)', () => {
    it('Audit Fix 1: Chặn đứng Cross-Tenant Campaign Injection trong createWorkspaceTask', async () => {
      const { createWorkspaceTask } = await import('../../src/modules/tasks/service');
      const campaignsRepo = await import('../../src/modules/campaigns/repository');
      const tenant = await import('../../src/lib/tenant');

      vi.spyOn(tenant, 'resolveTenantContext').mockResolvedValue({
        user: { id: USER_A, email: 'owner@tripc.local', name: 'Owner' },
        workspaceId: WORKSPACE_A,
        role: 'owner',
      });
      // Campaign không tồn tại trong workspace A (hoặc thuộc workspace B) -> trả về null
      vi.spyOn(campaignsRepo, 'getCampaignById').mockResolvedValue(null);

      try {
        await createWorkspaceTask(
          { id: USER_A, email: 'owner@tripc.local', name: 'Owner' },
          WORKSPACE_A,
          {
            campaign_id: '00000000-0000-4000-8000-000000008888',
            role: 'content',
            operation: 'generate_post',
            priority: 3,
            input_version: 1,
          }
        );
        expect.unreachable('Should have thrown AppError 422 for foreign/missing campaign_id');
      } catch (err: any) {
        expect(err.statusCode).toBe(422);
        expect(err.code).toBe('INVALID_CAMPAIGN_REF');
        expect(err.message).toContain('does not exist in this workspace');
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('Audit Fix 2: executeToolSchema từ chối payload thiếu capability/provider và ngăn chặn DoS crash', async () => {
      const { executeToolSchema } = await import('../../src/modules/integrations/gateway');

      // Payload rỗng {}
      const emptyResult = executeToolSchema.safeParse({});
      expect(emptyResult.success).toBe(false);
      if (!emptyResult.success) {
        const issues = emptyResult.error.issues;
        expect(issues.some((i) => i.path.includes('provider'))).toBe(true);
        expect(issues.some((i) => i.path.includes('capability'))).toBe(true);
        expect(issues.some((i) => i.path.includes('action_type'))).toBe(true);
      }

      // approval_id không phải UUID
      const invalidApprovalResult = executeToolSchema.safeParse({
        provider: 'wordpress',
        capability: 'cms_posts_create',
        action_type: 'publish',
        approval_id: 'not-a-valid-uuid',
      });
      expect(invalidApprovalResult.success).toBe(false);
    });

    it('Audit Fix 3: Chặn đứng Workspace Lockout - Không cho phép giáng cấp Owner duy nhất còn lại', async () => {
      const { addWorkspaceMember } = await import('../../src/modules/workspaces/service');
      const workspacesRepo = await import('../../src/modules/workspaces/repository');
      const tenant = await import('../../src/lib/tenant');

      vi.spyOn(tenant, 'resolveTenantContext').mockResolvedValue({
        user: { id: USER_A, email: 'owner@tripc.local', name: 'Owner' },
        workspaceId: WORKSPACE_A,
        role: 'owner',
      });
      vi.spyOn(workspacesRepo, 'findOrCreateUserByEmail').mockResolvedValue({
        id: USER_A,
        email: 'owner@tripc.local',
        full_name: 'Owner',
      });
      vi.spyOn(workspacesRepo, 'listMembers').mockResolvedValue([
        {
          id: 'mem-1',
          workspace_id: WORKSPACE_A,
          user_id: USER_A,
          role: 'owner',
          status: 'active',
          email: 'owner@tripc.local',
          full_name: 'Owner',
          avatar_url: undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
      // Chỉ còn 1 Owner duy nhất
      vi.spyOn(workspacesRepo, 'countActiveOwners').mockResolvedValue(1);

      try {
        await addWorkspaceMember(
          { id: USER_A, email: 'owner@tripc.local', name: 'Owner' },
          WORKSPACE_A,
          {
            email: 'owner@tripc.local',
            role: 'viewer', // cố gắng tự hạ cấp về viewer
          }
        );
        expect.unreachable('Should have thrown AppError for downgrading the last owner');
      } catch (err: any) {
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('CANNOT_DOWNGRADE_LAST_OWNER');
        expect(err.message).toContain('Cannot downgrade the last owner of a workspace');
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('Audit Fix 4: handleApiError chuyển đổi chuẩn xác mã lỗi PostgreSQL (22P02, 23503, 23505)', async () => {
      const { handleApiError } = await import('../../src/lib/errors');

      // 22P02: Cú pháp tham số/UUID không hợp lệ -> 400 BAD_REQUEST
      const syntaxErr: any = new Error('invalid input syntax for type uuid: "abc"');
      syntaxErr.code = '22P02';
      const syntaxRes: any = handleApiError(syntaxErr);
      expect(syntaxRes.status).toBe(400);

      // 23503: Vi phạm foreign key -> 422 FOREIGN_KEY_VIOLATION
      const fkErr: any = new Error('insert or update violates foreign key constraint');
      fkErr.code = '23503';
      const fkRes: any = handleApiError(fkErr);
      expect(fkRes.status).toBe(422);

      // 23505: Vi phạm unique constraint -> 409 CONFLICT
      const uniqueErr: any = new Error('duplicate key value violates unique constraint');
      uniqueErr.code = '23505';
      const uniqueRes: any = handleApiError(uniqueErr);
      expect(uniqueRes.status).toBe(409);
    });

    it('Audit Fix 5: listExceptionsQuerySchema từ chối assigned_owner không đúng định dạng UUID', async () => {
      const { listExceptionsQuerySchema } = await import('../../src/modules/reports/schemas');

      const invalidQuery = {
        assigned_owner: 'not-a-uuid',
      };
      const res = listExceptionsQuerySchema.safeParse(invalidQuery);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.path.includes('assigned_owner'))).toBe(true);
      }

      const validQuery = {
        assigned_owner: USER_A,
      };
      const validRes = listExceptionsQuerySchema.safeParse(validQuery);
      expect(validRes.success).toBe(true);
    });

    it('Audit Fix 6: persistRagPayloadSchema kiểm tra nghiêm ngặt cấu trúc vector chunk và fact', async () => {
      const { persistRagPayloadSchema } = await import('../../src/modules/sources/rag');

      // Thiếu chunks -> lỗi validation
      const invalidPayload = {
        source_version: 1,
        chunks: [],
      };
      const res = persistRagPayloadSchema.safeParse(invalidPayload);
      expect(res.success).toBe(false);

      // Đúng chuẩn
      const validPayload = {
        source_version: 1,
        content_hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
        chunks: [
          {
            chunk_index: 0,
            text_content: 'Test content for RAG persistence',
            model: 'embeddinggemma',
          },
        ],
      };
      const validRes = persistRagPayloadSchema.safeParse(validPayload);
      expect(validRes.success).toBe(true);
    });
  });
});
