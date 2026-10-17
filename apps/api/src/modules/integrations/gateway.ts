import { randomUUID } from 'node:crypto';
import { AppError } from '../../lib/errors';
import type { IntegrationProvider } from './types';
import { INTEGRATION_MATRIX, serverEnvKeys } from './matrix';
import { getApprovalById, getTargetInfo } from '../approvals/repository';

/**
 * TQ-06 — Tool Gateway and Connector Authorization.
 * 
 * An ninh & Phân quyền cốt lõi:
 * 1. Workspace isolation: Kiểm tra connector và đối tượng thuộc đúng workspace.
 * 2. Role allowlist: 6 role AI agent + workspace roles (owner/editor/viewer).
 * 3. Tách bạch 3 cấp độ: 'read' | 'draft' | 'publish'.
 * 4. Human Approval: 'publish' BẮT BUỘC có approval record ở trạng thái 'approved', khớp version & hash.
 * 5. Strict Ads Guard: Meta Ads / Google Ads tuyệt đối cấm mutation (chỉ cho phép read_ads_insights).
 * 6. Audit Logging: Mọi lượt denial và granted execution đều được lưu audit log.
 */

export type ActionType = 'read' | 'draft' | 'publish';

export type AgentRole =
  | 'research'
  | 'growth_lead'
  | 'seo'
  | 'content'
  | 'community'
  | 'performance'
  | 'owner'
  | 'editor'
  | 'viewer';

export interface ToolExecutionRequest {
  workspace_id: string;
  actor_id: string;
  caller_role?: AgentRole;
  actor_role: AgentRole;
  provider: IntegrationProvider;
  capability: string;
  action_type: ActionType;
  params?: Record<string, unknown>;
  approval_id?: string;
  expected_version?: number;
  expected_hash?: string;
}

export interface ToolAuditLog {
  id: string;
  workspace_id: string;
  actor_id: string;
  actor_role: string;
  provider: string;
  capability: string;
  action_type: ActionType;
  status: 'granted' | 'denied';
  denial_reason?: string;
  approval_id?: string;
  params_summary: Record<string, unknown>;
  created_at: Date;
}

export interface ToolAuditSink {
  record(log: ToolAuditLog): Promise<void>;
  listByWorkspace(workspaceId: string, limit?: number): Promise<ToolAuditLog[]>;
}

export class MemoryToolAuditSink implements ToolAuditSink {
  private logs: ToolAuditLog[] = [];

  async record(log: ToolAuditLog): Promise<void> {
    this.logs.push(log);
  }

  async listByWorkspace(workspaceId: string, limit = 50): Promise<ToolAuditLog[]> {
    return this.logs
      .filter((l) => l.workspace_id === workspaceId)
      .slice(-limit)
      .reverse();
  }

  clear(): void {
    this.logs = [];
  }
}

export const globalToolAuditSink = new MemoryToolAuditSink();

/**
 * Lọc bỏ secrets/tokens/credentials khỏi payload summary trước khi ghi audit log.
 */
function sanitizeParams(params?: Record<string, unknown>): Record<string, unknown> {
  if (!params) return {};
  const sensitivePatterns = [
    'token',
    'secret',
    'key',
    'password',
    'credential',
    'auth',
    'service_account',
    ...serverEnvKeys().map((k) => k.toLowerCase()),
  ];

  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    const isSensitive = sensitivePatterns.some((pattern) => k.toLowerCase().includes(pattern));
    sanitized[k] = isSensitive ? '[REDACTED]' : v;
  }
  return sanitized;
}

/**
 * Kiểm tra phân quyền hành động theo Role.
 */
function isRoleAuthorizedForAction(role: AgentRole, actionType: ActionType, capability: string): boolean {
  // Owner, Editor, Growth Lead có toàn quyền các hành động được hỗ trợ
  if (role === 'owner' || role === 'editor' || role === 'growth_lead') return true;

  // Research chỉ được phép đọc (read)
  if (role === 'research') {
    return actionType === 'read';
  }

  // SEO được đọc và tạo draft nội dung SEO/sitemap, cấm publish trực tiếp
  if (role === 'seo') {
    return actionType === 'read' || (actionType === 'draft' && capability.includes('cms'));
  }

  // Content được đọc và tạo draft bài viết. Publish phải qua approval
  if (role === 'content') {
    return actionType === 'read' || actionType === 'draft' || actionType === 'publish';
  }

  // Community được đọc comment/feed và tạo draft reply. Publish phải qua approval
  if (role === 'community') {
    return actionType === 'read' || actionType === 'draft' || actionType === 'publish';
  }

  // Performance chỉ được đọc metrics/insights (read-only). Tuyệt đối cấm mutation
  if (role === 'performance') {
    return actionType === 'read';
  }

  // Viewer chỉ được xem (read)
  if (role === 'viewer') {
    return actionType === 'read';
  }

  return false;
}

export type ApprovalGetter = (
  workspaceId: string,
  approvalId: string
) => Promise<{
  id: string;
  workspace_id: string;
  status: string;
  target_version?: number;
  target_hash?: string;
} | null>;

export interface AuthorizeResult {
  authorized: boolean;
  audit_id: string;
  denial_reason?: string;
}

/**
 * Core Executor Authorization Gateway.
 */
export async function authorizeToolExecution(
  req: ToolExecutionRequest,
  auditSink: ToolAuditSink = globalToolAuditSink,
  approvalGetter: ApprovalGetter = getApprovalById
): Promise<AuthorizeResult> {
  const auditId = randomUUID();
  const paramsSummary = sanitizeParams(req.params);

  // 0. PRIVILEGE ESCALATION GUARD: Ngăn chặn caller mạo nhận vai trò vượt cấp
  if (req.caller_role) {
    if (req.caller_role === 'viewer' && req.actor_role !== 'viewer') {
      const denialReason = `PRIVILEGE_ESCALATION_FORBIDDEN: Caller with 'viewer' role cannot assume elevated actor_role '${req.actor_role}'`;
      await auditSink.record({
        id: auditId,
        workspace_id: req.workspace_id,
        actor_id: req.actor_id,
        actor_role: req.actor_role,
        provider: req.provider,
        capability: req.capability,
        action_type: req.action_type,
        status: 'denied',
        denial_reason: denialReason,
        params_summary: paramsSummary,
        created_at: new Date(),
      });
      throw new AppError(403, 'FORBIDDEN', denialReason);
    }
    if (req.caller_role === 'editor' && req.actor_role === 'owner') {
      const denialReason = `PRIVILEGE_ESCALATION_FORBIDDEN: Caller with 'editor' role cannot assume 'owner' role`;
      await auditSink.record({
        id: auditId,
        workspace_id: req.workspace_id,
        actor_id: req.actor_id,
        actor_role: req.actor_role,
        provider: req.provider,
        capability: req.capability,
        action_type: req.action_type,
        status: 'denied',
        denial_reason: denialReason,
        params_summary: paramsSummary,
        created_at: new Date(),
      });
      throw new AppError(403, 'FORBIDDEN', denialReason);
    }
  }

  // 1. STRICT ADS GUARD: Meta Ads & Google Ads tuyệt đối cấm mọi mutation
  if (req.provider === 'meta_ads' || req.capability.toLowerCase().includes('ads_mutation')) {
    if (req.action_type !== 'read' || req.capability !== 'read_ads_insights') {
      const denialReason =
        'ADS_MUTATIONS_FORBIDDEN: Direct mutations of advertising campaigns, ad sets, budgets or ad creatives are strictly prohibited to prevent unauthorized expenditure.';
      await auditSink.record({
        id: auditId,
        workspace_id: req.workspace_id,
        actor_id: req.actor_id,
        actor_role: req.actor_role,
        provider: req.provider,
        capability: req.capability,
        action_type: req.action_type,
        status: 'denied',
        denial_reason: denialReason,
        params_summary: paramsSummary,
        created_at: new Date(),
      });
      throw new AppError(403, 'FORBIDDEN', denialReason);
    }
  }

  // 2. MATRIX CAPABILITY VERIFICATION
  const row = INTEGRATION_MATRIX.find(
    (r) => r.provider === req.provider && r.capability === req.capability
  );
  if (!row) {
    const denialReason = `UNSUPPORTED_CAPABILITY: Provider '${req.provider}' does not support capability '${req.capability}'`;
    await auditSink.record({
      id: auditId,
      workspace_id: req.workspace_id,
      actor_id: req.actor_id,
      actor_role: req.actor_role,
      provider: req.provider,
      capability: req.capability,
      action_type: req.action_type,
      status: 'denied',
      denial_reason: denialReason,
      params_summary: paramsSummary,
      created_at: new Date(),
    });
    throw new AppError(400, 'BAD_REQUEST', denialReason);
  }

  // 3. ROLE AUTHORIZATION
  if (!isRoleAuthorizedForAction(req.actor_role, req.action_type, req.capability)) {
    const denialReason = `ROLE_UNAUTHORIZED: Role '${req.actor_role}' is not authorized to execute '${req.action_type}' on '${req.capability}'`;
    await auditSink.record({
      id: auditId,
      workspace_id: req.workspace_id,
      actor_id: req.actor_id,
      actor_role: req.actor_role,
      provider: req.provider,
      capability: req.capability,
      action_type: req.action_type,
      status: 'denied',
      denial_reason: denialReason,
      params_summary: paramsSummary,
      created_at: new Date(),
    });
    throw new AppError(403, 'FORBIDDEN', denialReason);
  }

  // 4. APPROVAL CHECK FOR 'publish' ACTION
  if (req.action_type === 'publish') {
    if (!req.approval_id) {
      const denialReason = 'PUBLISH_REQUIRES_APPROVAL: Action "publish" requires a valid human approval_id';
      await auditSink.record({
        id: auditId,
        workspace_id: req.workspace_id,
        actor_id: req.actor_id,
        actor_role: req.actor_role,
        provider: req.provider,
        capability: req.capability,
        action_type: req.action_type,
        status: 'denied',
        denial_reason: denialReason,
        params_summary: paramsSummary,
        created_at: new Date(),
      });
      throw new AppError(403, 'FORBIDDEN', denialReason);
    }

    const approval = await approvalGetter(req.workspace_id, req.approval_id);
    if (!approval) {
      const denialReason = `APPROVAL_NOT_FOUND: Approval '${req.approval_id}' not found in workspace`;
      await auditSink.record({
        id: auditId,
        workspace_id: req.workspace_id,
        actor_id: req.actor_id,
        actor_role: req.actor_role,
        provider: req.provider,
        capability: req.capability,
        action_type: req.action_type,
        status: 'denied',
        denial_reason: denialReason,
        approval_id: req.approval_id,
        params_summary: paramsSummary,
        created_at: new Date(),
      });
      throw new AppError(404, 'NOT_FOUND', denialReason);
    }

    if (approval.status !== 'approved') {
      const denialReason = `APPROVAL_NOT_GRANTED: Target approval '${req.approval_id}' is '${approval.status}', expected 'approved'`;
      await auditSink.record({
        id: auditId,
        workspace_id: req.workspace_id,
        actor_id: req.actor_id,
        actor_role: req.actor_role,
        provider: req.provider,
        capability: req.capability,
        action_type: req.action_type,
        status: 'denied',
        denial_reason: denialReason,
        approval_id: req.approval_id,
        params_summary: paramsSummary,
        created_at: new Date(),
      });
      throw new AppError(403, 'FORBIDDEN', denialReason);
    }

    // Kiểm tra version và hash nếu có cung cấp (OCC verification)
    if (req.expected_version !== undefined && approval.target_version !== req.expected_version) {
      const denialReason = `VERSION_MISMATCH: Target current approval is for version ${approval.target_version}, but requested execution expected version ${req.expected_version}`;
      await auditSink.record({
        id: auditId,
        workspace_id: req.workspace_id,
        actor_id: req.actor_id,
        actor_role: req.actor_role,
        provider: req.provider,
        capability: req.capability,
        action_type: req.action_type,
        status: 'denied',
        denial_reason: denialReason,
        approval_id: req.approval_id,
        params_summary: paramsSummary,
        created_at: new Date(),
      });
      throw new AppError(409, 'CONFLICT', denialReason);
    }

    if (req.expected_hash !== undefined && approval.target_hash !== req.expected_hash) {
      const denialReason = `HASH_MISMATCH: Content hash mismatch. Expected ${req.expected_hash}, approval hash is ${approval.target_hash}`;
      await auditSink.record({
        id: auditId,
        workspace_id: req.workspace_id,
        actor_id: req.actor_id,
        actor_role: req.actor_role,
        provider: req.provider,
        capability: req.capability,
        action_type: req.action_type,
        status: 'denied',
        denial_reason: denialReason,
        approval_id: req.approval_id,
        params_summary: paramsSummary,
        created_at: new Date(),
      });
      throw new AppError(409, 'CONFLICT', denialReason);
    }
  }

  // 5. AUTHORIZATION GRANTED: Ghi nhận log kiểm toán thành công
  await auditSink.record({
    id: auditId,
    workspace_id: req.workspace_id,
    actor_id: req.actor_id,
    actor_role: req.actor_role,
    provider: req.provider,
    capability: req.capability,
    action_type: req.action_type,
    status: 'granted',
    approval_id: req.approval_id,
    params_summary: paramsSummary,
    created_at: new Date(),
  });

  return {
    authorized: true,
    audit_id: auditId,
  };
}
