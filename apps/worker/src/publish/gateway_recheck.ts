import { createHash } from 'node:crypto';

/**
 * Gateway Recheck Engine (CM-26 / TC-07)
 * Chốt chặn xác thực tính toàn vẹn (Integrity Verification) trước khi bài viết vào Outbox và xuất bản mạng xã hội:
 * 1. Khóa mã băm content_hash (SHA-256) chống sửa lén dù chỉ 1 ký tự sau khi duyệt.
 * 2. Khóa phiên bản target_version chống xung đột phiên bản.
 * 3. Kiểm tra parent_version của bài SEO nguồn: nếu bài SEO tăng version, lập tức thu hồi (revoke) approval và hủy lịch đăng.
 * 4. Kiểm tra RBAC: chỉ Owner và Editor mới có thẩm quyền duyệt.
 */

export type ApprovalDecision = 'approve' | 'reject' | 'revoke';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revoked';
export type RecheckAction = 'ALLOW_PUBLISH' | 'DENY' | 'REVOKE_AND_CANCEL';

export interface GatewayRecheckRequest {
  workspace_id: string;
  post_id: string;
  channel: string;
  approval_id: string;
  approval_status: ApprovalStatus;
  expected_version: number;
  current_version: number;
  expected_hash: string;
  current_content: string | Record<string, unknown>;
  expected_parent_version: number;
  current_parent_version: number;
  actor_role?: string;
}

export interface GatewayRecheckResponse {
  authorized: boolean;
  action: RecheckAction;
  error_code?: string;
  reason: string;
  calculated_hash: string;
  revocation_triggered?: boolean;
  cancelled_publish?: boolean;
}

/**
 * Chuẩn hóa JSON xác định (Deterministic Canonical JSON) để băm SHA-256 nhất quán
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map((item) => canonicalJsonStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + canonicalJsonStringify((obj as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

/**
 * Tính mã băm SHA-256 (64 ký tự hex)
 */
export function computeSha256Hex(content: string | Record<string, unknown>): string {
  if (typeof content === 'string') {
    return createHash('sha256').update(content, 'utf-8').digest('hex').toLowerCase();
  }
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(content)) {
    if (k !== 'content_hash') {
      clean[k] = v;
    }
  }
  const text = canonicalJsonStringify(clean);
  return createHash('sha256').update(text, 'utf-8').digest('hex').toLowerCase();
}

/**
 * Kiểm tra RBAC: Chỉ Owner hoặc Editor mới được duyệt
 */
export function isAuthorizedReviewer(role?: string | null): boolean {
  if (!role) return false;
  const normalized = role.toLowerCase().trim();
  return normalized === 'owner' || normalized === 'editor';
}

/**
 * Kiểm tra trước khi vào Outbox (Pre-Outbox Gateway Recheck)
 */
export async function recheckBeforeOutbox(
  req: GatewayRecheckRequest,
  onRevokeApproval?: (approvalId: string, reason: string) => Promise<void>,
  onCancelSchedule?: (postId: string, reason: string) => Promise<void>
): Promise<GatewayRecheckResponse> {
  const calculatedHash = computeSha256Hex(req.current_content);

  // 1. Kiểm tra trạng thái phê duyệt
  if (req.approval_status !== 'approved') {
    return {
      authorized: false,
      action: 'DENY',
      error_code: 'APPROVAL_NOT_GRANTED',
      reason: `APPROVAL_NOT_GRANTED: Post status is currently '${req.approval_status}', must be 'approved' to publish.`,
      calculated_hash: calculatedHash,
    };
  }

  // 2. Kiểm tra tính toàn vẹn mã băm (Tamper Detection - TC-07)
  if (calculatedHash !== req.expected_hash.toLowerCase()) {
    return {
      authorized: false,
      action: 'DENY',
      error_code: 'CONTENT_HASH_MISMATCH',
      reason: `CONTENT_HASH_MISMATCH: Tampered content detected! Stored hash was '${req.expected_hash}', but actual content hash is '${calculatedHash}'.`,
      calculated_hash: calculatedHash,
    };
  }

  // 3. Kiểm tra phiên bản bài viết (Optimistic Concurrency Control)
  if (req.current_version !== req.expected_version) {
    return {
      authorized: false,
      action: 'DENY',
      error_code: 'VERSION_MISMATCH',
      reason: `VERSION_MISMATCH: Current post version ${req.current_version} does not match approved target_version ${req.expected_version}.`,
      calculated_hash: calculatedHash,
    };
  }

  // 4. Kiểm tra phiên bản bài SEO nguồn (Parent SEO Article Consistency)
  if (req.current_parent_version !== req.expected_parent_version) {
    const revokeReason = `STALE_PARENT_SEO_VERSION: Parent SEO article version upgraded from v${req.expected_parent_version} to v${req.current_parent_version} after approval. Approval revoked and publishing cancelled.`;

    if (onRevokeApproval) {
      await onRevokeApproval(req.approval_id, revokeReason);
    }
    if (onCancelSchedule) {
      await onCancelSchedule(req.post_id, revokeReason);
    }

    return {
      authorized: false,
      action: 'REVOKE_AND_CANCEL',
      error_code: 'PARENT_VERSION_CHANGED',
      reason: revokeReason,
      calculated_hash: calculatedHash,
      revocation_triggered: true,
      cancelled_publish: true,
    };
  }

  // 5. Mọi chốt chặn đều an toàn: Cho phép đưa vào Outbox
  return {
    authorized: true,
    action: 'ALLOW_PUBLISH',
    reason: 'AUTHORIZED: Passed hash lock, version consistency, parent SEO version and approval status.',
    calculated_hash: calculatedHash,
  };
}
