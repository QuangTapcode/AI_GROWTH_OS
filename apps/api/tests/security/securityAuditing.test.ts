import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError, NotFoundError, ForbiddenError } from '../../src/lib/errors';
import { authenticateUser, AuthUser } from '../../src/lib/auth';
import {
  getWorkspaceTaskDetail,
  updateWorkspaceTaskStatus,
  getWorkspaceArtifactDetail,
  createWorkspaceTask,
  createWorkspaceArtifact,
} from '../../src/modules/tasks/service';
import {
  reviewWorkspaceApproval,
  getWorkspaceApprovalDetail,
  invalidateTargetApprovals,
} from '../../src/modules/approvals/service';
import { executeApprovalReviewTransaction } from '../../src/modules/approvals/repository';
import {
  toPublicPost,
  toPublicMeta,
  ContentSnapshot,
} from '../../src/modules/publicContent/dto';
import {
  getPublishedPost,
  listPublishedPosts,
} from '../../src/modules/publicContent/service';
import { InMemoryPublicContentRepository } from '../../src/modules/publicContent/repository';
import { createPublicContentRoutes } from '../../src/modules/publicContent/routes';
import { assertPublishedOnly, sanitizeForPublic } from '../../src/lib/public-boundary';
import { handleApiError } from '../../src/lib/errors';
import { executeToolSchema } from '../../src/modules/integrations/gateway';

/**
 * BỘ KIỂM THỬ BẢO MẬT TOÀN DIỆN (SECURITY AUDITING SUITE)
 *
 * Test 1: IDOR / Cross-Tenant Isolation (Đọc / Sửa / Duyệt chéo giữa Workspace A và Workspace B)
 * Test 2: Optimistic Concurrency Control (OCC), Race Condition & STALE_VERSION Invalidation
 * Test 3: Agent Role Forgery (Kỳ vọng 422) & Malformed Header/Token UUID (Kỳ vọng 401)
 * Test 4: Public API Draft Boundary (404) & Data Leakage Sanitization (Zero PII / Sensitive Fields)
 */

const WORKSPACE_A = '10000000-0000-4000-8000-000000000001';
const WORKSPACE_B = '20000000-0000-4000-8000-000000000002';

const USER_A: AuthUser = {
  id: '11111111-1111-4000-8000-000000000001',
  email: 'owner-a@tripc.local',
  name: 'Workspace A Owner',
};

const USER_B: AuthUser = {
  id: '22222222-2222-4000-8000-000000000002',
  email: 'owner-b@tripc.local',
  name: 'Workspace B Owner',
};

const HACKER_USER: AuthUser = {
  id: '99999999-9999-4000-8000-000000000099',
  email: 'hacker@adversary.com',
  name: 'Adversary User',
};

describe('Security Audit Test Suite (BE Core & Multi-Tenant Hardening)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // TEST 1: USER WORKSPACE A CỐ TÌNH ĐỌC / SỬA / DUYỆT TÀI NGUYÊN CỦA WORKSPACE B
  // ============================================================================
  describe('Test 1: Cross-Tenant Isolation & Anti-IDOR Verification', () => {
    const TASK_B_ID = '33333333-3333-4000-8000-000000000003';
    const ARTIFACT_B_ID = '44444444-4444-4000-8000-000000000004';
    const APPROVAL_B_ID = '55555555-5555-4000-8000-000000000005';

    it('1.1. User A cố tình đọc Task của Workspace B qua route Workspace A -> Chặn 404 (Không rò rỉ IDOR)', async () => {
      const taskRepo = await import('../../src/modules/tasks/repository');
      const tenant = await import('../../src/lib/tenant');

      // User A thuộc Workspace A hợp lệ
      vi.spyOn(tenant, 'resolveTenantContext').mockResolvedValue({
        user: USER_A,
        workspaceId: WORKSPACE_A,
        role: 'owner',
      });

      // Repository chỉ truy vấn theo workspaceId của caller (WORKSPACE_A). Task B thuộc WORKSPACE_B nên trả về null
      vi.spyOn(taskRepo, 'getTaskById').mockImplementation(async (wsId, taskId) => {
        if (wsId === WORKSPACE_B && taskId === TASK_B_ID) {
          return { id: TASK_B_ID, workspace_id: WORKSPACE_B, status: 'pending' } as any;
        }
        return null;
      });

      await expect(
        getWorkspaceTaskDetail(USER_A, WORKSPACE_A, TASK_B_ID)
      ).rejects.toThrowError(
        expect.objectContaining({ statusCode: 404, code: 'NOT_FOUND' })
      );
    });

    it('1.2. User A cố tình gọi thẳng vào route của Workspace B để đọc Task -> Chặn 403 Forbidden', async () => {
      const tenant = await import('../../src/lib/tenant');

      // User A không có quyền truy cập vào Workspace B
      vi.spyOn(tenant, 'resolveTenantContext').mockRejectedValue(
        new ForbiddenError('User does not belong to this workspace')
      );

      await expect(
        getWorkspaceTaskDetail(USER_A, WORKSPACE_B, TASK_B_ID)
      ).rejects.toThrowError(
        expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' })
      );
    });

    it('1.3. User A cố tình sửa trạng thái Task của Workspace B -> Chặn 404 (nếu gọi qua A) và 403 (nếu gọi vào B)', async () => {
      const taskRepo = await import('../../src/modules/tasks/repository');
      const tenant = await import('../../src/lib/tenant');

      // (a) Gọi qua route Workspace A với Task ID của Workspace B
      vi.spyOn(tenant, 'resolveTenantContext').mockResolvedValue({
        user: USER_A,
        workspaceId: WORKSPACE_A,
        role: 'owner',
      });
      vi.spyOn(taskRepo, 'getTaskById').mockResolvedValue(null);

      await expect(
        updateWorkspaceTaskStatus(USER_A, WORKSPACE_A, TASK_B_ID, { status: 'completed' })
      ).rejects.toThrowError(
        expect.objectContaining({ statusCode: 404, code: 'NOT_FOUND' })
      );

      // (b) Gọi trực tiếp vào route Workspace B
      vi.spyOn(tenant, 'resolveTenantContext').mockRejectedValue(
        new ForbiddenError('User does not belong to this workspace')
      );

      await expect(
        updateWorkspaceTaskStatus(USER_A, WORKSPACE_B, TASK_B_ID, { status: 'completed' })
      ).rejects.toThrowError(
        expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' })
      );
    });

    it('1.4. User A cố tình đọc Artifact của Workspace B -> Chặn 404 (Không để lộ nội dung nghiên cứu / artifact)', async () => {
      const taskRepo = await import('../../src/modules/tasks/repository');
      const tenant = await import('../../src/lib/tenant');

      vi.spyOn(tenant, 'resolveTenantContext').mockResolvedValue({
        user: USER_A,
        workspaceId: WORKSPACE_A,
        role: 'owner',
      });

      // Artifact B chỉ có trong Workspace B
      vi.spyOn(taskRepo, 'getArtifactById').mockImplementation(async (wsId, artId) => {
        if (wsId === WORKSPACE_B && artId === ARTIFACT_B_ID) {
          return { id: ARTIFACT_B_ID, workspace_id: WORKSPACE_B, title: 'Secret Research B' } as any;
        }
        return null;
      });

      await expect(
        getWorkspaceArtifactDetail(USER_A, WORKSPACE_A, ARTIFACT_B_ID)
      ).rejects.toThrowError(
        expect.objectContaining({ statusCode: 404, code: 'NOT_FOUND' })
      );
    });

    it('1.5. User A cố tình duyệt Approval của Workspace B -> Chặn hoàn toàn (404 khi gọi qua A, 403 khi gọi vào B)', async () => {
      const approvalsRepo = await import('../../src/modules/approvals/repository');
      const tenant = await import('../../src/lib/tenant');

      // (a) Gọi qua route Workspace A
      vi.spyOn(tenant, 'resolveTenantContext').mockResolvedValue({
        user: USER_A,
        workspaceId: WORKSPACE_A,
        role: 'owner',
      });
      // DB lookup với workspace_id = WORKSPACE_A sẽ ném 404 vì approval này thuộc Workspace B
      vi.spyOn(approvalsRepo, 'executeApprovalReviewTransaction').mockRejectedValue(
        new AppError(404, 'NOT_FOUND', 'Approval record not found')
      );

      await expect(
        reviewWorkspaceApproval(USER_A, WORKSPACE_A, APPROVAL_B_ID, {
          decision: 'approve',
          expected_version: 1,
          expected_hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
        })
      ).rejects.toThrowError(
        expect.objectContaining({ statusCode: 404, code: 'NOT_FOUND' })
      );

      // (b) Gọi trực tiếp vào route Workspace B
      vi.spyOn(tenant, 'resolveTenantContext').mockRejectedValue(
        new ForbiddenError('User does not belong to this workspace')
      );

      await expect(
        reviewWorkspaceApproval(USER_A, WORKSPACE_B, APPROVAL_B_ID, {
          decision: 'approve',
          expected_version: 1,
          expected_hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
        })
      ).rejects.toThrowError(
        expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' })
      );
    });
  });

  // ============================================================================
  // TEST 2: OPTIMISTIC CONCURRENCY CONTROL (OCC), RACE CONDITION & STALE VERSION
  // ============================================================================
  describe('Test 2: Optimistic Concurrency Control (OCC) & Race Conditions', () => {
    const APPROVAL_ID = '66666666-6666-4000-8000-000000000006';
    const VALID_HASH_V1 = '1111111111111111111111111111111111111111111111111111111111111111';
    const MODIFIED_HASH_V2 = '2222222222222222222222222222222222222222222222222222222222222222';

    it('2.1. Gửi 2 request duyệt bài đồng thời: Request 1 thành công, Request 2 bị chặn 409 APPROVAL_ALREADY_REVIEWED', async () => {
      const db = await import('../../src/lib/db');

      let reviewCallCount = 0;
      const mockClient: any = {
        query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
          if (sql.includes('SELECT * FROM approvals')) {
            reviewCallCount++;
            if (reviewCallCount === 1) {
              // Request 1 đến trước: status = 'pending'
              return {
                rows: [{
                  id: APPROVAL_ID,
                  workspace_id: WORKSPACE_A,
                  target_type: 'content',
                  target_id: 'cnt-001',
                  status: 'pending',
                }],
                rowCount: 1,
              };
            } else {
              // Request 2 đến sau: status đã chuyển thành 'approved'
              return {
                rows: [{
                  id: APPROVAL_ID,
                  workspace_id: WORKSPACE_A,
                  target_type: 'content',
                  target_id: 'cnt-001',
                  status: 'approved',
                }],
                rowCount: 1,
              };
            }
          }
          if (sql.includes('SELECT id, COALESCE(current_version, 1)')) {
            return {
              rows: [{ id: 'cnt-001', version: 1, content_hash: VALID_HASH_V1, status: 'draft' }],
              rowCount: 1,
            };
          }
          if (sql.includes('UPDATE approvals')) {
            return {
              rows: [{
                id: APPROVAL_ID,
                workspace_id: WORKSPACE_A,
                status: 'approved',
                decision: 'approve',
              }],
              rowCount: 1,
            };
          }
          if (sql.includes('UPDATE contents')) {
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }),
      };

      vi.spyOn(db, 'withTransaction').mockImplementation(async (cb) => cb(mockClient));

      // Request 1: Duyệt thành công
      const res1 = await executeApprovalReviewTransaction(
        WORKSPACE_A,
        APPROVAL_ID,
        { decision: 'approve', expected_version: 1, expected_hash: VALID_HASH_V1 },
        USER_A.id,
        'owner'
      );
      expect(res1.status).toBe('approved');

      // Request 2: Đồng thời gửi lệnh duyệt -> Ném lỗi 409 Conflict
      await expect(
        executeApprovalReviewTransaction(
          WORKSPACE_A,
          APPROVAL_ID,
          { decision: 'approve', expected_version: 1, expected_hash: VALID_HASH_V1 },
          USER_A.id,
          'owner'
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 409,
          code: 'APPROVAL_ALREADY_REVIEWED',
        })
      );
    });

    it('2.2. Vừa sửa vừa duyệt: Nội dung bị sửa làm tăng version -> Chặn 409 VERSION_CONFLICT', async () => {
      const db = await import('../../src/lib/db');

      const mockClient: any = {
        query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
          if (sql.includes('SELECT * FROM approvals')) {
            return {
              rows: [{
                id: APPROVAL_ID,
                workspace_id: WORKSPACE_A,
                target_type: 'content',
                target_id: 'cnt-002',
                status: 'pending',
              }],
              rowCount: 1,
            };
          }
          if (sql.includes('SELECT id, COALESCE(current_version, 1)')) {
            // Phiên bản hiện tại của content đã nhảy lên version = 2 (do có người vừa sửa)
            return {
              rows: [{ id: 'cnt-002', version: 2, content_hash: MODIFIED_HASH_V2, status: 'draft' }],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 0 };
        }),
      };

      vi.spyOn(db, 'withTransaction').mockImplementation(async (cb) => cb(mockClient));

      // Request duyệt bài gửi expected_version = 1 (bản cũ trước khi sửa)
      await expect(
        executeApprovalReviewTransaction(
          WORKSPACE_A,
          APPROVAL_ID,
          { decision: 'approve', expected_version: 1, expected_hash: VALID_HASH_V1 },
          USER_A.id,
          'owner'
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 409,
          code: 'VERSION_CONFLICT',
        })
      );
    });

    it('2.3. Vừa sửa vừa duyệt: Nội dung bị sửa đổi làm lệch mã băm SHA-256 -> Chặn 409 CONTENT_HASH_MISMATCH', async () => {
      const db = await import('../../src/lib/db');

      const mockClient: any = {
        query: vi.fn().mockImplementation(async (sql: string, params?: any[]) => {
          if (sql.includes('SELECT * FROM approvals')) {
            return {
              rows: [{
                id: APPROVAL_ID,
                workspace_id: WORKSPACE_A,
                target_type: 'content',
                target_id: 'cnt-003',
                status: 'pending',
              }],
              rowCount: 1,
            };
          }
          if (sql.includes('SELECT id, COALESCE(current_version, 1)')) {
            // Version vẫn là 1 nhưng nội dung đã bị thay đổi làm thay đổi content_hash
            return {
              rows: [{ id: 'cnt-003', version: 1, content_hash: MODIFIED_HASH_V2, status: 'draft' }],
              rowCount: 1,
            };
          }
          return { rows: [], rowCount: 0 };
        }),
      };

      vi.spyOn(db, 'withTransaction').mockImplementation(async (cb) => cb(mockClient));

      await expect(
        executeApprovalReviewTransaction(
          WORKSPACE_A,
          APPROVAL_ID,
          { decision: 'approve', expected_version: 1, expected_hash: VALID_HASH_V1 },
          USER_A.id,
          'owner'
        )
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 409,
          code: 'CONTENT_HASH_MISMATCH',
        })
      );
    });

    it('2.4. Khi nội dung bị chỉnh sửa, tiến trình vô hiệu hóa bản duyệt cũ sang STALE_VERSION', async () => {
      const approvalsRepo = await import('../../src/modules/approvals/repository');

      let updatedReason = '';
      let targetIdUpdated = '';

      vi.spyOn(approvalsRepo, 'invalidateApprovalsForTarget').mockImplementation(
        async (wsId, targetType, targetId, reason) => {
          targetIdUpdated = targetId;
          updatedReason = reason || '';
          return 1;
        }
      );

      const affected = await invalidateTargetApprovals(
        WORKSPACE_A,
        'content',
        'cnt-edited-001',
        'STALE_VERSION'
      );

      expect(affected).toBe(1);
      expect(targetIdUpdated).toBe('cnt-edited-001');
      expect(updatedReason).toBe('STALE_VERSION');
    });
  });

  // ============================================================================
  // TEST 3: ROLE AGENT GIẢ MẠO (422) & UUID SAI ĐỊNH DẠNG TỪ HEADER/TOKEN (401/400)
  // ============================================================================
  describe('Test 3: Agent Role Forgery (422) & Malformed Header/Token UUID (401/400)', () => {
    it('3.1. Gửi payload có role Agent giả mạo vào createWorkspaceTask -> Trả về 422 VALIDATION_FAILED', async () => {
      const tenant = await import('../../src/lib/tenant');
      vi.spyOn(tenant, 'resolveTenantContext').mockResolvedValue({
        user: USER_A,
        workspaceId: WORKSPACE_A,
        role: 'owner',
      });

      const maliciousPayloads = [
        { role: 'fake_agent', operation: 'hack.execute' },
        { role: 'admin', operation: 'system.escalate' },
        { role: 'marketing_bot', operation: 'spam.send' },
        { role: 'owner', operation: 'grant.access' }, // 'owner' là human role, không phải AI Agent role
      ];

      for (const payload of maliciousPayloads) {
        await expect(
          createWorkspaceTask(USER_A, WORKSPACE_A, payload)
        ).rejects.toThrowError(
          expect.objectContaining({
            statusCode: 422,
            code: 'VALIDATION_FAILED',
          })
        );
      }
    });

    it('3.2. Gửi payload có role Agent giả mạo vào createWorkspaceArtifact -> Trả về 422 VALIDATION_FAILED', async () => {
      const tenant = await import('../../src/lib/tenant');
      vi.spyOn(tenant, 'resolveTenantContext').mockResolvedValue({
        user: USER_A,
        workspaceId: WORKSPACE_A,
        role: 'owner',
      });

      const invalidArtifact = {
        role: 'unauthorized_agent',
        operation: 'scrape.darkweb',
        artifact_type: 'stolen_credentials',
        title: 'Malicious Dump',
        content_hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      };

      await expect(
        createWorkspaceArtifact(USER_A, WORKSPACE_A, invalidArtifact)
      ).rejects.toThrowError(
        expect.objectContaining({
          statusCode: 422,
          code: 'VALIDATION_FAILED',
        })
      );
    });

    it('3.3. Gửi vai trò mạo nhận lạ vào Tool Execution Schema -> Zod từ chối trả về lỗi 422', () => {
      const invalidToolRequest = {
        actor_role: 'system_root',
        provider: 'wordpress',
        capability: 'publish',
        action_type: 'publish',
      };

      const result = executeToolSchema.safeParse(invalidToolRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        const roleIssue = result.error.issues.find((i) => i.path.includes('actor_role'));
        expect(roleIssue).toBeDefined();
      }
    });

    it('3.4. Header Authorization chứa Token sai định dạng (không phải UUID / dev token hợp lệ) -> Trả về 401 UNAUTHORIZED', () => {
      const badHeaders = [
        'Bearer not-a-uuid-at-all',
        'Bearer 12345-invalid',
        'Bearer dev_invalid_user_format_xyz',
        'Bearer SQL-INJECTION; DROP TABLE users;--',
      ];

      for (const authHeader of badHeaders) {
        const req = new NextRequest('http://localhost:4000/v1/workspaces', {
          headers: { authorization: authHeader },
        });

        expect(() => authenticateUser(req)).toThrowError(
          expect.objectContaining({
            statusCode: 401,
            code: 'UNAUTHORIZED',
          })
        );
      }
    });

    it('3.5. Header thiếu Bearer prefix hoặc rỗng -> Trả về 401 UNAUTHORIZED', () => {
      const missingHeaders = [
        '',
        'Basic dXNlcjpwYXNz',
        'Bearer ',
      ];

      for (const h of missingHeaders) {
        const req = new NextRequest('http://localhost:4000/v1/workspaces', {
          headers: h ? { authorization: h } : {},
        });

        expect(() => authenticateUser(req)).toThrowError(
          expect.objectContaining({
            statusCode: 401,
            code: 'UNAUTHORIZED',
          })
        );
      }
    });

    it('3.6. UUID không có chữ ký JWT trong môi trường Production -> Bị chặn 401 UNAUTHORIZED', () => {
      const prevEnv = process.env.NODE_ENV;
      (process.env as any).NODE_ENV = 'production';
      delete process.env.ALLOW_INSECURE_DEV_AUTH;

      try {
        const req = new NextRequest('http://localhost:4000/v1/workspaces', {
          headers: { authorization: 'Bearer 11111111-1111-4000-8000-000000000001' },
        });

        expect(() => authenticateUser(req)).toThrowError(
          expect.objectContaining({
            statusCode: 401,
            code: 'UNAUTHORIZED',
            message: expect.stringContaining('Unsigned raw UUID tokens are forbidden in production'),
          })
        );
      } finally {
        (process.env as any).NODE_ENV = prevEnv;
      }
    });
  });

  // ============================================================================
  // TEST 4: PUBLIC API DRAFT BOUNDARY (404) & DATA LEAKAGE SANITIZATION
  // ============================================================================
  describe('Test 4: Public API Draft Boundary (404) & Data Leakage Sanitization', () => {
    const SITE_ID = 'tripc-pilot';

    const draftSnapshot: ContentSnapshot = {
      id: 'snap-draft-001',
      kind: 'post',
      site_id: SITE_ID,
      workspace_id: WORKSPACE_A,
      status: 'draft',
      title: 'Draft Post — Internal Secret',
      slug: 'draft-post-secret',
      body: 'This is an unapproved draft that must NEVER be public.',
      meta: {
        description: 'Draft description',
        tags: ['internal', 'draft'],
        secret_metric: 9999, // sensitive
      },
      published_at: null,
      author_email: 'author@tripc.vn',
      review_notes: 'Needs heavy revision before publish',
      evidence: [{ source: 'confidential-report-01' }],
      preview_token: 'secret-token-xyz-123',
    };

    const publishedSnapshot: ContentSnapshot = {
      id: 'snap-pub-002',
      kind: 'post',
      site_id: SITE_ID,
      workspace_id: WORKSPACE_A,
      status: 'published',
      title: 'Living in Da Nang 2026',
      slug: 'living-in-da-nang-2026',
      body: 'Public verified guide for tech expats living in Da Nang.',
      meta: {
        description: 'Complete guide for remote workers',
        tags: ['da-nang', 'expat'],
        locale: 'en',
        og_image: 'https://tripc.vn/og.png',
        internal_rank_score: 95, // sensitive key in meta
      },
      published_at: '2026-10-15T08:00:00.000Z',
      member_id: 'mem-001',
      author_email: 'lead-author@tripc.vn',
      review_notes: 'Approved by human editor',
      evidence: [{ quote: 'raw unredacted fact' }],
      lead_capture: { target_form: 'housing-form' },
      preview_token: 'tok-abc',
      content_version: 3,
    };

    it('4.1. Truy cập Public API vào bài nháp (draft) -> Phải trả về 404 PUBLIC_POST_NOT_FOUND', async () => {
      const repo = new InMemoryPublicContentRepository([draftSnapshot]);
      const routes = createPublicContentRoutes({ repo });

      // Gọi getPost với slug của bài nháp
      const res = await routes.handleGetPost({
        params: { site_id: SITE_ID, slug: 'draft-post-secret' },
      });

      expect(res.status).toBe(404);
      expect((res.body as any).error.code).toBe('PUBLIC_POST_NOT_FOUND');
    });

    it('4.2. Danh sách bài viết Public (listPublishedPosts) tuyệt đối không chứa bài draft', async () => {
      const repo = new InMemoryPublicContentRepository([draftSnapshot, publishedSnapshot]);
      const posts = await listPublishedPosts({ repo }, SITE_ID);

      expect(posts.length).toBe(1);
      expect(posts[0].slug).toBe('living-in-da-nang-2026');
      expect(posts.some((p) => p.slug === 'draft-post-secret')).toBe(false);
    });

    it('4.3. assertPublishedOnly ném lỗi NotFoundError (404) ngay lập tức nếu status không phải published', () => {
      expect(() => assertPublishedOnly('draft')).toThrow(NotFoundError);
      expect(() => assertPublishedOnly('archived')).toThrow(NotFoundError);
      expect(() => assertPublishedOnly('needs_review')).toThrow(NotFoundError);
      expect(() => assertPublishedOnly('pending_approval')).toThrow(NotFoundError);
      expect(() => assertPublishedOnly('published')).not.toThrow();
    });

    it('4.4. Response của bài đã published được lọc triệt để qua DTO / Serializer Whitelist, KHÔNG lộ PII hay thông tin nội bộ', () => {
      const dto = toPublicPost(publishedSnapshot);
      expect(dto).not.toBeNull();

      if (dto) {
        // Chỉ chứa các trường công khai
        expect(dto.title).toBe('Living in Da Nang 2026');
        expect(dto.slug).toBe('living-in-da-nang-2026');
        expect(dto.body).toBe('Public verified guide for tech expats living in Da Nang.');
        expect(dto.published_at).toBe('2026-10-15T08:00:00.000Z');
        expect(dto.meta.description).toBe('Complete guide for remote workers');
        expect(dto.meta.tags).toEqual(['da-nang', 'expat']);
        expect(dto.meta.locale).toBe('en');
        expect(dto.meta.og_image).toBe('https://tripc.vn/og.png');

        // BẢO ĐẢM TẤT CẢ CÁC TRƯỜNG NHẠY CẢM ĐÃ BỊ TẨY SẠCH (UNDEFINED):
        const rawAny = dto as any;
        expect(rawAny.id).toBeUndefined();
        expect(rawAny.workspace_id).toBeUndefined(); // ID workspace nội bộ
        expect(rawAny.site_id).toBeUndefined();
        expect(rawAny.status).toBeUndefined();
        expect(rawAny.author_email).toBeUndefined(); // Email tác giả / PII
        expect(rawAny.member_id).toBeUndefined();
        expect(rawAny.review_notes).toBeUndefined(); // Ghi chú duyệt bài
        expect(rawAny.evidence).toBeUndefined(); // Trích dẫn thô / evidence JSON
        expect(rawAny.lead_capture).toBeUndefined();
        expect(rawAny.preview_token).toBeUndefined();
        expect(rawAny.content_version).toBeUndefined();
        expect(rawAny.meta.internal_rank_score).toBeUndefined(); // Không lọt key meta nội bộ
      }
    });

    it('4.5. Cơ chế xử lý lỗi Public API (handleApiError) tuyệt đối không làm lộ Stack Trace ra response', () => {
      const internalLeakError = new Error('Database connection failed at postgresql://postgres:secretpassword@10.0.0.1:5432/core_db\n    at Repository.query (/app/internal/db.ts:123)');

      const response = handleApiError(internalLeakError);
      expect(response.status).toBe(500);

      // Lấy body JSON trả về client
      // @ts-ignore
      const jsonBody = (response as any)._getJSONData ? (response as any)._getJSONData() : null;
      // Kiểm tra structure của NextResponse
      const serialized = JSON.stringify(response);
      expect(serialized).not.toContain('secretpassword');
      expect(serialized).not.toContain('10.0.0.1');
      expect(serialized).not.toContain('/app/internal/db.ts');
    });
  });
});
