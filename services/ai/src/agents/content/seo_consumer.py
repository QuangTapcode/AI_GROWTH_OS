"""SEO Article Consumer Adapter (CM-02).

Reads and parses SeoArticle models from SEO Worker outputs, ArtifactInputs,
or database/storage payloads, strictly scoped by workspace_id and article_id.
"""

from __future__ import annotations

from typing import Any, Mapping
from uuid import UUID

from pydantic import ValidationError

from ..contracts import ArtifactInput
from ..seo.schemas import SeoArticle


class SeoConsumerError(Exception):
    """Lỗi khi tiêu thụ bài viết SEO từ SEO Worker."""

    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.details = details or {}


def parse_seo_article(data: Mapping[str, Any] | SeoArticle) -> SeoArticle:
    """Parse an arbitrary payload or dict into a verified SeoArticle model."""
    if isinstance(data, SeoArticle):
        return data

    try:
        return SeoArticle.model_validate(data)
    except ValidationError as err:
        raise SeoConsumerError(
            code="INVALID_SEO_ARTICLE_SCHEMA",
            message=f"Payload không thể parse thành SeoArticle hợp lệ: {err}",
            details={"errors": err.errors()}
        ) from err


def read_seo_article_from_artifact_input(
    item: ArtifactInput | Mapping[str, Any],
    expected_workspace_id: UUID | str | None = None,
    expected_article_id: UUID | str | None = None,
) -> SeoArticle:
    """Đọc và xác thực SeoArticle từ ArtifactInput của AI pipeline runner.

    Ràng buộc nghiêm ngặt:
    - workspace_id của artifact và result phải trùng khớp với expected_workspace_id.
    - article_id phải trùng khớp nếu được chỉ định.
    """
    if isinstance(item, ArtifactInput):
        ref = item.artifact
        result = item.result
    elif isinstance(item, Mapping):
        ref = item.get("artifact")
        result = item.get("result", {})
    else:
        raise SeoConsumerError(
            code="INVALID_ARTIFACT_INPUT",
            message=f"Đầu vào phải là ArtifactInput hoặc Mapping, nhận được {type(item).__name__}."
        )

    # 1. Parse result sang SeoArticle
    article = parse_seo_article(result)

    # 2. Kiểm tra tenant scope
    if expected_workspace_id is not None:
        exp_ws = str(expected_workspace_id)
        art_ws = str(article.workspace_id)
        if art_ws != exp_ws:
            raise SeoConsumerError(
                code="TENANT_SCOPE_VIOLATION",
                message=f"Bài viết thuộc tenant '{art_ws}', không khớp với workspace yêu cầu '{exp_ws}'.",
                details={"article_workspace_id": art_ws, "expected_workspace_id": exp_ws}
            )
        if ref and hasattr(ref, "workspace_id") and str(ref.workspace_id) != exp_ws:
            raise SeoConsumerError(
                code="TENANT_SCOPE_VIOLATION",
                message=f"Artifact ref thuộc tenant '{ref.workspace_id}', không khớp với workspace yêu cầu '{exp_ws}'.",
                details={"ref_workspace_id": str(ref.workspace_id), "expected_workspace_id": exp_ws}
            )

    # 3. Kiểm tra article_id
    if expected_article_id is not None:
        exp_id = str(expected_article_id)
        art_id = str(article.article_id)
        if art_id != exp_id:
            raise SeoConsumerError(
                code="ARTICLE_ID_MISMATCH",
                message=f"article_id '{art_id}' không khớp với ID yêu cầu '{exp_id}'.",
                details={"article_id": art_id, "expected_article_id": exp_id}
            )

    return article


def read_seo_article_from_store(
    article_id: UUID | str,
    workspace_id: UUID | str,
    store: Mapping[str, Any],
) -> SeoArticle:
    """Đọc bài viết SEO từ kho lưu trữ (dict / repository lookup).

    Luôn ràng buộc đồng thời article_id và workspace_id để ngăn chặn triệt để
    truy vấn nhầm hoặc rò rỉ dữ liệu chéo tenant.
    """
    art_key = str(article_id)
    ws_key = str(workspace_id)

    raw_data = store.get(art_key)
    if raw_data is None:
        # Thử tìm theo composite key (ws:art_id) nếu có
        raw_data = store.get(f"{ws_key}:{art_key}")

    if raw_data is None:
        raise SeoConsumerError(
            code="ARTICLE_NOT_FOUND",
            message=f"Không tìm thấy bài viết SEO với ID '{art_key}' trong workspace '{ws_key}'.",
            details={"article_id": art_key, "workspace_id": ws_key}
        )

    article = parse_seo_article(raw_data)

    # Xác thực workspace_id
    if str(article.workspace_id) != ws_key:
        raise SeoConsumerError(
            code="TENANT_SCOPE_VIOLATION",
            message=f"Bài viết tìm thấy thuộc tenant '{article.workspace_id}', không thuộc tenant '{ws_key}'.",
            details={"article_workspace_id": str(article.workspace_id), "expected_workspace_id": ws_key}
        )

    return article
