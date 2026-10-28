"""Gateway Recheck Engine (CM-26 / TC-07) - Python Service Layer.

Cung cấp cơ chế xác thực toàn vẹn độc lập:
1. Hash lock (SHA-256) chống sửa lén dù chỉ 1 ký tự sau duyệt.
2. Target version consistency.
3. Thu hồi approval và hủy lịch đăng nếu bài SEO đổi version.
4. RBAC: Chỉ Owner và Editor của workspace được duyệt.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Callable


@dataclass
class GatewayRecheckRequest:
    workspace_id: str
    post_id: str
    channel: str
    approval_id: str
    approval_status: str  # "pending", "approved", "rejected", "revoked"
    expected_version: int
    current_version: int
    expected_hash: str
    current_content: dict[str, Any] | str
    expected_parent_version: int
    current_parent_version: int
    actor_role: str | None = None


@dataclass
class GatewayRecheckResponse:
    authorized: boolean = False
    action: str = "DENY"  # "ALLOW_PUBLISH" | "DENY" | "REVOKE_AND_CANCEL"
    error_code: str | None = None
    reason: str = ""
    calculated_hash: str = ""
    revocation_triggered: bool = False
    cancelled_publish: bool = False


def canonical_json_dumps(obj: Any) -> str:
    """Chuẩn hóa JSON deterministic (sắp xếp keys, không khoảng trắng dư) để băm SHA-256."""
    return json.dumps(obj, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def compute_content_sha256(content: dict[str, Any] | str) -> str:
    """Tính mã băm SHA-256 (64 hex lowercase). Bỏ qua trường content_hash nếu có."""
    if isinstance(content, str):
        raw_bytes = content.encode("utf-8")
    else:
        clean_content = {k: v for k, v in content.items() if k != "content_hash"}
        raw_bytes = canonical_json_dumps(clean_content).encode("utf-8")
    return hashlib.sha256(raw_bytes).hexdigest().lower()


def is_authorized_reviewer(role: str | None) -> bool:
    """Kiểm tra RBAC: chỉ Owner hoặc Editor mới có quyền phê duyệt."""
    if not role:
        return False
    normalized = role.strip().lower()
    return normalized in {"owner", "editor"}


def recheck_before_outbox(
    req: GatewayRecheckRequest,
    on_revoke_approval: Callable[[str, str], None] | None = None,
    on_cancel_schedule: Callable[[str, str], None] | None = None,
) -> GatewayRecheckResponse:
    """Kiểm tra toàn diện trước khi đẩy bài vào Outbox / xuất bản social."""
    calculated_hash = compute_content_sha256(req.current_content)

    # 1. Kiểm tra trạng thái approval
    if req.approval_status != "approved":
        return GatewayRecheckResponse(
            authorized=False,
            action="DENY",
            error_code="APPROVAL_NOT_GRANTED",
            reason=f"APPROVAL_NOT_GRANTED: Post status is currently '{req.approval_status}', must be 'approved' to publish.",
            calculated_hash=calculated_hash,
        )

    # 2. Kiểm tra Content Hash (Tamper detection - TC-07)
    if calculated_hash != req.expected_hash.lower():
        return GatewayRecheckResponse(
            authorized=False,
            action="DENY",
            error_code="CONTENT_HASH_MISMATCH",
            reason=f"CONTENT_HASH_MISMATCH: Tampered content detected! Stored hash was '{req.expected_hash}', but actual content hash is '{calculated_hash}'.",
            calculated_hash=calculated_hash,
        )

    # 3. Kiểm tra Version của bài đăng
    if req.current_version != req.expected_version:
        return GatewayRecheckResponse(
            authorized=False,
            action="DENY",
            error_code="VERSION_MISMATCH",
            reason=f"VERSION_MISMATCH: Current post version {req.current_version} does not match approved target_version {req.expected_version}.",
            calculated_hash=calculated_hash,
        )

    # 4. Kiểm tra Version bài SEO nguồn (Parent SEO consistency)
    if req.current_parent_version != req.expected_parent_version:
        revoke_reason = (
            f"STALE_PARENT_SEO_VERSION: Parent SEO article upgraded from v{req.expected_parent_version} "
            f"to v{req.current_parent_version} after approval. Approval revoked and publishing schedule cancelled."
        )

        if on_revoke_approval:
            on_revoke_approval(req.approval_id, revoke_reason)
        if on_cancel_schedule:
            on_cancel_schedule(req.post_id, revoke_reason)

        return GatewayRecheckResponse(
            authorized=False,
            action="REVOKE_AND_CANCEL",
            error_code="PARENT_VERSION_CHANGED",
            reason=revoke_reason,
            calculated_hash=calculated_hash,
            revocation_triggered=True,
            cancelled_publish=True,
        )

    # 5. Tất cả chốt chặn đều an toàn
    return GatewayRecheckResponse(
        authorized=True,
        action="ALLOW_PUBLISH",
        reason="AUTHORIZED: Passed hash lock, version consistency, parent SEO version and approval status.",
        calculated_hash=calculated_hash,
    )
