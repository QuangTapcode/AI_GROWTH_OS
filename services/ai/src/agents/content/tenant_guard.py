"""TenantGuard for Multi-Tenant Isolation (CM-06).

Enforces strict tenant isolation across Content Marketing Agent operations:
- Prevents cross-workspace data access for articles and media assets (TC-08).
- Raises HTTP 403 Forbidden on foreign workspace access.
- Zero Information Leakage: Never discloses the existence, workspace_id, or
  attributes of foreign tenant resources to an unauthorized caller.
"""

from __future__ import annotations

from typing import Any, Mapping, Sequence
from uuid import UUID

from ...app.errors import APIError


class TenantAccessForbiddenError(APIError):
    """Lỗi từ chối truy cập tài nguyên đa tenant (HTTP 403).
    
    Thông điệp lỗi được chuẩn hóa để tuyệt đối không làm lộ sự tồn tại
    hay thông tin định danh của tài nguyên thuộc workspace khác.
    """

    def __init__(
        self,
        message: str = "Tài nguyên không tồn tại hoặc bạn không có quyền truy cập.",
        code: str = "FORBIDDEN_TENANT_ACCESS",
    ) -> None:
        super().__init__(
            status_code=403,
            code=code,
            message=message,
            details=None,  # Zero-leakage: cấm trả về chi tiết chứa tenant ngoại lai
        )


def normalize_workspace_id(workspace_id: UUID | str) -> str:
    """Chuẩn hóa UUID hoặc chuỗi định danh workspace sang dạng chuỗi chữ thường."""
    if isinstance(workspace_id, UUID):
        return str(workspace_id).lower()
    return str(workspace_id).strip().lower()


def extract_resource_workspace_id(resource: Any) -> str | None:
    """Trích xuất an toàn workspace_id từ đối tượng, Pydantic model hoặc từ điển."""
    if resource is None:
        return None
    if isinstance(resource, Mapping):
        val = resource.get("workspace_id")
        return normalize_workspace_id(val) if val is not None else None
    if hasattr(resource, "workspace_id"):
        val = getattr(resource, "workspace_id")
        return normalize_workspace_id(val) if val is not None else None
    return None


class TenantGuard:
    """Bộ rào chắn bảo vệ biên giới dữ liệu đa tenant (Zero-Leakage Guard)."""

    @staticmethod
    def verify_workspace_access(
        current_workspace_id: UUID | str,
        resource_workspace_id: UUID | str | None,
    ) -> None:
        """Kiểm tra quyền truy cập giữa workspace hiện tại và workspace của tài nguyên.
        
        Ném TenantAccessForbiddenError (HTTP 403) nếu không khớp, không để lộ dữ liệu ngoại lai.
        """
        if resource_workspace_id is None:
            raise TenantAccessForbiddenError()

        cur_norm = normalize_workspace_id(current_workspace_id)
        res_norm = normalize_workspace_id(resource_workspace_id)

        if cur_norm != res_norm:
            raise TenantAccessForbiddenError()

    @classmethod
    def guard_article(
        cls,
        article: Any,
        current_workspace_id: UUID | str,
    ) -> Any:
        """Bảo vệ bài viết SEO/nội dung. Trả về bài viết nếu hợp lệ, ném 403 nếu sai tenant."""
        res_ws = extract_resource_workspace_id(article)
        cls.verify_workspace_access(current_workspace_id, res_ws)
        return article

    @classmethod
    def guard_asset(
        cls,
        asset: Any,
        current_workspace_id: UUID | str,
    ) -> Any:
        """Bảo vệ tài sản hình ảnh/media asset. Trả về asset nếu hợp lệ, ném 403 nếu sai tenant."""
        res_ws = extract_resource_workspace_id(asset)
        cls.verify_workspace_access(current_workspace_id, res_ws)
        return asset

    @classmethod
    def guard_asset_list(
        cls,
        assets: Sequence[Any],
        current_workspace_id: UUID | str,
    ) -> list[Any]:
        """Kiểm tra toàn bộ danh sách asset. Nếu có bất kỳ asset nào sai tenant -> ném 403 ngay."""
        validated: list[Any] = []
        for asset in assets:
            cls.guard_asset(asset, current_workspace_id)
            validated.append(asset)
        return validated

    @classmethod
    def filter_assets(
        cls,
        assets: Sequence[Any],
        current_workspace_id: UUID | str,
    ) -> list[Any]:
        """Lọc bỏ toàn bộ asset không thuộc workspace hiện tại để bảo đảm 0 rò rỉ đa tenant."""
        cur_norm = normalize_workspace_id(current_workspace_id)
        return [
            asset for asset in assets
            if extract_resource_workspace_id(asset) == cur_norm
        ]
